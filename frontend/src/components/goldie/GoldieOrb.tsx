import { useGoldie } from '../../contexts/GoldieContext'
import { cn } from '../../lib/cn'

export function GoldieOrb() {
  const { isOpen, openChat } = useGoldie()

  return (
    <button
      onClick={() => openChat()}
      aria-label="Open SONA AI assistant"
      className={cn(
        'fixed z-50',
        'active:scale-90 transition-transform duration-200',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:rounded-full',
        isOpen && 'pointer-events-none opacity-0',
      )}
      style={{
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 4px)',
      }}
    >
      {/* SmoothUI Siri orb — golden palette tuned for 56px */}
      <div
        className="siri-orb"
        style={{
          '--c1': '#fef3c7',  // amber-100 (bright white-gold)
          '--c2': '#fcd34d',  // amber-300 (vivid gold)
          '--c3': '#f59e0b',  // amber-500 (rich gold)
          '--bg': '#b45309',  // amber-700 (warm depth)
          '--animation-duration': '4s',
          '--blur-amount': '3px',
          '--contrast-amount': '1.2',
          '--shadow-spread': '4px',
          '--dot-size': '1px',
          '--mask-radius': '0%',
          width: '56px',
          height: '56px',
        } as React.CSSProperties}
      />
    </button>
  )
}
