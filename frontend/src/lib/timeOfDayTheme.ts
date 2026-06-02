import type { TimePeriod } from '../hooks/useTimeOfDay'

// ─── Orb colors (dark mode ambient background) ───

interface OrbColors {
  orb1: string
  orb2: string
  orb3: string
  orb4: string
}

const ORB_PALETTE: Record<TimePeriod, OrbColors> = {
  morning: {
    orb1: 'rgba(245, 158, 11, 0.25)',   // amber-500/25
    orb2: 'rgba(251, 146, 60, 0.20)',   // orange-400/20
    orb3: 'rgba(252, 211, 77, 0.15)',   // amber-300/15
    orb4: 'rgba(245, 158, 11, 0.10)',   // amber-500/10
  },
  afternoon: {
    orb1: 'rgba(99, 102, 241, 0.25)',   // indigo-500/25 (default)
    orb2: 'rgba(168, 85, 247, 0.20)',   // purple-500/20
    orb3: 'rgba(245, 158, 11, 0.15)',   // amber-500/15
    orb4: 'rgba(129, 140, 248, 0.10)',  // indigo-400/10
  },
  evening: {
    orb1: 'rgba(168, 85, 247, 0.25)',   // purple-500/25
    orb2: 'rgba(244, 63, 94, 0.20)',    // rose-500/20
    orb3: 'rgba(139, 92, 246, 0.18)',   // violet-500/18
    orb4: 'rgba(192, 132, 252, 0.12)',  // purple-400/12
  },
  night: {
    orb1: 'rgba(67, 56, 202, 0.25)',    // indigo-700/25
    orb2: 'rgba(55, 48, 163, 0.22)',    // indigo-800/22
    orb3: 'rgba(79, 70, 229, 0.15)',    // indigo-600/15
    orb4: 'rgba(49, 46, 129, 0.12)',    // indigo-900/12
  },
}

export function getOrbColors(period: TimePeriod, _progress: number): OrbColors {
  return ORB_PALETTE[period]
}

// ─── Accent HSL drift ───

const ACCENT_HUES: Record<TimePeriod, number> = {
  morning: 206,    // warmer blue
  afternoon: 221,  // default
  evening: 236,    // cooler
  night: 230,      // deep blue
}

export function getAccentHSL(period: TimePeriod, _progress: number): string {
  const hue = ACCENT_HUES[period]
  return `${hue} 83% 53%`
}

// ─── Background tint (light mode) ───

const BACKGROUND_TINTS: Record<TimePeriod, string> = {
  morning: 'rgba(255, 247, 237, 0.5)',    // warm cream
  afternoon: 'rgba(255, 255, 255, 0)',     // neutral (transparent)
  evening: 'rgba(224, 231, 255, 0.3)',     // cool indigo tint
  night: 'rgba(199, 210, 254, 0.25)',      // deeper blue tint
}

export function getBackgroundTint(period: TimePeriod): string {
  return BACKGROUND_TINTS[period]
}

// ─── Sky gradient (for HorizonIllustration) ───

const SKY_GRADIENTS: Record<TimePeriod, string> = {
  morning: 'linear-gradient(to right, #fde68a, #fed7aa, #bae6fd, #93c5fd)',
  afternoon: 'linear-gradient(to right, #93c5fd, #bfdbfe, #e0e7ff, #bfdbfe, #93c5fd)',
  evening: 'linear-gradient(to right, #fbbf24, #f97316, #e879f9, #8b5cf6)',
  night: 'linear-gradient(to right, #1e1b4b, #312e81, #1e3a5f, #312e81, #1e1b4b)',
}

export function getSkyGradient(period: TimePeriod, _progress: number): string {
  return SKY_GRADIENTS[period]
}

// ─── Horizon line color ───

export function getHorizonColor(period: TimePeriod): string {
  switch (period) {
    case 'morning': return 'rgba(251, 191, 36, 0.6)'   // amber
    case 'afternoon': return 'rgba(255, 255, 255, 0.4)'
    case 'evening': return 'rgba(249, 115, 22, 0.5)'    // orange
    case 'night': return 'rgba(199, 210, 254, 0.2)'     // faint indigo
  }
}

// ─── Sun/Moon orb color ───

export function getCelestialColor(period: TimePeriod): string {
  switch (period) {
    case 'morning': return '#fbbf24'   // amber-400
    case 'afternoon': return '#facc15' // yellow-400
    case 'evening': return '#f97316'   // orange-500
    case 'night': return '#c7d2fe'     // indigo-200
  }
}
