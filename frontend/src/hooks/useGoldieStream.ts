import { useRef, useState, useCallback } from 'react'
import { goldieService } from '../services/goldie'
import type { SSEEvent } from '../types/goldie'

type StreamStatus = 'idle' | 'streaming' | 'error'

export function useGoldieStream() {
  const [status, setStatus] = useState<StreamStatus>('idle')
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
  }, [])

  const sendMessage = useCallback(
    async (
      message: string,
      sessionId: string | null,
      onEvent: (event: SSEEvent) => void,
    ) => {
      cancel()
      const controller = new AbortController()
      abortRef.current = controller
      setStatus('streaming')

      try {
        const response = await goldieService.streamChat(message, sessionId)
        const reader = response.body?.getReader()
        if (!reader) {
          throw new Error('No response body')
        }

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (controller.signal.aborted) break

          buffer += decoder.decode(value, { stream: true })

          // Process complete SSE lines
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? '' // Keep incomplete line in buffer

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const jsonStr = line.slice(6).trim()
            if (!jsonStr || jsonStr === '[DONE]') continue

            try {
              const event = JSON.parse(jsonStr) as SSEEvent
              onEvent(event)
            } catch {
              // Skip malformed JSON
            }
          }
        }

        setStatus('idle')
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setStatus('error')
          onEvent({
            type: 'error',
            data: { code: 'NETWORK', message: 'Connection lost. Please try again.' },
          })
        }
      }
    },
    [cancel],
  )

  return { status, sendMessage, cancel }
}
