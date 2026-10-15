<script setup lang="ts">
/**
 * RSSI graph with EnterAt / ExitAt lines. Live mode scrolls one node's recent
 * signal (the last `windowSec`, from useRssiHistory, so it opens with history
 * already drawn; `axis` labels the seconds); static mode draws a recorded
 * history (marshaling). Lines can be dragged when `editable`: grab a line (or
 * its label) to move it; in static mode a press anywhere else is a tap.
 *
 * Static mode extras: `domain` fixes the time range (defaults to the history's
 * span), `origin` adds a seconds axis relative to that time, `regions` shades
 * time ranges, `markers` draw laps (with an optional crossing band from
 * `start` to `end`), and a tap without dragging emits `seek` with the time.
 */
interface Marker { time: number, deleted?: boolean, label?: string, start?: number, end?: number, active?: boolean }
const props = withDefaults(defineProps<{
  node?: number
  history?: { times: number[], values: number[] } | null
  enterAt?: number
  exitAt?: number
  editable?: boolean
  color?: string
  height?: number
  windowSec?: number
  paused?: boolean
  markers?: Marker[]
  cursor?: number | null
  domain?: [number, number] | null
  origin?: number | null
  regions?: { from: number, to: number }[]
  axis?: boolean
}>(), { height: 220, windowSec: 20, color: '#fe5d11' })
const emit = defineEmits<{ 'update:enterAt': [number], 'update:exitAt': [number], 'commit': [], 'seek': [number] }>()

const canvas = ref<HTMLCanvasElement>()
const wrap = ref<HTMLDivElement>()
const rssiHistory = useRssiHistory()
let raf = 0
let dragging: 'enter' | 'exit' | null = null
// static mode: a press becomes a drag only once it moves, otherwise it is a tap
let press: { x: number, y: number, enter?: number, exit?: number } | null = null
// the line under the pointer, highlighted and given the resize cursor
const hoverLine = ref<'enter' | 'exit' | null>(null)
let hoverX: number | null = null

const AXIS_H = 20

// live mode: recording carries on while paused; the view stays at the moment of pausing
let pausedAt: number | null = null
watch(() => props.paused, (p) => { pausedAt = p ? performance.now() : null }, { immediate: true })
function liveNow() {
  return pausedAt ?? performance.now()
}
function livePoints() {
  if (props.node === undefined) return []
  const now = liveNow()
  const from = now - props.windowSec * 1000 - 1000
  return rssiHistory.series(props.node).filter(p => p.t >= from && p.t <= now)
}

