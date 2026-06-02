/** Format ISO date string to short date (e.g., "15 Mar 2026") */
export function formatDate(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
}

/** Format ISO date string to date + time (e.g., "15 Mar 2026, 02:30 pm") */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}
