import { useState, useEffect } from 'react'

export interface MarketStatusInfo {
  isOpen: boolean
  label: string
}

// MCX holidays for 2025-2026 (IST dates). Update annually.
const INDIAN_HOLIDAYS = new Set([
  '2025-10-02', '2025-11-05', '2025-11-14', '2025-12-25',
  '2026-01-26', '2026-03-14', '2026-03-30', '2026-04-02',
  '2026-04-10', '2026-04-14', '2026-05-01', '2026-08-15',
  '2026-10-02', '2026-11-04', '2026-12-25',
])

function getISTComponents(): { dayOfWeek: number; totalMinutes: number; dateStr: string } {
  const now = new Date()
  const istStr = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false })
  // en-CA: "2026-03-11, 14:30:00"
  const [datePart, timePart] = istStr.split(', ')
  const [h, m] = timePart.split(':').map(Number)
  const dayOfWeek = new Date(datePart + 'T12:00:00+05:30').getDay()
  return { dayOfWeek, totalMinutes: h * 60 + m, dateStr: datePart }
}

function getETComponents(): { dayName: string; hours: number } {
  const now = new Date()
  const dayName = now.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long' })
  const etStr = now.toLocaleString('en-CA', { timeZone: 'America/New_York', hour12: false })
  const [, timePart] = etStr.split(', ')
  const [h] = timePart.split(':').map(Number)
  return { dayName, hours: h }
}

function computeMCXStatus(): MarketStatusInfo {
  const { dayOfWeek, totalMinutes, dateStr } = getISTComponents()
  if (dayOfWeek === 0 || dayOfWeek === 6) return { isOpen: false, label: 'MCX Closed' }
  if (INDIAN_HOLIDAYS.has(dateStr)) return { isOpen: false, label: 'MCX Holiday' }
  // MCX: Mon-Fri 9:00 AM - 11:30 PM IST
  const open = 9 * 60       // 09:00
  const close = 23 * 60 + 30 // 23:30
  return totalMinutes >= open && totalMinutes < close
    ? { isOpen: true, label: 'MCX Open' }
    : { isOpen: false, label: 'MCX Closed' }
}

function computeCOMEXStatus(): MarketStatusInfo {
  const { dayName, hours } = getETComponents()
  // COMEX electronic: Sun 6PM ET to Fri 5PM ET
  if (dayName === 'Saturday') return { isOpen: false, label: 'COMEX Closed' }
  if (dayName === 'Sunday' && hours < 18) return { isOpen: false, label: 'COMEX Closed' }
  if (dayName === 'Friday' && hours >= 17) return { isOpen: false, label: 'COMEX Closed' }
  return { isOpen: true, label: 'COMEX Open' }
}

export function useMarketStatus() {
  const [mcx, setMcx] = useState(computeMCXStatus)
  const [comex, setComex] = useState(computeCOMEXStatus)

  useEffect(() => {
    const id = setInterval(() => {
      setMcx(computeMCXStatus())
      setComex(computeCOMEXStatus())
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  return { mcx, comex }
}
