/**
 * Race clock driven by server monotonic time (race_status / stage_ready
 * carry `pi_staging_at_s` / `pi_starts_at_s`), so every device shows the same
 * time as the timer. Also fires tone / voice hooks at the moments the classic
 * interface did: staging beeps, start buzzer, final-5-second beeps, expiry.
 */
export type ClockPhase = 'idle' | 'scheduled' | 'prestage' | 'staging' | 'racing' | 'overtime' | 'finished'

interface Timing {
  stagingAt: number // server ms
  startsAt: number // server ms
  hideStaging: boolean
  countUp: boolean
  durationMs: number
  stagingTones: number
}

const clock = reactive({
  phase: 'idle' as ClockPhase,
  /** ms relative to race start (negative while staging) */
  elapsedMs: 0,
  /** text shown on the clock */
  display: '0:00.0',
  /** seconds remaining until a scheduled race */
  scheduledInMs: 0
})

let timing: Timing | null = null
let scheduledAt: number | null = null
let frozenDisplay: string | null = null
let raf = 0
let lastTenth: number | null = null
let lastStagingSec: number | null = null
let started = false
const listeners = new Set<(evt: string, info?: any) => void>()

export function formatClock(ms: number, tenths = true) {
  const neg = ms < 0
  const t = Math.abs(ms)
  const totalTenths = tenths ? Math.floor(t / 100) : Math.ceil(t / 1000) * 10
  const h = Math.floor(totalTenths / 36000)
  const m = Math.floor((totalTenths % 36000) / 600)
  const s = Math.floor((totalTenths % 600) / 10)
  const d = totalTenths % 10
  const core = (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}` + (tenths ? `.${d}` : '')
  return (neg ? '−' : '') + core
}

export function useRaceClock() {
  const rh = useRH()

  function emitTick(evt: string, info?: any) {
    listeners.forEach(l => l(evt, info))
  }

  function frame() {
    raf = requestAnimationFrame(frame)
    const now = rh.serverNow() * 1000
    const status = rh.state.race_status
    if (!status) return

    if (scheduledAt && (status.race_status === 0)) {
      clock.scheduledInMs = scheduledAt - now
      clock.phase = 'scheduled'
      clock.display = clock.scheduledInMs > 0 ? formatClock(clock.scheduledInMs, false) : '0:00'
      return
    }

    if (!timing || ![1, 3].includes(status.race_status)) {
      if (status.race_status === 2) {
        clock.phase = 'finished'
        if (frozenDisplay) clock.display = frozenDisplay
        else if (timing && !timing.countUp) clock.display = formatClock(0)
        return
      }
      clock.phase = 'idle'
      lastTenth = null
      const dur = (status.race_time_sec || 0) * 1000
      clock.display = !status.unlimited_time && dur ? formatClock(dur) : formatClock(0)
      return
    }

    const elapsed = now - timing.startsAt
    clock.elapsedMs = elapsed
    const tenth = Math.floor(elapsed / 100)
    const crossed = (target: number) => lastTenth !== null && lastTenth < target && tenth >= target

    if (elapsed < 0) {
      if (now < timing.stagingAt) {
        clock.phase = 'prestage'
        clock.display = timing.hideStaging ? '' : formatClock(timing.startsAt - timing.stagingAt)
      } else {
        clock.phase = 'staging'
        clock.display = timing.hideStaging ? '' : formatClock(-elapsed + 99)
        // staging tones: one beep on each whole second after staging starts
        const stagingSec = Math.floor((now - timing.stagingAt) / 1000)
        if (lastTenth !== null && stagingSec !== lastStagingSec && stagingSec < timing.stagingTones) emitTick('stage_beep')
        lastStagingSec = stagingSec
      }
    } else if (timing.countUp) {
      clock.phase = 'racing'
      clock.display = formatClock(elapsed)
    } else {
      const remaining = timing.durationMs - elapsed
      clock.phase = remaining >= 0 ? 'racing' : 'overtime'
      clock.display = remaining >= 0 ? formatClock(remaining + 99) : formatClock(remaining)
      // final 5 seconds
      for (let s = 5; s >= 1; s--) {
        if (crossed((timing.durationMs - s * 1000) / 100)) emitTick('final_beep', s)
      }
      if (crossed(timing.durationMs / 100)) emitTick('expire')
      // spoken time remaining
      for (const s of [3600, 1800, 600, 300, 240, 180, 120, 60, 30, 10]) {
        if (timing.durationMs > s * 1000 && crossed((timing.durationMs - s * 1000) / 100)) emitTick('remaining', s)
      }
    }
    if (crossed(0)) emitTick('start')
    lastTenth = tenth
  }
  function kickoff(d: any) {
    frozenDisplay = null
    timing = {
      stagingAt: (d.pi_staging_at_s || d.pi_starts_at_s) * 1000,
      startsAt: d.pi_starts_at_s * 1000,
      hideStaging: !!d.hide_stage_timer,
      countUp: !!d.unlimited_time,
      durationMs: (d.race_time_sec || 0) * 1000,
      stagingTones: d.staging_tones || 0
    }
    lastTenth = Math.floor((rh.serverNow() * 1000 - timing.startsAt) / 100)
  }

  if (!started && import.meta.client) {
    started = true
    rh.load(['race_status'])
    rh.emit('get_race_scheduled')
    rh.on('stage_ready', kickoff, { global: true })
    rh.on('race_status', (d: any) => {
      if ([1, 3].includes(d.race_status)) {
        // resume (page opened mid-race) or update
        if (!timing || Math.abs(timing.startsAt - d.pi_starts_at_s * 1000) > 1) {
          const tones = timing?.stagingTones ?? 0
          kickoff({ ...d, staging_tones: d.staging_tones || tones })
        }
      } else if (d.race_status === 0) {
        timing = null
        frozenDisplay = null
      } else if (d.race_status === 2 && !frozenDisplay && timing) {
        frozenDisplay = clock.display
      }
    }, { global: true })
    rh.on('stop_timer', () => {
      frozenDisplay = clock.display
    }, { global: true })
    rh.on('race_scheduled', (d: any) => {
      scheduledAt = d?.scheduled ? d.scheduled_at * 1000 : null
    }, { global: true })
    raf = requestAnimationFrame(frame)
  }

  function onTick(fn: (evt: string, info?: any) => void, opts: { global?: boolean } = {}) {
    listeners.add(fn)
    if (!opts.global && getCurrentInstance()) onBeforeUnmount(() => listeners.delete(fn))
  }

  return { clock, onTick }
}
