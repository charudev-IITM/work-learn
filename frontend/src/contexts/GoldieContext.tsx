import React, { createContext, useContext, useState, useCallback, useReducer } from 'react'
import { goldieService } from '../services/goldie'
import type {
  GoldieContextType,
  ChatState,
  ChatAction,
  GoldieTextMessage,
  GoldieThinkingMessage,
  GoldieThinkingTextMessage,
  GoldieToolCallMessage,
  GoldieConfirmationMessage,
} from '../types/goldie'

// ── Chat reducer ─────────────────────────────────────────

function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_USER_MESSAGE': {
      const thinkingMsg: GoldieThinkingMessage = {
        id: crypto.randomUUID(),
        role: 'goldie',
        kind: 'thinking',
        createdAt: Date.now(),
      }
      return { ...state, messages: [...state.messages, action.message, thinkingMsg], isStreaming: true }
    }

    case 'ADD_GOLDIE_MESSAGE': {
      // Remove thinking message when real content arrives
      const filtered = state.messages.filter(
        (m) => !(m.role === 'goldie' && 'kind' in m && m.kind === 'thinking'),
      )
      return {
        ...state,
        messages: [...filtered, action.message],
        hasPendingConfirmation:
          state.hasPendingConfirmation ||
          ('kind' in action.message && action.message.kind === 'confirmation'),
      }
    }

    case 'APPEND_TEXT_DELTA': {
      // Remove thinking message when text starts flowing
      const msgs = state.messages.filter(
        (m) => !(m.role === 'goldie' && 'kind' in m && m.kind === 'thinking'),
      )
      const last = msgs[msgs.length - 1]
      if (last && last.role === 'goldie' && 'kind' in last && last.kind === 'text' && last.status === 'streaming') {
        msgs[msgs.length - 1] = { ...last, content: last.content + action.delta }
      } else {
        // Create new streaming text message
        const newMsg: GoldieTextMessage = {
          id: crypto.randomUUID(),
          role: 'goldie',
          kind: 'text',
          content: action.delta,
          status: 'streaming',
          createdAt: Date.now(),
        }
        msgs.push(newMsg)
      }
      return { ...state, messages: msgs }
    }

    case 'FINALIZE_STREAMING': {
      const msgs = state.messages
        // Clear any leftover thinking messages
        .filter((m) => !(m.role === 'goldie' && 'kind' in m && m.kind === 'thinking'))
        .map((m) => {
          if (m.role === 'goldie' && 'kind' in m && m.kind === 'text' && m.status === 'streaming') {
            return { ...m, status: 'complete' as const }
          }
          return m
        })
      return { ...state, messages: msgs, isStreaming: false, hasPendingConfirmation: false }
    }

    case 'SET_STREAMING':
      return { ...state, isStreaming: action.value }

    case 'SET_SESSION_ID':
      return { ...state, sessionId: action.sessionId }

    case 'RESOLVE_TOOL_CALL': {
      // Find the last running tool_call with matching name and mark it complete
      const msgs = [...state.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (
          m.role === 'goldie' &&
          'kind' in m &&
          m.kind === 'tool_call' &&
          (m as GoldieToolCallMessage).toolName === action.toolName &&
          (m as GoldieToolCallMessage).status === 'running'
        ) {
          msgs[i] = { ...m, status: 'complete', resultSummary: action.summary } as GoldieToolCallMessage
          break
        }
      }
      return { ...state, messages: msgs }
    }

    case 'RESOLVE_CONFIRMATION': {
      const msgs = state.messages.map((m) => {
        if (
          m.role === 'goldie' &&
          'kind' in m &&
          m.kind === 'confirmation' &&
          (m as GoldieConfirmationMessage).nonce === action.nonce
        ) {
          return { ...m, status: action.accepted ? 'accepted' : 'rejected' } as GoldieConfirmationMessage
        }
        return m
      })
      return { ...state, messages: msgs, hasPendingConfirmation: false }
    }

    case 'REVERT_CONFIRMATION': {
      // Revert a failed confirmation back to pending so user can retry
      const msgs = state.messages.map((m) => {
        if (
          m.role === 'goldie' &&
          'kind' in m &&
          m.kind === 'confirmation' &&
          (m as GoldieConfirmationMessage).nonce === action.nonce
        ) {
          return { ...m, status: 'pending' } as GoldieConfirmationMessage
        }
        return m
      })
      return { ...state, messages: msgs, hasPendingConfirmation: true }
    }

    case 'UPDATE_ACTION_CARD': {
      const msgs = state.messages.map((m) => {
        if (m.role === 'goldie' && 'kind' in m && m.kind === 'action_card' && m.id === action.id) {
          return { ...m, status: action.status }
        }
        return m
      })
      return { ...state, messages: msgs }
    }

    case 'COLLAPSE_TO_THINKING': {
      // Convert the last streaming/complete text message into a collapsible thinking block
      const msgs = [...state.messages]
      for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i]
        if (m.role === 'goldie' && 'kind' in m && m.kind === 'text') {
          const thinkingText: GoldieThinkingTextMessage = {
            id: m.id,
            role: 'goldie',
            kind: 'thinking_text',
            content: (m as GoldieTextMessage).content,
            createdAt: m.createdAt,
          }
          msgs[i] = thinkingText
          break
        }
      }
      return { ...state, messages: msgs }
    }

    case 'RESET_CHAT':
      return { messages: [], isStreaming: false, sessionId: null, hasPendingConfirmation: false }

    default:
      return state
  }
}

const INITIAL_CHAT_STATE: ChatState = {
  messages: [],
  isStreaming: false,
  sessionId: null,
  hasPendingConfirmation: false,
}

// ── Context ─────────────────────────────────────────

const GoldieContext = createContext<GoldieContextType | null>(null)

export function GoldieProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [prefillQuery, setPrefillQuery] = useState<string | null>(null)
  const [credits, setCredits] = useState<number | null>(null)
  const [chatState, dispatch] = useReducer(chatReducer, INITIAL_CHAT_STATE)

  const openChat = useCallback((query?: string) => {
    if (query) setPrefillQuery(query)
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setIsOpen(false)
  }, [])

  const clearPrefill = useCallback(() => {
    setPrefillQuery(null)
  }, [])

  const refreshCredits = useCallback(async () => {
    try {
      const data = await goldieService.getCredits()
      setCredits(data.credits_remaining)
    } catch {
      // Silent — credits will show as null (loading state)
    }
  }, [])

  const resetChat = useCallback(() => {
    dispatch({ type: 'RESET_CHAT' })
  }, [])

  return (
    <GoldieContext.Provider
      value={{
        isOpen,
        openChat,
        closeChat,
        credits,
        refreshCredits,
        prefillQuery,
        clearPrefill,
        chatState,
        dispatch,
        resetChat,
      }}
    >
      {children}
    </GoldieContext.Provider>
  )
}

export function useGoldie() {
  const context = useContext(GoldieContext)
  if (!context) throw new Error('useGoldie must be used within GoldieProvider')
  return context
}