function css(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function range() {
  const vals = props.history ? props.history.values : livePoints().map(p => p.v)
  let max = props.enterAt || 0
  let min = props.exitAt ?? 0
  for (const v of vals) {
    if (v > max) max = v
    if (v < min) min = v
  }
  max = Math.max(max, 50)
  if (!vals.length) min = Math.min(min, 0)
  const pad = (max - min) * 0.12 + 4
  return { lo: Math.max(0, min - pad), hi: max + pad }
}

const isStatic = computed(() => !!props.history)
const hasAxis = computed(() => isStatic.value ? props.origin !== null && props.origin !== undefined : !!props.axis)
function plotHeight() {
  return props.height - (hasAxis.value ? AXIS_H : 0)
}
function span(): [number, number] {
  if (props.domain) return [props.domain[0], Math.max(props.domain[0] + 0.001, props.domain[1])]
  const ts = props.history?.times || []
  const t0 = ts[0] ?? 0
  return [t0, Math.max(t0 + 0.001, ts[ts.length - 1] ?? 1)]
}

function niceStep(sec: number, px: number) {
  const target = sec / Math.max(1, px / 90)
  for (const s of [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600]) if (s >= target) return s
  return 1200
}

// label pills: [fill, text] with at least 4.5:1 contrast. Light: 700 shades under white text;
// dark: bright fills under dark text (the lines themselves keep the brighter hues)
const PILLS = {
  light: { exit: ['#b45309', '#fff'], enter: ['#b91c1c', '#fff'], lap: ['#15803d', '#fff'], deleted: ['#525252', '#fff'] },
  dark: { exit: ['#fbbf24', '#1c1917'], enter: ['#f87171', '#1c1917'], lap: ['#4ade80', '#052e16'], deleted: ['#a3a3a3', '#171717'] }
} as const
function draw() {
  raf = requestAnimationFrame(draw)
  const c = canvas.value
  if (!c || !wrap.value) return
  const dpr = window.devicePixelRatio || 1
  const w = wrap.value.clientWidth
  const fullH = props.height
  const h = plotHeight()
  if (c.width !== w * dpr || c.height !== fullH * dpr) {
    c.width = w * dpr
    c.height = fullH * dpr
    c.style.width = `${w}px`
    c.style.height = `${fullH}px`
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, fullH)
  const { lo, hi } = range()
  const y = (v: number) => h - ((v - lo) / (hi - lo)) * h
  const font = '600 11px -apple-system, system-ui, sans-serif'
  const pills = PILLS[document.documentElement.classList.contains('dark') ? 'dark' : 'light']

  // grid
  const border = css('--ui-border') || '#e4e4e7'
  ctx.strokeStyle = border
  ctx.lineWidth = 1
  for (let i = 1; i < 4; i++) {
    ctx.beginPath()
    ctx.moveTo(0, Math.round((h / 4) * i) + 0.5)
    ctx.lineTo(w, Math.round((h / 4) * i) + 0.5)
    ctx.stroke()
  }

  let pts: { x: number, y: number, c?: boolean }[] = []
  if (props.history) {
    const [t0, t1] = span()
    const sp = t1 - t0
    const X = (t: number) => ((t - t0) / sp) * w
    const ts = props.history.times

    // shaded regions (outside the race window)
    if (props.regions?.length) {
      ctx.fillStyle = css('--ui-bg-accented') || '#e4e4e7'
      ctx.globalAlpha = 0.6
      for (const r of props.regions) {
        const a = Math.max(0, X(r.from))
        const b = Math.min(w, X(r.to))
        if (b > a) ctx.fillRect(a, 0, b - a, h)
      }
      ctx.globalAlpha = 1
    }

    // time axis
    if (hasAxis.value) {
      const step = niceStep(sp, w)
      const o = props.origin!
      ctx.font = '500 10px -apple-system, system-ui, sans-serif'
      ctx.fillStyle = css('--ui-text-dimmed') || '#999'
      ctx.strokeStyle = border
      ctx.textAlign = 'center'
      const first = Math.ceil((t0 - o) / step) * step
      for (let s = first; o + s <= t1; s += step) {
        const x = Math.round(X(o + s)) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, h)
        ctx.lineTo(x, h + 4)
        ctx.stroke()
        const m = Math.floor(Math.abs(s) / 60)
        const label = step >= 1 ? (m ? `${s < 0 ? '-' : ''}${m}:${String(Math.abs(s) % 60).padStart(2, '0')}` : `${s}s`) : `${s.toFixed(1)}s`
        if (x > 12 && x < w - 12) ctx.fillText(label, x, h + 15)
      }
      ctx.textAlign = 'start'
      ctx.beginPath()
      ctx.moveTo(0, h + 0.5)
      ctx.lineTo(w, h + 0.5)
      ctx.stroke()
    }

    pts = props.history.values.map((v, i) => ({ x: X(ts[i]!), y: y(v) }))

    // lap markers: crossing band + line at the lap time
    const success = css('--ui-success') || '#22c55e'
    const dimmed = css('--ui-text-dimmed') || '#999'
    const errorCol = css('--ui-error') || '#ef4444'
    for (const m of props.markers || []) {
      const x = X(m.time)
      const col = m.deleted ? errorCol : success
      if (m.start !== undefined && m.end !== undefined) {
        ctx.fillStyle = col
        ctx.globalAlpha = m.deleted ? 0.08 : 0.14
        const a = X(m.start)
        ctx.fillRect(a, 0, Math.max(1, X(m.end) - a), h)
        ctx.globalAlpha = 1
      }
      ctx.strokeStyle = m.deleted ? dimmed : col
      ctx.lineWidth = m.active ? 2 : 1.25
      ctx.setLineDash(m.deleted ? [3, 3] : [])
      ctx.beginPath()
      ctx.moveTo(Math.round(x) + 0.5, 0)
      ctx.lineTo(Math.round(x) + 0.5, h)
      ctx.stroke()
      ctx.setLineDash([])
      if (m.label) {
        ctx.font = font
        const tw = ctx.measureText(m.label).width
        const [fill, ink] = m.deleted ? pills.deleted : pills.lap
        ctx.fillStyle = fill
        ctx.beginPath()
        ctx.roundRect(x - tw / 2 - 5, 3, tw + 10, 16, 8)
        ctx.fill()
        ctx.fillStyle = ink
        ctx.fillText(m.label, x - tw / 2, 15)
      }
    }
    if (props.cursor !== null && props.cursor !== undefined) {
      const x = Math.round(X(props.cursor)) + 0.5
      ctx.strokeStyle = css('--ui-primary') || css('--ui-text-highlighted') || '#000'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }
    if (hoverX !== null && !dragging) {
      const x = Math.round(hoverX) + 0.5
      ctx.strokeStyle = css('--ui-text-muted') || '#888'
      ctx.globalAlpha = 0.5
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
      ctx.globalAlpha = 1
      const tsec = t0 + (hoverX / w) * sp - (props.origin ?? t0)
      const text = `${tsec.toFixed(2)}s`
      ctx.font = font
      const tw = ctx.measureText(text).width
      const bx = Math.min(Math.max(2, x - tw / 2 - 5), w - tw - 12)
      ctx.fillStyle = css('--ui-bg-inverted') || '#111'
      ctx.beginPath()
      ctx.roundRect(bx, h - 22, tw + 10, 18, 9)
      ctx.fill()
      ctx.fillStyle = css('--ui-bg') || '#fff'
      ctx.fillText(text, bx + 5, h - 9)
    }
  } else {
    const now = liveNow()
    const winMs = props.windowSec * 1000
    const X = (t: number) => w - ((now - t) / winMs) * w
    const live = livePoints()
    // crossing bands
    ctx.fillStyle = props.color + '22'
    for (let i = 0; i < live.length - 1; i++) {
      if (live[i]!.c) ctx.fillRect(X(live[i]!.t), 0, X(live[i + 1]!.t) - X(live[i]!.t) + 0.5, h)
    }
    // a long window has more readings than pixels: keep each pixel's highest (passes are peaks)
    if (live.length > w * 2) {
      const cols = new Map<number, number>()
      for (const p of live) {
        const col = Math.round(X(p.t))
        cols.set(col, Math.max(cols.get(col) ?? 0, p.v))
      }
      pts = [...cols].map(([x, v]) => ({ x, y: y(v) }))
    } else {
      pts = live.map(p => ({ x: X(p.t), y: y(p.v) }))
    }
    // seconds before now
    if (hasAxis.value) {
      const step = niceStep(props.windowSec, w)
      ctx.font = '500 10px -apple-system, system-ui, sans-serif'
      ctx.fillStyle = css('--ui-text-dimmed') || '#999'
      ctx.strokeStyle = border
      ctx.textAlign = 'center'
      for (let s = step; s < props.windowSec; s += step) {
        const x = Math.round(w - (s / props.windowSec) * w) + 0.5
        ctx.beginPath()
        ctx.moveTo(x, h)
        ctx.lineTo(x, h + 4)
        ctx.stroke()
        const m = Math.floor(s / 60)
        const label = m ? `−${m}:${String(s % 60).padStart(2, '0')}` : `−${s}s`
        if (x > 16 && x < w - 16) ctx.fillText(label, x, h + 15)
      }
      ctx.textAlign = 'start'
      ctx.beginPath()
      ctx.moveTo(0, h + 0.5)
      ctx.lineTo(w, h + 0.5)
      ctx.stroke()
    }
  }

  if (pts.length > 1) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, props.color + '55')
    grad.addColorStop(1, props.color + '00')
    ctx.beginPath()
    ctx.moveTo(pts[0]!.x, h)
    for (const p of pts) ctx.lineTo(p.x, p.y)
    ctx.lineTo(pts[pts.length - 1]!.x, h)
    ctx.closePath()
    ctx.fillStyle = grad
    ctx.fill()
    ctx.beginPath()
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
    ctx.strokeStyle = props.color
    ctx.lineWidth = 1.75
    ctx.lineJoin = 'round'
    ctx.stroke()
    ctx.restore()
  }

  const line = (v: number | undefined, col: string, label: string, pill: readonly [string, string]) => {
    if (v === undefined || v === null) return
    const yy = Math.round(y(v)) + 0.5
    ctx.strokeStyle = col
    const active = dragging ?? hoverLine.value
    ctx.lineWidth = active && label.startsWith(active === 'enter' ? 'Enter' : 'Exit') ? 2.5 : 1.5
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(0, yy)
    ctx.lineTo(w, yy)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.font = font
    const text = `${label} ${v}`
    const tw = ctx.measureText(text).width
    ctx.fillStyle = pill[0]
    ctx.beginPath()
    ctx.roundRect(w - tw - 14, yy - 9, tw + 10, 18, 9)
    ctx.fill()
    ctx.fillStyle = pill[1]
    ctx.fillText(text, w - tw - 9, yy + 4)
  }
  line(props.exitAt, '#f59e0b', 'Exit', pills.exit)
  line(props.enterAt, '#ef4444', 'Enter', pills.enter)
}

