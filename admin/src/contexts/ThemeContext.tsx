import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'
type ActualTheme = 'light' | 'dark'

interface ThemeContextType {
  theme: Theme
  actualTheme: ActualTheme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextType | null>(null)

const STORAGE_KEY = 'admin_theme'

function getSystemTheme(): ActualTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY) as Theme) || 'system'
    } catch {
      return 'system'
    }
  })

  const [systemTheme, setSystemTheme] = useState<ActualTheme>(getSystemTheme)
  const actualTheme = theme === 'system' ? systemTheme : theme

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => setSystemTheme(e.matches ? 'dark' : 'light')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', actualTheme === 'dark')
  }, [actualTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch { /* silent */ }
  }, [])

  const value = useMemo(() => ({ theme, actualTheme, setTheme }), [theme, actualTheme, setTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
