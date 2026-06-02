import axios from 'axios'
import { initApiClient } from '@comp-intel/shared/services/apiClient'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? ''

const authApi = axios.create({
  baseURL: `${API_BASE_URL}/api/auth`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
})

const USER_KEY = 'admin_user'

export const authStorage = {
  getUser: () => {
    try {
      const userJson = localStorage.getItem(USER_KEY)
      return userJson ? JSON.parse(userJson) : null
    } catch {
      return null
    }
  },

  setUser: (user: unknown): void => {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } catch { /* silent */ }
  },

  removeUser: (): void => {
    try {
      localStorage.removeItem(USER_KEY)
    } catch { /* silent */ }
  },

  clear: (): void => {
    authStorage.removeUser()
  },
}

authApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authStorage.clear()
    }
    return Promise.reject(error)
  }
)

export const authService = {
  async login(username: string, password: string): Promise<{ user: AuthUser; message: string }> {
    try {
      const response = await authApi.post('/login', { username, password })
      const data = response.data
      if (data.user?.id) {
        authStorage.setUser(data.user)
      }
      return data
    } catch (error: unknown) {
      const message = (error as { response?: { data?: { detail?: string } } }).response?.data?.detail || 'Invalid credentials.'
      throw new Error(message)
    }
  },

  async validateToken(): Promise<boolean> {
    try {
      await authApi.get('/validate')
      return true
    } catch {
      authStorage.clear()
      return false
    }
  },

  async logout(): Promise<void> {
    try {
      await authApi.post('/logout')
    } catch { /* silent */ } finally {
      authStorage.clear()
    }
  },
}

/** Minimal user shape from /api/auth/login response. */
export interface AuthUser {
  id: string
  username: string
  phone?: string
  name?: string
  is_admin: boolean
}

// Authenticated API instance for admin service calls
const createAuthenticatedApi = () => {
  const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    withCredentials: true,
  })

  api.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        authStorage.clear()
        window.dispatchEvent(new CustomEvent('auth:unauthorized'))
      }
      return Promise.reject(error)
    }
  )

  return api
}

export const authenticatedApi = createAuthenticatedApi()

// Initialize shared API client singleton so @comp-intel/shared services can make authenticated calls
initApiClient(authenticatedApi)

export default authService
