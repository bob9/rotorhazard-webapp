<script setup lang="ts">
/**
 * Band scanner (the classic /scanner page): a node sweeps 5645–5945 MHz and the
 * signal it sees at each frequency is drawn as it arrives. Racing is not possible
 * while a node scans, so every scan stops when this page closes.
 */
const { t } = useI18n()
const rh = useRH()
const { info } = useServerInfo()
useHead({ title: computed(() => t('Band Scanner')) })

const MIN = 5645
const MAX = 5945
const CHANNELS = [
  { freq: 5658, name: 'R1' }, { freq: 5695, name: 'R2' }, { freq: 5732, name: 'R3' }, { freq: 5769, name: 'R4' },
  { freq: 5806, name: 'R5' }, { freq: 5843, name: 'R6' }, { freq: 5880, name: 'R7' }, { freq: 5917, name: 'R8' }
]
const nodes = computed(() => Array.from({ length: info.value?.num_nodes || 0 }, (_, i) => i))

type Sample = { cur: number, min: number, max: number }
const scans = reactive<Record<number, { on: boolean, data: Map<number, Sample>, top: number, tick: number }>>({})
function scanOf(i: number) {
  return (scans[i] ||= { on: false, data: new Map(), top: 100, tick: 0 })
}

function setScan(i: number, on: boolean) {
  const s = scanOf(i)
  s.on = on
  s.data = new Map()
  s.top = 100
  s.tick++
  rh.emit('set_scan', {
    node: i,
    min_scan_frequency: on ? MIN : 0,
    max_scan_frequency: on ? MAX : 0,
    max_scan_interval: on ? 1 : 0,
    min_scan_interval: on ? 1 : 0,
    scan_zoom: on ? 1 : 0
  })
}

rh.on('heartbeat', (d: any) => {
  const rssi: number[] = d?.current_rssi || []
  const freq: number[] = d?.frequency || []
  for (let i = 0; i < rssi.length; i++) {
    const s = scans[i]
    if (!s?.on || !(freq[i]! > 0)) continue
    const v = rssi[i]!
    const prev = s.data.get(freq[i]!)
    s.data.set(freq[i]!, prev ? { cur: v, min: v > 0 ? Math.min(prev.min, v) : prev.min, max: Math.max(prev.max, v) } : { cur: v, min: v, max: v })
    s.top = Math.max(s.top, v + 10)
    s.tick++
  }
})

// stop every scan this page started (the node then returns to its race frequency)
function stopAll() {
  for (const [i, s] of Object.entries(scans)) if (s.on) setScan(Number(i), false)
}
onBeforeUnmount(stopAll)
if (import.meta.client) window.addEventListener('pagehide', stopAll)
onBeforeUnmount(() => window.removeEventListener('pagehide', stopAll))

// SVG chart geometry: x over the band, y over the signal
const W = 600
const H = 180
const MHZ_TICKS = [5650, 5700, 5750, 5800, 5850, 5900]
// signal gridlines: four even steps up to the chart's current top
function gridOf(i: number) {
  const top = scanOf(i).top
  const step = Math.max(10, Math.ceil(top / 4 / 10) * 10)
  const out: { v: number, y: number }[] = []
  for (let v = 0; v <= top; v += step) out.push({ v, y: 100 - (v / top) * 100 })
  return out
}
const x = (f: number) => ((f - MIN) / (MAX - MIN)) * W
function points(i: number, key: keyof Sample) {
  const s = scanOf(i)
  void s.tick
  return [...s.data.entries()].sort((a, b) => a[0] - b[0]).map(([f, v]) => `${x(f).toFixed(1)},${(H - (v[key] / s.top) * H).toFixed(1)}`).join(' ')
}
function bars(i: number) {
  const s = scanOf(i)
  void s.tick
  return [...s.data.entries()].map(([f, v]) => ({ x: x(f), h: (v.cur / s.top) * H }))
}
</script>

