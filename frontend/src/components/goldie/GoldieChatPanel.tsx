import { useRef, useEffect, useCallback, useState } from 'react'
import { X, RotateCcw } from 'lucide-react'
import { useGoldie } from '../../contexts/GoldieContext'
import { useGoldieStream } from '../../hooks/useGoldieStream'
import { goldieService } from '../../services/goldie'
import { useVisualViewport } from '../../hooks/useVisualViewport'
import { cn } from '../../lib/cn'
import type {
  SSEEvent,
  GoldieToolCallMessage,
  GoldieConfirmationMessage,
  GoldieActionCardMessage,
  GoldieNewsCardsMessage,
  GoldieErrorMessage,
  UserMessage as UserMessageType,
} from '../../types/goldie'

// Message components
import { UserMessage } from './messages/UserMessage'
import { GoldieMessage } from './messages/GoldieMessage'
import { ToolCallIndicator } from './messages/ToolCallIndicator'
import { ConfirmationCard } from './messages/ConfirmationCard'
import { ActionCard } from './messages/ActionCard'
import { NewsCards } from './messages/NewsCards'
import { ThinkingIndicator } from './messages/ThinkingIndicator'
import { ThinkingText } from './messages/ThinkingText'

// ── Suggestion chips ─────────────────────────────────────

const SUGGESTIONS = [
  "What's the best gold rate right now?",
  'Compare KJ vs CSV for gold 999',
  'Any gold news today?',
  'Show me all tracked dealers',
]

// ── Main component ───────────────────────────────────────

