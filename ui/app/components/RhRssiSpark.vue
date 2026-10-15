<script setup lang="ts">
/** A seat's signal over the last few seconds, with EnterAt / ExitAt lines and passes shaded. */
const props = withDefaults(defineProps<{
  node: number
  enterAt?: number
  exitAt?: number
  color?: string
  windowSec?: number
}>(), { color: '#fe5d11', windowSec: 10 })

const { series, version } = useRssiHistory()
const H = 32

const view = computed(() => {
  void version.value
  const now = performance.now()
  const winMs = props.windowSec * 1000
  const pts = series(props.node).filter(p => p.t >= now - winMs - 500)
  let hi = Math.max((props.enterAt || 100) * 1.25, 60)
  let lo = props.exitAt ?? 0
  for (const p of pts) {
    if (p.v > hi) hi = p.v
    if (p.v < lo) lo = p.v
  }
  lo = Math.max(0, lo - 10)
  hi += 4
  const x = (t: number) => 100 - ((now - t) / winMs) * 100
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * H
  const line = pts.map(p => `${x(p.t).toFixed(2)},${y(p.v).toFixed(2)}`).join(' ')
  // one band per pass (from its first crossing reading to the reading after its last)
  const bands: { x: number, w: number }[] = []
  let from: number | null = null
  pts.forEach((p, i) => {
    if (p.c && from === null) from = x(p.t)
    const next = pts[i + 1]
    if (from !== null && (!next || !p.c)) {
      const to = p.c ? 100 : x(p.t)
      bands.push({ x: from, w: to - from })
      from = null
    }
  })
  return {
    line,
    area: pts.length > 1 ? `${x(pts[0]!.t).toFixed(2)},${H} ${line} ${x(pts[pts.length - 1]!.t).toFixed(2)},${H}` : '',
    bands,
    enterY: props.enterAt ? y(props.enterAt) : null,
    exitY: props.exitAt ? y(props.exitAt) : null
  }
})
</script>

<template>
  <svg :viewBox="`0 0 100 ${H}`" preserveAspectRatio="none" class="block h-8 w-full overflow-hidden rounded-md bg-accented/40" aria-hidden="true">
    <rect v-for="(b, i) in view.bands" :key="i" :x="b.x" y="0" :width="b.w" :height="H" :fill="color" fill-opacity="0.18" />
    <polygon v-if="view.area" :points="view.area" :fill="color" fill-opacity="0.15" />
    <polyline :points="view.line" fill="none" :stroke="color" stroke-width="1.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
    <line v-if="view.exitY !== null" x1="0" x2="100" :y1="view.exitY" :y2="view.exitY" class="stroke-warning/80" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
    <line v-if="view.enterY !== null" x1="0" x2="100" :y1="view.enterY" :y2="view.enterY" class="stroke-error/80" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" />
  </svg>
</template>
