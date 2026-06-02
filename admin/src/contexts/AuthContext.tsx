import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo } from 'react'
import { authService, authStorage, type AuthUser } from '../services/auth'

type FlowStep = 'login' | 'authenticated' | 'access_denied'

interface AuthState {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  flowStep: FlowStep
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

type AuthAction =
  | { type: 'AUTH_START' }
  | { type: 'AUTH_SUCCESS'; payload: { user: AuthUser } }
  | { type: 'AUTH_ERROR'; payload: string }
  | { type: 'AUTH_LOGOUT' }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'ACCESS_DENIED' }

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  flowStep: 'login',
}

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'AUTH_START':
      return { ...state, isLoading: true, error: null }
    case 'AUTH_SUCCESS':
      return {
        ...state,
        user: action.payload.user,
        isAuthenticated: true,
        isLoading: false,
        error: null,
        flowStep: 'authenticated',
      }
    case 'AUTH_ERROR':
      return { ...state, isLoading: false, error: action.payload }
    case 'AUTH_LOGOUT':
      return { ...initialState, isLoading: false }
    case 'CLEAR_ERROR':
      return { ...state, error: null }
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
    case 'ACCESS_DENIED':
      return {
        ...state,
        flowStep: 'access_denied',
        isLoading: false,
        error: 'This account does not have admin access.',
      }
    default:
      return state
  }
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, initialState)

  // Check existing auth on mount
  useEffect(() => {
    const init = async () => {
      const existingUser = authStorage.getUser()
      if (existingUser) {
        const isValid = await authService.validateToken()
        if (isValid) {
          if (!existingUser.is_admin) {
            dispatch({ type: 'ACCESS_DENIED' })
            return
          }
          dispatch({ type: 'AUTH_SUCCESS', payload: { user: existingUser } })
          return
        }
      }
      dispatch({ type: 'SET_LOADING', payload: false })
    }
    init()
  }, [])

  // Listen for unauthorized events
  useEffect(() => {
    const handle = () => dispatch({ type: 'AUTH_LOGOUT' })
    window.addEventListener('auth:unauthorized', handle)
    return () => window.removeEventListener('auth:unauthorized', handle)
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    dispatch({ type: 'AUTH_START' })
    try {
      const result = await authService.login(username, password)
      if (!result.user.is_admin) {
        dispatch({ type: 'ACCESS_DENIED' })
        await authService.logout()
        return
      }
      dispatch({ type: 'AUTH_SUCCESS', payload: { user: result.user } })
    } catch (error: unknown) {
      dispatch({ type: 'AUTH_ERROR', payload: (error as Error).message || 'Login failed' })
      throw error
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authService.logout()
    } catch { /* silent */ } finally {
      dispatch({ type: 'AUTH_LOGOUT' })
    }
  }, [])

  const clearError = useCallback(() => dispatch({ type: 'CLEAR_ERROR' }), [])

  const value = useMemo<AuthContextType>(() => ({
    ...state, login, logout, clearError,
  }), [state, login, logout, clearError])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
