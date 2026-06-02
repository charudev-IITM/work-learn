// ── Message types ──────────────────────────────────────────

export type MessageRole = 'user' | 'goldie'
export type MessageStatus = 'complete' | 'streaming' | 'error'

export interface UserMessage {
  id: string
  role: 'user'
  content: string
  createdAt: number
}

export interface GoldieTextMessage {
  id: string
  role: 'goldie'
  kind: 'text'
  content: string
  status: MessageStatus
  createdAt: number
}

export interface GoldieToolCallMessage {
  id: string
  role: 'goldie'
  kind: 'tool_call'
  toolName: string
  toolLabel: string
  status: 'running' | 'complete'
  resultSummary?: string
  createdAt: number
}

export interface GoldieConfirmationMessage {
  id: string
  role: 'goldie'
  kind: 'confirmation'
  nonce: string
  actionType: 'create_alert' | 'add_to_watchlist'
  summary: string
  details: Record<string, string | number>
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: number
}

export interface GoldieThinkingMessage {
  id: string
  role: 'goldie'
  kind: 'thinking'
  createdAt: number
}

export interface GoldieThinkingTextMessage {
  id: string
  role: 'goldie'
  kind: 'thinking_text'
  content: string
  createdAt: number
}

export interface GoldieErrorMessage {
  id: string
  role: 'goldie'
  kind: 'error'
  content: string
  createdAt: number
}

export interface GoldieActionCardMessage {
  id: string
  role: 'goldie'
  kind: 'action_card'
  actionType: string        // e.g. 'save_calculation'
  label: string             // e.g. 'Save as calculation'
  data: Record<string, any> // Action-specific payload (e.g. formula AST)
  status: 'available' | 'saving' | 'saved' | 'error'
  createdAt: number
}

export interface NewsArticleData {
  title: string
  summary: string
  source: string
  source_url: string
  published_at: string | null
}

export interface GoldieNewsCardsMessage {
  id: string
  role: 'goldie'
  kind: 'news_cards'
  articles: NewsArticleData[]
  createdAt: number
}

export type GoldieMessage =
  | GoldieTextMessage
  | GoldieToolCallMessage
  | GoldieConfirmationMessage
  | GoldieThinkingMessage
  | GoldieThinkingTextMessage
  | GoldieErrorMessage
  | GoldieActionCardMessage
  | GoldieNewsCardsMessage

export type ChatMessage = UserMessage | GoldieMessage

// ── SSE event types ──────────────────────────────────────────

export interface SSEDelta {
  type: 'delta'
  data: { text: string }
}

export interface SSEToolStart {
  type: 'tool_start'
  data: { name: string; label: string }
}

export interface SSEToolResult {
  type: 'tool_result'
  data: { name: string; summary: string }
}

export interface SSEPendingAction {
  type: 'pending_action'
  data: {
    nonce: string
    action: 'create_alert' | 'add_to_watchlist'
    display: { summary: string; details: Record<string, string | number> }
  }
}

export interface SSEDone {
  type: 'done'
  data: { session_id: string; credits_used: number; credits_remaining: number }
}

export interface SSEError {
  type: 'error'
  data: { code: string; message: string }
}

export interface SSECollapseThinking {
  type: 'collapse_thinking'
  data: Record<string, never>
}

export interface SSESuggestedAction {
  type: 'suggested_action'
  data: {
    type: string                    // e.g. 'save_calculation'
    label: string                   // e.g. 'Save as calculation'
    formula?: Record<string, any>   // Formula data for save_calculation
  }
}

export interface SSENewsArticles {
  type: 'news_articles'
  data: {
    articles: NewsArticleData[]
  }
}

export type SSEEvent =
  | SSEDelta
  | SSEToolStart
  | SSEToolResult
  | SSEPendingAction
  | SSECollapseThinking
  | SSESuggestedAction
  | SSENewsArticles
  | SSEDone
  | SSEError

// ── Chat state types ──────────────────────────────────────────

export interface ChatState {
  messages: ChatMessage[]
  isStreaming: boolean
  sessionId: string | null
  hasPendingConfirmation: boolean
}

export type ChatAction =
  | { type: 'ADD_USER_MESSAGE'; message: UserMessage }
  | { type: 'ADD_GOLDIE_MESSAGE'; message: ChatMessage }
  | { type: 'APPEND_TEXT_DELTA'; delta: string }
  | { type: 'FINALIZE_STREAMING' }
  | { type: 'SET_STREAMING'; value: boolean }
  | { type: 'SET_SESSION_ID'; sessionId: string }
  | { type: 'RESOLVE_CONFIRMATION'; nonce: string; accepted: boolean }
  | { type: 'REVERT_CONFIRMATION'; nonce: string }
  | { type: 'RESOLVE_TOOL_CALL'; toolName: string; summary: string }
  | { type: 'UPDATE_ACTION_CARD'; id: string; status: 'saving' | 'saved' | 'error' }
  | { type: 'COLLAPSE_TO_THINKING' }
  | { type: 'RESET_CHAT' }

// ── Context types ──────────────────────────────────────────

export interface GoldieContextType {
  isOpen: boolean
  openChat: (prefillQuery?: string) => void
  closeChat: () => void
  credits: number | null
  refreshCredits: () => Promise<void>
  prefillQuery: string | null
  clearPrefill: () => void
  chatState: ChatState
  dispatch: React.Dispatch<ChatAction>
  resetChat: () => void
}