export default function GoldieChatPanel() {
  const {
    isOpen, closeChat, credits, refreshCredits,
    prefillQuery, clearPrefill,
    chatState: state, dispatch, resetChat,
  } = useGoldie()
  const { sendMessage, cancel } = useGoldieStream()
  const [inputValue, setInputValue] = useState('')
  const [isExiting, setIsExiting] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingDeltaRef = useRef('')
  const rafRef = useRef<number | null>(null)
  const viewportHeight = useVisualViewport()

  // Fetch credits on open
  useEffect(() => {
    if (isOpen) {
      refreshCredits()
      // Consume prefill query
      if (prefillQuery) {
        setInputValue(prefillQuery)
        clearPrefill()
      }
      // Focus input
      setTimeout(() => inputRef.current?.focus(), 350)
    }
  }, [isOpen, refreshCredits, prefillQuery, clearPrefill])

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [state.messages.length, state.messages[state.messages.length - 1]])

  // SSE event handler
  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'delta': {
          // Batch text deltas with rAF
          pendingDeltaRef.current += event.data.text
          if (!rafRef.current) {
            rafRef.current = requestAnimationFrame(() => {
              const delta = pendingDeltaRef.current
              pendingDeltaRef.current = ''
              rafRef.current = null
              if (delta) dispatch({ type: 'APPEND_TEXT_DELTA', delta })
            })
          }
          break
        }

        case 'tool_start': {
          const msg: GoldieToolCallMessage = {
            id: crypto.randomUUID(),
            role: 'goldie',
            kind: 'tool_call',
            toolName: event.data.name,
            toolLabel: event.data.label,
            status: 'running',
            createdAt: Date.now(),
          }
          dispatch({ type: 'ADD_GOLDIE_MESSAGE', message: msg })
          break
        }

        case 'tool_result':
          dispatch({
            type: 'RESOLVE_TOOL_CALL',
            toolName: event.data.name,
            summary: event.data.summary,
          })
          break

        case 'pending_action': {
          const msg: GoldieConfirmationMessage = {
            id: crypto.randomUUID(),
            role: 'goldie',
            kind: 'confirmation',
            nonce: event.data.nonce,
            actionType: event.data.action,
            summary: event.data.display.summary,
            details: event.data.display.details,
            status: 'pending',
            createdAt: Date.now(),
          }
          dispatch({ type: 'ADD_GOLDIE_MESSAGE', message: msg })
          break
        }

        case 'collapse_thinking':
          // LLM output planning text before calling tools — collapse it
          dispatch({ type: 'COLLAPSE_TO_THINKING' })
          break

        case 'news_articles': {
          const newsMsg: GoldieNewsCardsMessage = {
            id: crypto.randomUUID(),
            role: 'goldie',
            kind: 'news_cards',
            articles: event.data.articles,
            createdAt: Date.now(),
          }
          dispatch({ type: 'ADD_GOLDIE_MESSAGE', message: newsMsg })
          break
        }

        case 'suggested_action': {
          const actionMsg: GoldieActionCardMessage = {
            id: crypto.randomUUID(),
            role: 'goldie',
            kind: 'action_card',
            actionType: event.data.type,
            label: event.data.label,
            data: event.data.formula || event.data,
            status: 'available',
            createdAt: Date.now(),
          }
          dispatch({ type: 'ADD_GOLDIE_MESSAGE', message: actionMsg })
          break
        }

        case 'done':
          // Flush any remaining delta
          if (pendingDeltaRef.current) {
            dispatch({ type: 'APPEND_TEXT_DELTA', delta: pendingDeltaRef.current })
            pendingDeltaRef.current = ''
          }
          dispatch({ type: 'FINALIZE_STREAMING' })
          if (event.data.session_id) {
            dispatch({ type: 'SET_SESSION_ID', sessionId: event.data.session_id })
          }
          refreshCredits()
          break

        case 'error': {
          const errMsg: GoldieErrorMessage = {
            id: crypto.randomUUID(),
            role: 'goldie',
            kind: 'error',
            content: event.data.message,
            createdAt: Date.now(),
          }
          dispatch({ type: 'ADD_GOLDIE_MESSAGE', message: errMsg })
          dispatch({ type: 'FINALIZE_STREAMING' })
          break
        }
      }
    },
    [refreshCredits, dispatch],
  )

  // Send message
  const handleSend = useCallback(() => {
    const text = inputValue.trim()
    if (!text || state.isStreaming) return

    const userMsg: UserMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
      createdAt: Date.now(),
    }
    dispatch({ type: 'ADD_USER_MESSAGE', message: userMsg })
    setInputValue('')

    sendMessage(text, state.sessionId, handleSSEEvent)
  }, [inputValue, state.isStreaming, state.sessionId, sendMessage, handleSSEEvent, dispatch])

  // Confirm/cancel pending action
  const handleConfirm = useCallback(
    async (nonce: string, accepted: boolean) => {
      if (!state.sessionId) return
      dispatch({ type: 'RESOLVE_CONFIRMATION', nonce, accepted })
      try {
        const result = await goldieService.confirmAction(state.sessionId, nonce, accepted)
        // On successful confirm, tell WatchlistContext to refresh
        if (accepted && result.status === 'done') {
          window.dispatchEvent(new CustomEvent('watchlist:refresh'))
        }
      } catch {
        // Revert the card back to pending so user can retry
        dispatch({ type: 'REVERT_CONFIRMATION', nonce })
      }
    },
    [state.sessionId, dispatch],
  )

  // Close with animation
  const handleClose = useCallback(() => {
    cancel()
    setIsExiting(true)
    setTimeout(() => {
      setIsExiting(false)
      closeChat()
    }, 240)
  }, [closeChat, cancel])

  // New chat
  const handleNewChat = useCallback(() => {
    cancel()
    resetChat()
    setInputValue('')
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [cancel, resetChat])

  // Always mounted, but renders nothing when hidden
  if (!isOpen && !isExiting) return null

  const showSuggestions = state.messages.length === 0 && !state.isStreaming
  const showInput = credits === null || credits > 5

  return (
    <div
      className={cn(
        'fixed inset-0 z-[60] flex flex-col bg-background',
        isExiting ? 'goldie-panel-exit' : 'goldie-panel-enter',
      )}
      style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div
            className="siri-orb flex-shrink-0"
            style={{
              '--c1': '#fef3c7',
              '--c2': '#fcd34d',
              '--c3': '#f59e0b',
              '--bg': '#b45309',
              '--animation-duration': '4s',
              '--blur-amount': '2px',
              '--contrast-amount': '1.2',
              '--shadow-spread': '2px',
              '--dot-size': '1px',
              '--mask-radius': '0%',
              width: '32px',
              height: '32px',
            } as React.CSSProperties}
          />
          <span className="text-base font-semibold">SONA AI</span>
        </div>

        <div className="flex items-center gap-2">
          {credits !== null && (
            <span className="text-xs px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 font-medium">
              {credits} credits
            </span>
          )}
          {state.messages.length > 0 && (
            <button
              onClick={handleNewChat}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
              aria-label="New chat"
              title="New chat"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-muted transition-colors"
            aria-label="Close chat"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {/* Welcome state */}
        {state.messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-4">
              <div
                className="siri-orb"
                style={{
                  '--c1': '#fef3c7',
                  '--c2': '#fcd34d',
                  '--c3': '#f59e0b',
                  '--bg': '#b45309',
                  '--animation-duration': '4s',
                  '--blur-amount': '4px',
                  '--contrast-amount': '1.2',
                  '--shadow-spread': '6px',
                  '--dot-size': '1px',
                  '--mask-radius': '0%',
                  width: '64px',
                  height: '64px',
                } as React.CSSProperties}
              />
            </div>
            <h2 className="text-lg font-semibold mb-1">Hi, I'm SONA AI</h2>
            <p className="text-sm text-muted-foreground max-w-[260px]">
              Your bullion rate assistant. Ask me about gold prices, dealer comparisons, or market news.
            </p>
          </div>
        )}

        {/* Chat messages */}
        {state.messages.map((msg) => {
          if (msg.role === 'user') {
            return <UserMessage key={msg.id} message={msg} />
          }
          if ('kind' in msg) {
            switch (msg.kind) {
              case 'text':
              case 'error':
                return <GoldieMessage key={msg.id} message={msg} />
              case 'thinking':
                return <ThinkingIndicator key={msg.id} />
              case 'thinking_text':
                return <ThinkingText key={msg.id} message={msg} />
              case 'tool_call':
                return <ToolCallIndicator key={msg.id} message={msg} />
              case 'confirmation':
                return (
                  <ConfirmationCard
                    key={msg.id}
                    message={msg}
                    onResolve={handleConfirm}
                  />
                )
              case 'news_cards':
                return <NewsCards key={msg.id} message={msg} />
              case 'action_card':
                return (
                  <ActionCard
                    key={msg.id}
                    message={msg}
                    dispatch={dispatch}
                  />
                )
            }
          }
          return null
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggestion chips */}
      {showSuggestions && (
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar flex-shrink-0">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setInputValue(s)
                setTimeout(() => inputRef.current?.focus(), 50)
              }}
              className={cn(
                'whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium',
                'border border-amber-300/50 dark:border-amber-700/40',
                'bg-amber-50/50 dark:bg-amber-950/20',
                'text-amber-800 dark:text-amber-300',
                'hover:bg-amber-100/60 dark:hover:bg-amber-900/30',
                'active:scale-95 transition-all',
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div
        className="border-t border-border/50 bg-background/95 backdrop-blur-sm flex-shrink-0"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {showInput ? (
          <div className="flex items-center gap-2 px-4 py-3">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={
                state.hasPendingConfirmation
                  ? 'Confirm the action above first...'
                  : 'Ask about gold rates, news...'
              }
              disabled={state.hasPendingConfirmation}
              className={cn(
                'flex-1 bg-muted rounded-full px-4 py-2.5 text-sm',
                'placeholder:text-muted-foreground/60',
                'focus:outline-none focus:ring-2 focus:ring-amber-400/40',
                'disabled:opacity-50',
              )}
            />
            <button
              onClick={state.isStreaming ? cancel : handleSend}
              disabled={!inputValue.trim() && !state.isStreaming}
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
                'transition-all active:scale-90',
                state.isStreaming
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-amber-500 text-white disabled:opacity-40',
              )}
              aria-label={state.isStreaming ? 'Stop' : 'Send'}
            >
              {state.isStreaming ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 2L11 13" />
                  <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                </svg>
              )}
            </button>
          </div>
        ) : (
          <div className="px-4 py-3 text-center">
            <p className="text-sm text-muted-foreground">
              You've used most of your SONA AI credits for today. Come back tomorrow!
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