function valueAt(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  const { lo, hi } = range()
  return Math.round(lo + (1 - (e.clientY - rect.top) / plotHeight()) * (hi - lo))
}
function timeAt(e: PointerEvent) {
  const rect = canvas.value!.getBoundingClientRect()
  const [t0, t1] = span()
  return t0 + Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * (t1 - t0)
}

// the EnterAt / ExitAt line within reach of the pointer (a finger gets more room than a mouse)
function lineNear(e: PointerEvent): 'enter' | 'exit' | null {
  if (!props.editable) return null
  const rect = canvas.value!.getBoundingClientRect()
  const py = e.clientY - rect.top
  const { lo, hi } = range()
  const h = plotHeight()
  const dist = (v?: number) => (v === undefined || v === null ? Infinity : Math.abs(py - (h - ((v - lo) / (hi - lo)) * h)))
  const de = dist(props.enterAt)
  const dx = dist(props.exitAt)
  if (Math.min(de, dx) > (e.pointerType === 'mouse' ? 8 : 18)) return null
  return de <= dx ? 'enter' : 'exit'
}

function down(e: PointerEvent) {
  if (e.button > 0) return
  canvas.value!.setPointerCapture(e.pointerId)
  const near = lineNear(e)
  if (isStatic.value) {
    press = { x: e.clientX, y: e.clientY, enter: props.enterAt, exit: props.exitAt }
    dragging = near
    return
  }
  if (!props.editable) return
  // live tuning: a press anywhere moves the nearer line
  const mid = ((props.enterAt || 0) + (props.exitAt || 0)) / 2
  dragging = near ?? (valueAt(e) >= mid ? 'enter' : 'exit')
  move(e)
}
function move(e: PointerEvent) {
  if (isStatic.value && e.pointerType === 'mouse') {
    const rect = canvas.value!.getBoundingClientRect()
    hoverX = e.clientX - rect.left
  }
  hoverLine.value = dragging ?? lineNear(e)
  if (!dragging) return
  let v = valueAt(e)
  if (dragging === 'enter') {
    v = Math.max(v, (props.exitAt || 0) + 2)
    emit('update:enterAt', v)
  } else {
    v = Math.min(v, (props.enterAt || 255) - 2)
    emit('update:exitAt', Math.max(0, v))
  }
}
function up(e: PointerEvent) {
  if (dragging) emit('commit')
  else if (press && Math.abs(e.clientX - press.x) < 6 && Math.abs(e.clientY - press.y) < 6) emit('seek', timeAt(e))
  dragging = null
  press = null
  if (e.pointerType !== 'mouse') hoverLine.value = null
}
function cancel() {
  // live tuning keeps what was dragged; marshaling reverts an unfinished drag (as the classic page does)
  if (!isStatic.value && dragging) emit('commit')
  if (press && dragging) {
    if (press.enter !== undefined) emit('update:enterAt', press.enter)
    if (press.exit !== undefined) emit('update:exitAt', press.exit)
  }
  dragging = null
  press = null
  hoverLine.value = null
}
function leave() {
  hoverX = null
  if (!dragging) hoverLine.value = null
}

onMounted(() => { raf = requestAnimationFrame(draw) })
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <div ref="wrap" class="relative w-full select-none overflow-hidden rounded-xl bg-elevated/50 ring-1 ring-default">
    <canvas
      ref="canvas"
      class="block touch-none"
      :class="hoverLine || (editable && !isStatic) ? 'cursor-ns-resize' : isStatic ? 'cursor-crosshair' : ''"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="cancel"
      @pointerleave="leave"
    />
    <slot />
  </div>
</template>
