/**
 * RSSI history of every node, recorded from the timer's heartbeat while the app is open,
 * so the seat cards and the tuning graph show the signal from before they were opened.
 * Keeps the last few minutes; `version` changes with each heartbeat.
 */
export interface RssiPoint { t: number, v: number, c: boolean }

export const RSSI_KEEP_MS = 5 * 60 * 1000

const series: RssiPoint[][] = []
const version = ref(0)
let started = false

export function useRssiHistory() {
  const rh = useRH()
  if (!started && import.meta.client) {
    started = true
    rh.on('heartbeat', (d: any) => {
      const values = d?.current_rssi
      if (!Array.isArray(values)) return
      const now = performance.now()
      const cutoff = now - RSSI_KEEP_MS
      values.forEach((v: number, i: number) => {
        const s = (series[i] ||= [])
        s.push({ t: now, v, c: !!d.crossing_flag?.[i] })
        let old = 0
        while (old < s.length && s[old]!.t < cutoff) old++
        if (old) s.splice(0, old)
      })
      version.value++
    }, { global: true })
  }
  return {
    /** the node's readings, oldest first (times from performance.now()) */
    series: (node: number): RssiPoint[] => series[node] || [],
    version
  }
}
