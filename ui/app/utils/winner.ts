/**
 * The server's race status message (e.g. "Winner is Sky Fox") is set when the race
 * is decided and isn't recalculated after laps are corrected. Show it only while it
 * still agrees with the leaderboard: a message naming a pilot who is no longer in
 * first place is hidden. Messages that name no pilot (ties, pending) always show.
 */
export function currentStatusMessage(block: any): string | null {
  const msg: string = block?.status_msg || ''
  if (!msg) return null
  const board = block?.leaderboard
  const key = board?.meta?.primary_leaderboard || 'by_race_time'
  const rows: any[] = board?.[key] || []
  const named = rows.filter(r => r.callsign && msg.includes(r.callsign))
  if (!named.length) return msg
  const leaders = rows.filter(r => r.position === 1).map(r => r.callsign)
  return named.some(r => leaders.includes(r.callsign)) ? msg : null
}
