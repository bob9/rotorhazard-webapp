/**
 * Lap recalculation from recorded RSSI history, ported from the classic
 * interface (src/server/static/marshal.js, RHMarshal). Kept as pure functions
 * so the Marshal page and the Race page's after-stop marshaling share one
 * implementation. Times: `history_times`, `startTime` and `crossingStart/End`
 * are seconds (server monotonic); `lap_time_stamp` / `lap_time` are ms since
 * race start.
 */

export const LAP_SOURCE = { REALTIME: 0, MANUAL: 1, RECALC: 2, AUTOMATIC: 3, API: 4 } as const
export const MARSHAL_TYPE = { RSSI: 0, HYBRID_PASS_PEAK: 1, PASS_PEAK_ONLY: 2 } as const

/** Classic labels for lap sources (translated with t()). */
export const LAP_SOURCE_LABELS: Record<number, string> = {
  0: 'Realtime',
  1: 'Manual',
  2: 'Recalc',
  3: 'Automatic',
  4: 'API (plugin)'
}

export interface MarshalLap {
  lap_time_stamp: number
  lap_time?: number
  lap_time_formatted?: string | number
  source: number
  deleted: boolean
  peak_rssi?: number | null
  crossingStart?: number
  crossingEnd?: number
  [k: string]: any
}

export interface MarshalHistory {
  times: number[]
  values: number[]
}

export interface MarshalRaceFormat {
  unlimited_time?: number | boolean
  race_time_sec?: number | null
}

export interface MarshalOptions {
  startTime: number
  enterAt: number
  exitAt: number
  marshalType?: number
  minLapMs?: number
  minLapBehavior?: number
  minFirstCrossingMs?: number
  /** null = unlimited time (as the classic interface does without a format) */
  raceFormat?: MarshalRaceFormat | null
}

/** setHistory(): pass-peak-only nodes have no history, so laps become spikes at their peak. */
export function passPeakHistory(laps: MarshalLap[], startTime: number): MarshalHistory {
  const times = [startTime]
  const values = [0]
  for (const lap of laps) {
    times.push(startTime + lap.lap_time_stamp / 1000)
    values.push(lap.peak_rssi ?? 0)
    times.push(startTime + (lap.lap_time_stamp + 1) / 1000)
    values.push(0)
  }
  times.push(times[times.length - 1]! + 10)
  values.push(0)
  return { times, values }
}

function isTimed(f?: MarshalRaceFormat | null): f is MarshalRaceFormat {
  return !!f && !f.unlimited_time
}

/** processRXData(): lap detection from history (RSSI) or from pass peaks. */
export function detectLaps(history: MarshalHistory, laps: MarshalLap[], o: MarshalOptions): MarshalLap[] {
  const out: MarshalLap[] = []
  const minFirst = o.minFirstCrossingMs || 0
  const minLap = o.minLapMs || 0
  let lastStamp = -Infinity

  if (o.marshalType === MARSHAL_TYPE.PASS_PEAK_ONLY || o.marshalType === MARSHAL_TYPE.HYBRID_PASS_PEAK) {
    // The classic code edits the existing laps in place: each becomes a recalc lap,
    // deleted if before min first crossing or if its peak is below EnterAt.
    // (Its min-lap check references undefined variables, so is applied here as intended;
    // laps without a peak, e.g. manual ones, are not judged by EnterAt.)
    for (const src of laps) {
      const lap: MarshalLap = { ...src, source: LAP_SOURCE.RECALC, crossingStart: src.lap_time_stamp, crossingEnd: src.lap_time_stamp + 1 }
      lap.deleted = lap.lap_time_stamp < minFirst || (typeof lap.peak_rssi === 'number' && lap.peak_rssi < o.enterAt)
      if (!lap.deleted) {
        if (o.minLapBehavior && lap.lap_time_stamp < lastStamp + minLap) lap.deleted = true
        else lastStamp = lap.lap_time_stamp
      }
      out.push(lap)
    }
  } else {
    let crossing = false
    let crossingStart = 0
    let peakRssi = 0
    let peakFirst = 0
    let peakLast = 0
    let time = 0
    // Note: the classic code computes lowered EnterAt/ExitAt for the start of the race
    // (TIMING.startThreshLowerAmount/Duration) but compares against the plain levels,
    // so lowering never takes effect there. Matched here.
    for (let i = 0; i < history.values.length; i++) {
      const rssi = history.values[i]!
      time = history.times[i]!

      if (!crossing && rssi > o.enterAt) {
        crossing = true
        crossingStart = time
      }
      if (rssi >= peakRssi) {
        peakLast = time
        if (rssi > peakRssi) {
          peakFirst = time
          peakRssi = rssi
        }
      }
      if (crossing && rssi < o.exitAt) {
        const stamp = ((peakLast + peakFirst) / 2 - o.startTime) * 1000
        if (stamp > 0) { // reject passes before race start
          const lap: MarshalLap = {
            crossingStart,
            crossingEnd: time,
            lap_time_stamp: stamp,
            source: LAP_SOURCE.RECALC,
            peak_rssi: peakRssi,
            deleted: false
          }
          if (stamp < minFirst) lap.deleted = true
          else if (o.minLapBehavior && stamp < lastStamp + minLap) lap.deleted = true
          else lastStamp = stamp
          out.push(lap)
        }
        crossing = false
        peakRssi = 0
      }
    }
    if (crossing) { // crossing still open at the end of the data
      out.push({
        crossingStart,
        crossingEnd: time,
        lap_time_stamp: ((peakLast + peakFirst) / 2 - o.startTime) * 1000,
        source: LAP_SOURCE.RECALC,
        deleted: false
      })
    }
  }

  // auto-delete laps after the first one past a fixed race time
  let finished = false
  for (const lap of out) {
    if (finished) lap.deleted = true
    else if (isTimed(o.raceFormat) && lap.lap_time_stamp > (o.raceFormat.race_time_sec || 0) * 1000) finished = true
  }
  return out
}

/** updateIncrementalLapTimes(): sort by stamp and compute lap times of the laps that count. */
export function updateLapTimes(laps: MarshalLap[]): MarshalLap[] {
  laps.sort((a, b) => a.lap_time_stamp - b.lap_time_stamp)
  let last: MarshalLap | null = null
  for (const lap of laps) {
    if (!lap.deleted) {
      lap.lap_time = last ? lap.lap_time_stamp - last.lap_time_stamp : lap.lap_time_stamp
      lap.lap_time_formatted = lap.lap_time / 1000
      last = lap
    } else {
      lap.lap_time = 0
      lap.lap_time_formatted = '-'
    }
  }
  return laps
}

/**
 * recalcRace(): RSSI nodes replace all detected laps with freshly calculated
 * ones and keep manual and API laps; pass-peak nodes re-evaluate their laps.
 */
export function recalcLaps(history: MarshalHistory, laps: MarshalLap[], o: MarshalOptions): MarshalLap[] {
  const calc = detectLaps(history, laps, o)
  let result: MarshalLap[]
  if (!o.marshalType || o.marshalType === MARSHAL_TYPE.RSSI) {
    result = [...calc, ...laps.filter(l => l.source === LAP_SOURCE.MANUAL || l.source === LAP_SOURCE.API).map(l => ({ ...l }))]
  } else {
    result = calc
  }
  return updateLapTimes(result)
}

/** Whether a lap is past the end of a fixed-time race. */
export function isAfterTimeExpired(lap: MarshalLap, f?: MarshalRaceFormat | null) {
  return isTimed(f) && lap.lap_time_stamp > (f.race_time_sec || 0) * 1000
}
