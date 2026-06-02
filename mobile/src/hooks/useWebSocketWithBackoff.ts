import { useEffect, useState, useRef, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

export interface WebSocketData {
  type: string;
  competitor: string;
  rates: Array<{
    script_name: string;
    symbol: string;
    buy_rate?: number;
    sell_rate?: number;
    high_rate?: number;
    low_rate?: number;
    timestamp: string;
  }>;
}

const MAX_BACKOFF_MS = 30_000;
const BASE_DELAY_MS = 1_000;
const TOKEN_KEY = 'auth_token';

function getBackoffDelay(attempt: number): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_DELAY_MS * Math.pow(2, attempt));
  return Math.random() * exponential;
}

function getWsUrl(): string {
  const apiUrl = Constants.expoConfig?.extra?.apiUrl ?? 'http://localhost:8888';
  // Convert http(s) to ws(s)
  return apiUrl.replace(/^http/, 'ws') + '/ws/rates';
}

export function useWebSocketWithBackoff(
  onMessage: (data: WebSocketData) => void,
  isAuthenticated?: boolean
) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptRef = useRef(0);
  const onMessageRef = useRef(onMessage);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const mountedRef = useRef(false);

  onMessageRef.current = onMessage;
  isAuthenticatedRef.current = isAuthenticated;

  const connect = useCallback(async () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    if (!mountedRef.current) return;

    try {
      // Bearer token passed as query param for WebSocket auth
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (!token) return;

      const wsUrl = `${getWsUrl()}?token=${token}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (ws !== wsRef.current) return;
        setIsConnected(true);
        attemptRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (ws !== wsRef.current) return;
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        if (ws !== wsRef.current) return;
        setIsConnected(false);
        if (mountedRef.current && isAuthenticatedRef.current) {
          const delay = getBackoffDelay(attemptRef.current);
          attemptRef.current += 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current && isAuthenticatedRef.current) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        if (ws !== wsRef.current) return;
        setIsConnected(false);
      };
    } catch (error) {
      console.error('Failed to connect WebSocket:', error);
      setIsConnected(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    if (isAuthenticated) {
      attemptRef.current = 0;
      connect();
    } else {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsConnected(false);
    }

    return () => {
      mountedRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect, isAuthenticated]);

  return { isConnected };
}
