import { useMemo } from 'react'
import { useTimeOfDay } from './useTimeOfDay'
import { useMarketStatus } from './useMarketStatus'

const MCX_OPEN_MINUTES = 9 * 60   // 09:00 IST
const MCX_CLOSE_MINUTES = 23 * 60 + 30  // 23:30 IST

function formatCountdown(diffMinutes: number): string {
  const h = Math.floor(diffMinutes / 60)
  const m = diffMinutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

export function useMarketHint(): string {
  const { istMinutes, period } = useTimeOfDay()
  const { mcx } = useMarketStatus()

  return useMemo(() => {
    // Weekend or holiday
    if (!mcx.isOpen && (mcx.label === 'MCX Closed' || mcx.label === 'MCX Holiday')) {
      // Check if it's a weekday pre-market
      const now = new Date()
      const istStr = now.toLocaleString('en-CA', { timeZone: 'Asia/Kolkata', hour12: false })
      const [datePart] = istStr.split(', ')
      const dayOfWeek = new Date(datePart + 'T12:00:00+05:30').getDay()

      if (dayOfWeek === 0 || dayOfWeek === 6 || mcx.label === 'MCX Holiday') {
        return 'Markets closed today'
      }

      // Weekday before open
      if (istMinutes < MCX_OPEN_MINUTES) {
        const diff = MCX_OPEN_MINUTES - istMinutes
        return `MCX opens in ${formatCountdown(diff)}`
      }

      // After close
      if (istMinutes >= MCX_CLOSE_MINUTES) {
        return 'MCX closed for today'
      }
    }

    // Market is open — show session name
    if (mcx.isOpen) {
      if (period === 'morning') return 'Morning session'
      if (period === 'afternoon') return 'Afternoon session'
      if (period === 'evening') return 'Evening session'
      return 'Night session'
    }

    return ''
  }, [istMinutes, period, mcx.isOpen, mcx.label])
}
