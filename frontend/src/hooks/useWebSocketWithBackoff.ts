import { useEffect, useState, useRef, useCallback } from 'react'

export interface WebSocketData {
  type: string
  competitor: string
  rates: Array<{
    script_name: string
    symbol: string
    buy_rate?: number
    sell_rate?: number
    high_rate?: number
    low_rate?: number
    timestamp: string
  }>
}

const MAX_BACKOFF_MS = 30_000 // 30 seconds cap
const BASE_DELAY_MS = 1_000  // 1 second base

/**
 * Full-jitter exponential backoff: delay = random(0, min(cap, base * 2^attempt))
 * Prevents thundering herd when server restarts with many clients.
 */
function getBackoffDelay(attempt: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt))
  return Math.random() * exponential
}

export function useWebSocketWithBackoff(
  onMessage: (data: WebSocketData) => void,
  isAuthenticated?: boolean
) {
  const [isConnected, setIsConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const attemptRef = useRef(0)
  const connLimitAttemptRef = useRef(0) // separate counter for 4008 retries
  const onMessageRef = useRef(onMessage)
  const isAuthenticatedRef = useRef(isAuthenticated)
  // Tracks whether the current effect is active — prevents StrictMode
  // cleanup from scheduling reconnects that race with the second mount.
  const mountedRef = useRef(false)

  onMessageRef.current = onMessage
  isAuthenticatedRef.current = isAuthenticated

  const connect = useCallback(() => {
    // Tear down any previous connection before creating a new one
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = undefined
    }
    if (wsRef.current) {
      wsRef.current.onclose = null // prevent onclose from firing during teardown
      wsRef.current.close()
      wsRef.current = null
    }

    if (!mountedRef.current) return

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const wsUrl = `${protocol}//${window.location.host}/ws/rates`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (ws !== wsRef.current) return // stale socket
        setIsConnected(true)
        attemptRef.current = 0
        connLimitAttemptRef.current = 0
      }

      ws.onmessage = (event) => {
        if (ws !== wsRef.current) return
        try {
          const data = JSON.parse(event.data)

          // Handle session displacement — user signed in elsewhere
          if (data.type === 'session_displaced') {
            sessionStorage.setItem('auth:displaced_msg', data.message || 'Your session was signed in on another device.')
            window.dispatchEvent(new CustomEvent('auth:session-displaced'))
            return
          }

          // Handle force logout — admin action or ban
          if (data.type === 'force_logout') {
            sessionStorage.setItem('auth:displaced_msg', data.reason || 'Your account has been suspended.')
            window.dispatchEvent(new CustomEvent('auth:session-displaced'))
            return
          }

          // Handle security warning — abuse detection
          if (data.type === 'security_warning') {
            window.dispatchEvent(new CustomEvent('security:warning', { detail: data }))
            return
          }

          // Handle admin announcements
          if (data.type === 'announcement') {
            window.dispatchEvent(new CustomEvent('admin:announcement', { detail: data }))
            return
          }

          onMessageRef.current(data)
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
        }
      }

      ws.onclose = (event) => {
        if (ws !== wsRef.current) return // stale socket
        setIsConnected(false)

        // Don't reconnect on session invalidation or preview expiry
        if (event.code === 4003 || event.code === 4007) {
          if (event.code === 4007 && !sessionStorage.getItem('auth:displaced_msg')) {
            sessionStorage.setItem('auth:displaced_msg', 'Your session has been invalidated.')
            window.dispatchEvent(new CustomEvent('auth:session-displaced'))
          }
          return
        }

        // Too many connections — retry with backoff + jitter.  Backend prunes
        // stale entries from dead pods on each register attempt, so the first
        // retry usually succeeds.  Give up after 6 attempts (~90s total)
        // to avoid infinite retries when user genuinely has too many tabs.
        // Uses a separate counter so normal reconnects don't eat the budget.
        if (event.code === 4008) {
          if (mountedRef.current && isAuthenticatedRef.current && connLimitAttemptRef.current < 6) {
            const exponential = Math.min(MAX_BACKOFF_MS, 5_000 * Math.pow(2, connLimitAttemptRef.current))
            const delay = Math.random() * exponential // full jitter to avoid thundering herd
            connLimitAttemptRef.current += 1
            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && isAuthenticatedRef.current) {
                connect()
              }
            }, delay)
          }
          return
        }

        // Only reconnect if the effect is still mounted
        if (mountedRef.current && isAuthenticatedRef.current) {
          const delay = getBackoffDelay(attemptRef.current)
          attemptRef.current += 1
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && isAuthenticatedRef.current) {
              connect()
            }
          }, delay)
        }
      }

      ws.onerror = () => {
        if (ws !== wsRef.current) return
        setIsConnected(false)
      }
    } catch (error) {
      console.error('Failed to connect WebSocket:', error)
      setIsConnected(false)
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    if (isAuthenticated) {
      attemptRef.current = 0
      connect()
    } else {
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
      setIsConnected(false)
    }

    return () => {
      mountedRef.current = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = undefined
      }
      if (wsRef.current) {
        wsRef.current.onclose = null // prevent reconnect scheduling
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect, isAuthenticated])

  return { isConnected }
}
