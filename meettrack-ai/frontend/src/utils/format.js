// Small helpers for showing dates, labels and initials consistently across the app.

export function formatDate(value) {
  if (!value) return null
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number)
  if (!y) return null
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function timeAgo(value) {
  if (!value) return ''
  const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days < 30 ? `${days} d ago` : formatDate(value)
}

export function todayISO() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export function initials(user) {
  const name = `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || '?'
  return name.split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('')
}

export function displayName(user) {
  return `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || user?.email || ''
}

// Labels shown when a value is missing. Never invent an owner or a date.
export const NOT_SPECIFIED = 'Not specified'
export const UNASSIGNED = 'Unassigned'

export function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}
