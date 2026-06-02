import { Activity, Sun, Moon, Monitor } from 'lucide-react'
import { Button } from '../ui/button'
import { useTheme } from '../../contexts/ThemeContext'

interface HeaderProps {
  isConnected: boolean
}

export function Header({ isConnected }: HeaderProps) {
  const { theme, setTheme, actualTheme } = useTheme()

  const cycleTheme = () => {
    if (theme === 'light') {
      setTheme('dark')
    } else if (theme === 'dark') {
      setTheme('system')
    } else {
      setTheme('light')
    }
  }

  const getThemeIcon = () => {
    if (theme === 'system') {
      return <Monitor className="h-4 w-4" />
    } else if (actualTheme === 'dark') {
      return <Moon className="h-4 w-4" />
    } else {
      return <Sun className="h-4 w-4" />
    }
  }

  const getThemeLabel = () => {
    if (theme === 'system') {
      return `System (${actualTheme})`
    } else {
      return theme.charAt(0).toUpperCase() + theme.slice(1)
    }
  }

  return (
    <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-semibold">Bullion Competitive Intelligence</h1>
          <div className={`connection-indicator ${isConnected ? 'connection-connected' : 'connection-disconnected'}`}>
            <Activity className="w-3 h-3 mr-1" />
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
        </div>
        
        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground">
            Last updated: {new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.hash = window.location.hash === '#ticker' ? '' : '#ticker'
            }}
          >
            {window.location.hash === '#ticker' ? '📊 Dashboard' : '✨ Ticker'}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={cycleTheme}
            title={`Current theme: ${getThemeLabel()}`}
          >
            {getThemeIcon()}
          </Button>
        </div>
      </div>
    </header>
  )
}