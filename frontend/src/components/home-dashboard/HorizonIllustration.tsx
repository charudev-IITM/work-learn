import { useTimeOfDay } from '../../hooks/useTimeOfDay'
import {
  getSkyGradient,
  getHorizonColor,
  getCelestialColor,
} from '../../lib/timeOfDayTheme'

// Star positions (fixed, only visible at night)
const STARS = [
  { left: '12%', top: '4px', delay: '0s' },
  { left: '35%', top: '8px', delay: '1.2s' },
  { left: '58%', top: '3px', delay: '2.5s' },
  { left: '78%', top: '10px', delay: '0.8s' },
  { left: '92%', top: '6px', delay: '1.8s' },
]

export function HorizonIllustration() {
  const { period, progress } = useTimeOfDay()
  const isNight = period === 'night'

  // Sun/moon horizontal position: maps progress (0→1) to ~10%→90% of width
  const orbLeft = 10 + progress * 80

  return (
    <div
      className="relative w-full h-6 overflow-hidden flex-shrink-0"
      style={{
        background: getSkyGradient(period, progress),
        transition: 'background 3000ms ease',
      }}
    >
      {/* Stars — only visible at night */}
      {STARS.map((star, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white star-twinkle"
          style={{
            width: 2,
            height: 2,
            left: star.left,
            top: star.top,
            animationDelay: star.delay,
            opacity: isNight ? 0.8 : 0,
            transition: 'opacity 3000ms ease',
          }}
        />
      ))}

      {/* Sun / Moon orb */}
      <div
        className="absolute top-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: 8,
          height: 8,
          left: `${orbLeft}%`,
          backgroundColor: getCelestialColor(period),
          boxShadow: isNight
            ? `0 0 6px ${getCelestialColor(period)}`
            : `0 0 8px ${getCelestialColor(period)}, 0 0 16px ${getCelestialColor(period)}40`,
          transition: 'left 3000ms ease, background-color 3000ms ease, box-shadow 3000ms ease',
        }}
      />

      {/* Horizon line at bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(to right, transparent, ${getHorizonColor(period)}, transparent)`,
          transition: 'background 3000ms ease',
        }}
      />
    </div>
  )
}
