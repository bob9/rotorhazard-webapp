/** 24-bit int or '#rrggbb' → '#rrggbb' */
export function colorHex(c: number | string | null | undefined, fallback = '#8e8e93') {
  if (c === null || c === undefined || c === '') return fallback
  if (typeof c === 'string') return c.startsWith('#') ? c : `#${c}`
  return '#' + c.toString(16).padStart(6, '0')
}

/** Readable text color for a background color */
export function contrastText(hex: string) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#000000' : '#ffffff'
}

/** frequency_data entry → 'R1' style label */
export function channelLabel(f?: { band?: string | null, channel?: number | null, frequency?: number } | null) {
  if (!f || !f.frequency) return ''
  return f.band && f.channel ? `${f.band}${f.channel}` : String(f.frequency)
}

/** Empty or zero lap times show as a dash */
/** ms → m:ss.sss */
export function formatLapMs(ms?: number | null) {
  if (ms === null || ms === undefined || Number.isNaN(ms)) return '—'
  const neg = ms < 0
  const t = Math.abs(Math.round(ms))
  const m = Math.floor(t / 60000)
  const s = Math.floor((t % 60000) / 1000)
  const r = t % 1000
  return `${neg ? '-' : ''}${m}:${String(s).padStart(2, '0')}.${String(r).padStart(3, '0')}`
}

export const RACE_STATUS = { READY: 0, RACING: 1, DONE: 2, STAGING: 3 } as const

export const WIN_CONDITIONS = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Most Laps in Fastest Time' },
  { value: 2, label: 'First to X Laps' },
  { value: 3, label: 'Fastest Lap' },
  { value: 4, label: 'Fastest Consecutive Laps' },
  { value: 5, label: 'Most Laps Only' },
  { value: 6, label: 'Most Laps Only with Overtime' }
]

/** The server's "2026-10-11 00:45:34.159" race start, as a short local date and time. */
export function formatStartTime(s?: string | null) {
  if (!s) return ''
  const d = new Date(String(s).replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? String(s) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
