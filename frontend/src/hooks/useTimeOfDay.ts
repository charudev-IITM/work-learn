import { useState, useEffect } from 'react'

export type TimePeriod = 'morning' | 'afternoon' | 'evening' | 'night'

export interface TimeOfDay {
  period: TimePeriod
  istHour: number
  istMinutes: number   // total minutes since midnight
  progress: number     // 0→1 within current period
}

// Period breakpoints in IST (minutes since midnight)
const PERIODS: { period: TimePeriod; start: number; duration: number }[] = [
  { period: 'morning',   start: 5 * 60,  duration: 7 * 60 },   // 05:00–11:59
  { period: 'afternoon', start: 12 * 60, duration: 5 * 60 },   // 12:00–16:59
  { period: 'evening',   start: 17 * 60, duration: 4 * 60 },   // 17:00–20:59
  // night: 21:00–04:59 (8h, wraps midnight)
]

function computeTimeOfDay(): TimeOfDay {
  const now = new Date()
  const istStr = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false })
  const [, timePart] = istStr.split(', ')
  const [h, m] = timePart.split(':').map(Number)
  const totalMinutes = h * 60 + m

  for (const { period, start, duration } of PERIODS) {
    if (totalMinutes >= start && totalMinutes < start + duration) {
      return {
        period,
        istHour: h,
        istMinutes: totalMinutes,
        progress: (totalMinutes - start) / duration,
      }
    }
  }

  // Night: 21:00–04:59 (wraps midnight, 8h = 480 min)
  const nightStart = 21 * 60
  const nightDuration = 8 * 60
  const nightElapsed = totalMinutes >= nightStart
    ? totalMinutes - nightStart
    : totalMinutes + (24 * 60 - nightStart)

  return {
    period: 'night',
    istHour: h,
    istMinutes: totalMinutes,
    progress: nightElapsed / nightDuration,
  }
}

export function useTimeOfDay(): TimeOfDay {
  const [time, setTime] = useState(computeTimeOfDay)

  useEffect(() => {
    const id = setInterval(() => setTime(computeTimeOfDay()), 60_000)
    return () => clearInterval(id)
  }, [])

  return time
}