<template>
  <UDashboardPanel id="scanner">
    <template #header>
      <UDashboardNavbar :title="t('Band Scanner')">
        <template #leading>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" to="/timer" :aria-label="t('Timer')" />
        </template>
        <template #right>
          <RhBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-6">
        <UAlert
          icon="i-lucide-triangle-alert"
          color="neutral"
          variant="subtle"
          :title="t('Scanning takes a node off its race frequency')"
          :description="t('Use this between races to look for video transmitters and interference. Scans stop when you leave this page.')"
        />
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <UCard v-for="i in nodes" :key="i" :ui="{ body: 'space-y-3' }">
            <div class="flex items-center justify-between gap-3">
              <div class="font-medium text-highlighted">
                {{ t('Node') }} {{ i + 1 }}
              </div>
              <USwitch :model-value="scanOf(i).on" :label="t('Scan')" @update:model-value="(v: boolean) => setScan(i, v)" />
            </div>
            <!-- the plot stretches to the card; its labels are page text so they never distort -->
            <div class="grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-2">
              <div class="relative h-44 text-right text-[11px] tabular text-muted" aria-hidden="true">
                <span v-for="g in gridOf(i)" :key="g.v" class="absolute right-0 -translate-y-1/2" :style="{ top: `${g.y}%` }">{{ g.v }}</span>
              </div>
              <svg :viewBox="`0 0 ${W} ${H}`" class="block h-44 w-full overflow-visible" preserveAspectRatio="none" role="img" :aria-label="`${t('Node')} ${i + 1}: ${t('signal across')} ${MIN}–${MAX} MHz`">
                <line v-for="g in gridOf(i)" :key="`g${g.v}`" x1="0" :x2="W" :y1="(g.y / 100) * H" :y2="(g.y / 100) * H" class="stroke-(--ui-border)" vector-effect="non-scaling-stroke" />
                <line v-for="c in CHANNELS" :key="c.name" :x1="x(c.freq)" :x2="x(c.freq)" y1="0" :y2="H" class="stroke-(--ui-border-accented)" stroke-dasharray="2 4" vector-effect="non-scaling-stroke" />
                <rect v-for="(b, k) in bars(i)" :key="k" :x="b.x - 1" :y="H - b.h" width="2" :height="b.h" class="fill-primary/70" />
                <polyline :points="points(i, 'max')" fill="none" class="stroke-error" stroke-width="1.2" vector-effect="non-scaling-stroke" />
                <polyline :points="points(i, 'min')" fill="none" class="stroke-(--ui-text-muted)" stroke-width="1" vector-effect="non-scaling-stroke" />
                <line x1="0" :x2="W" :y1="H" :y2="H" class="stroke-(--ui-border-accented)" vector-effect="non-scaling-stroke" />
              </svg>
              <div />
              <!-- MHz along the band, with the Raceband channels beneath -->
              <div class="relative h-9 text-[11px] tabular" aria-hidden="true">
                <span v-for="f in MHZ_TICKS" :key="f" class="absolute top-1 -translate-x-1/2 text-muted" :style="{ left: `${(x(f) / W) * 100}%` }">{{ f }}</span>
                <span v-for="c in CHANNELS" :key="`c${c.name}`" class="absolute top-5 -translate-x-1/2 font-medium text-dimmed" :style="{ left: `${(x(c.freq) / W) * 100}%` }">{{ c.name }}</span>
              </div>
            </div>
            <p v-if="!scanOf(i).on" class="text-center text-xs text-dimmed">
              {{ t('Turn on Scan to sweep 5645–5945 MHz.') }}
            </p>
            <div v-else class="flex justify-center gap-4 text-xs text-muted">
              <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 bg-error" />{{ t('Peak') }}</span>
              <span class="flex items-center gap-1.5"><span class="size-2 rounded-sm bg-primary/70" />{{ t('Now') }}</span>
              <span class="flex items-center gap-1.5"><span class="h-0.5 w-4 bg-(--ui-text-muted)" />{{ t('Lowest') }}</span>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
