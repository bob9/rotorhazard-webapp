/**
 * A pilot's real name, or '' when there isn't one. RotorHazard gives new pilots a
 * placeholder name starting with "~" ("~Pilot 9 Name"), which isn't one: show the
 * field's placeholder or the callsign instead.
 */
export function pilotName(p: { name?: unknown } | null | undefined): string {
  const n = String(p?.name ?? '').trim()
  return n.startsWith('~') ? '' : n
}
