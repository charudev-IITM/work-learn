import { authenticatedApi } from './auth'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

export const goldieService = {
  /**
   * Stream a chat message via SSE. Returns the raw Response
   * so the caller can read the ReadableStream body.
   */
  async streamChat(message: string, sessionId?: string | null): Promise<Response> {
    const response = await fetch(`${API_BASE}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ message, session_id: sessionId }),
    })
    if (!response.ok) {
      throw new Error(`Chat failed: ${response.status}`)
    }
    return response
  },

  async getCredits(): Promise<{ credits_remaining: number; credits_total: number; plan_type: string; resets_at: string }> {
    const { data } = await authenticatedApi.get('/api/agent/credits')
    return data
  },

  async confirmAction(sessionId: string, nonce: string, confirmed: boolean): Promise<{ status: string; result?: Record<string, unknown> }> {
    const { data } = await authenticatedApi.post('/api/agent/confirm', {
      session_id: sessionId,
      nonce,
      confirmed,
    })
    return data
  },
}
