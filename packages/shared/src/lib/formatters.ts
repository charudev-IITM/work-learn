export function formatCurrency(value: number | null | undefined, currency = "₹"): string {
  if (value === null || value === undefined) return "N/A"
  return `${currency}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatDifference(value: number | null | undefined, currency = "₹"): string {
  if (value === null || value === undefined) return "N/A"
  const sign = value >= 0 ? "+" : ""
  return `${sign}${currency}${value.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Parse ISO strings or epoch timestamps into Date, treating bare ISO as UTC. */
function parseTimestamp(timestamp: string): Date {
  if (timestamp.includes('T') || timestamp.includes('-')) {
    if (!timestamp.endsWith('Z') && !timestamp.includes('+') && !timestamp.includes('-', 10)) {
      return new Date(timestamp + 'Z')
    }
    return new Date(timestamp)
  }
  const num = parseInt(timestamp)
  return new Date(num > 9999999999 ? num : num * 1000)
}

export function formatTimestamp(timestamp: string, timezone?: string): string {
  const date = parseTimestamp(timestamp)

  const options: Intl.DateTimeFormatOptions = {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }

  if (timezone) {
    options.timeZone = timezone
  }

  return date.toLocaleTimeString("en-IN", options)
}

export function formatTimestampWithDate(timestamp: string, timezone?: string): string {
  const date = parseTimestamp(timestamp)

  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }

  if (timezone) {
    options.timeZone = timezone
  }

  return date.toLocaleString("en-IN", options)
}

export function getRelativeTime(timestamp: string): string {
  const date = parseTimestamp(timestamp)
  const diffMs = Date.now() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)

  if (diffSeconds < 0) {
    return 'now'
  } else if (diffSeconds < 60) {
    return `${diffSeconds}s ago`
  } else if (diffSeconds < 3600) {
    const minutes = Math.floor(diffSeconds / 60)
    return `${minutes}m ago`
  } else if (diffSeconds < 86400) {
    const hours = Math.floor(diffSeconds / 3600)
    return `${hours}h ago`
  } else {
    const days = Math.floor(diffSeconds / 86400)
    return `${days}d ago`
  }
}

/** Format seconds as M:SS countdown string. */
export function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00'
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function isDataStale(timestamp: string): boolean {
  const now = new Date()
  const currentDay = now.getDay() // 0 = Sunday, 1-5 = Weekdays, 6 = Saturday
  const isWeekday = currentDay >= 1 && currentDay <= 5

  const date = parseTimestamp(timestamp)
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))

  // On weekdays, anything >1 minute is stale
  return isWeekday && diffMinutes > 1
}

/** Rate hasn't been returned by the dealer's API in >5 minutes — likely dead/removed. */
export function isVeryStale(timestamp: string): boolean {
  const date = parseTimestamp(timestamp)
  return Date.now() - date.getTime() > 5 * 60 * 1000
}
