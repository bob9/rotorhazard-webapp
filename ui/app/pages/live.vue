<script setup lang="ts">
/** Spectator view of the current race (classic "Current" page). */
import { currentStatusMessage } from '~/utils/winner'

const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Live')) })
const audio = useAudio()
const route = useRoute()
const router = useRouter()
const { info } = useServerInfo()
const logoUrl = useRuntimeConfig().app.baseURL + 'rh-icon.svg'
rh.load(['race_status', 'current_heat', 'current_laps', 'leaderboard', 'frequency_data', 'pilot_data', 'min_lap', 'format_data', 'seat_data'])

const S = rh.state
const status = computed<number>(() => S.race_status?.race_status ?? 0)
const loaded = computed(() => !!(S.race_status && S.leaderboard && S.current_heat))
const heatNodes = computed(() => S.current_heat?.heatNodes || {})
const seats = computed(() => Object.keys(heatNodes.value).map(Number).filter(i => heatNodes.value[i]?.pilot_id || S.current_heat?.current_heat == null))
const seatColors = computed(() => Object.fromEntries(Object.keys(heatNodes.value).map(i => [Number(i), colorHex(heatNodes.value[i]?.activeColor)])))

// between races the server also sends the previous race ('last_race'); show it until the next one starts
const showLast = computed(() => status.value === RACE_STATUS.READY && !!S.leaderboard?.last_race)
const lb = computed(() => (showLast.value ? S.leaderboard?.last_race : S.leaderboard?.current) || {})
const laps = computed<any[]>(() => ((showLast.value ? S.current_laps?.last_race : S.current_laps?.current) || {}).node_index || [])
const rowsByNode = computed(() => {
  const m: Record<number, any> = {}
  for (const r of lb.value?.leaderboard?.by_race_time || []) m[r.node] = r
  return m
})
// seats shown: the current heat's lineup, or the last race's own pilots between races
// (the current heat has usually advanced to the next heat by then)
const seatColorByIndex = computed<Record<number, string>>(() => Object.fromEntries((S.seat_data?.seats || []).map((s: any) => [s.seat_id, s.color])))
const shownSeats = computed(() => {
  if (!showLast.value) return seats.value.map(i => ({ seat: i, node: heatNodes.value[i] }))
  return laps.value
    .map((l: any, i: number) => ({ l, i }))
    .filter(({ l }) => l?.pilot || l?.laps?.length)
    .map(({ l, i }) => ({ seat: i, node: { callsign: l.pilot?.callsign, pilot_id: l.pilot?.id, activeColor: seatColorByIndex.value[i] } }))
})
const statusMessage = computed(() => currentStatusMessage(lb.value))
const minLapMs = computed(() => (S.min_lap?.min_lap || 0) * 1000)
const nextHeat = computed(() => S.leaderboard?.current?.displayname)
const nextRound = computed(() => S.current_heat?.next_round)
const nextPilots = computed(() => Object.values(heatNodes.value).map((n: any) => n.callsign).filter(Boolean).join(' · '))
// the card names what it shows: the race being run, the heat about to run, or the last race
// (saved, or finished and awaiting save: the status label already says FINISHED)
const heroLabel = computed(() => showLast.value || status.value === RACE_STATUS.DONE
  ? t('Last race')
  : status.value === RACE_STATUS.RACING || status.value === RACE_STATUS.STAGING
    ? t('Now racing')
    : t('Up next'))

// ---- presentation mode (?kiosk=1): no app chrome, type scaled up with the screen ----
const kiosk = useKiosk()
const zoom = ref(1)
const fullscreen = ref(false)
const canFullscreen = ref(false)
// the controls fade out while the pointer rests, and come back when it moves
const idle = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | undefined
function wake() {
  idle.value = false
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => { idle.value = true }, 3000)
}
// A projector can't scroll, so presentation mode always fits the screen: the type is scaled
// with the width, then to the largest size at which everything fits the height. On a landscape screen the
// race card and the leaderboard sit side by side, with compact seat cards below; when even
// those don't fit at a readable size (many seats on a short screen) the seat cards give way,
// since the leaderboard already shows each pilot's laps and times.
const kioskBody = useTemplateRef<HTMLElement>('kioskBody')
const landscape = ref(true)
const seatsFit = ref(true)
let fitting = false
let fitAgain = false
async function fit() {
  if (!kiosk.value) {
    zoom.value = 1
    return
  }
  if (fitting) {
    fitAgain = true
    return
  }
  fitting = true
  fitAgain = false
  try {
    const W = window.innerWidth
    landscape.value = W >= window.innerHeight * 1.15
    // type as large as the width allows (a 1920px screen gets ~1.4x), a little larger when the
    // screen has room to spare
    const preferred = Math.min(3.2, Math.max(0.6, W / (landscape.value ? 1350 : 760)))
    const fits = async (z: number) => {
      zoom.value = z
      await nextTick()
      // the panel body scrolls when the content is taller than the screen, and a table
      // scrolls sideways when its columns are wider than their card
      const box = kioskBody.value
      const body = box?.parentElement
      if (!box || !body) return true
      return body.scrollHeight - body.clientHeight <= 1
        && Array.from(box.querySelectorAll<HTMLElement>('.overflow-x-auto')).every(el => el.scrollWidth - el.clientWidth <= 1)
    }
    for (const withSeats of [true, false]) {
      seatsFit.value = withSeats
      let lo = 0.3
      // up to well past the width's preferred size, so a short board fills the screen's height
      // instead of leaving its lower part empty (the table and card checks still bound the width)
      let hi = Math.min(5, preferred * 1.8)
      if (!(await fits(hi))) {
        // the largest size that fits, to within a few percent
        while (hi - lo > 0.02) {
          const mid = (lo + hi) / 2
          if (await fits(mid)) lo = mid
          else hi = mid
        }
        await fits(lo)
        hi = lo
      }
      // seats stay while the type stays readable (at least three quarters of its preferred size)
      if (!withSeats || !shownSeats.value.length || hi >= Math.max(0.55, preferred * 0.75)) break
    }
  } finally {
    fitting = false
    if (fitAgain) refit()
  }
}
// what's on screen changes size during a race (status line, laps, the next heat): fit again
let fitRO: ResizeObserver | undefined
let fitFrame = 0
const refit = () => {
  cancelAnimationFrame(fitFrame)
  fitFrame = requestAnimationFrame(() => fit())
}
watch(kioskBody, (el) => {
  fitRO?.disconnect()
  if (el && typeof ResizeObserver !== 'undefined') {
    fitRO = new ResizeObserver(refit)
    fitRO.observe(el)
  }
})
watch([kiosk, () => shownSeats.value.length, status, showLast, loaded], refit)
const onFullscreen = () => { fullscreen.value = !!document.fullscreenElement }
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  else document.documentElement.requestFullscreen?.().catch(() => {})
}
function present() {
  // asked for in the click itself: browsers allow full screen only in answer to one
  if (canFullscreen.value && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {})
  router.push({ query: { ...route.query, kiosk: '1' } })
}
function exitKiosk() {
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  router.replace({ query: { ...route.query, kiosk: undefined } })
}
function onKioskKey(e: KeyboardEvent) {
  wake()
  if (!kiosk.value || e.target instanceof HTMLInputElement) return
  if (e.key === 'Escape' && !document.fullscreenElement && !document.querySelector('[role="dialog"]')) exitKiosk()
  else if (e.key.toLowerCase() === 'f' && !e.ctrlKey && !e.metaKey && !e.altKey) toggleFullscreen()
}
onMounted(() => {
  canFullscreen.value = !!document.fullscreenEnabled
  onFullscreen()
  refit()
  wake()
  window.addEventListener('resize', refit)
  window.addEventListener('pointermove', wake, { passive: true })
  window.addEventListener('keydown', onKioskKey)
  document.addEventListener('fullscreenchange', onFullscreen)
})
onBeforeUnmount(() => {
  clearTimeout(idleTimer)
  fitRO?.disconnect()
  cancelAnimationFrame(fitFrame)
  window.removeEventListener('resize', refit)
  window.removeEventListener('pointermove', wake)
  window.removeEventListener('keydown', onKioskKey)
  document.removeEventListener('fullscreenchange', onFullscreen)
})
// up to six seats side by side; more take two rows, so each card keeps room for its times
const kioskSeatCols = computed(() => {
  const n = Math.max(1, shownSeats.value.length)
  return n > 6 ? Math.ceil(n / 2) : n
})
const kioskZoom = computed(() => (kiosk.value ? { zoom: zoom.value } : undefined))
</script>

<template>
  <UDashboardPanel id="live" :class="kiosk && idle ? 'cursor-none' : ''">
    <template #header>
      <!-- presentation mode: the event's name, and controls that fade out while the pointer rests -->
      <div v-if="kiosk" class="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6" :style="kioskZoom">
        <img :src="logoUrl" alt="" class="size-7 shrink-0">
        <span class="min-w-0 truncate font-display text-lg font-semibold text-highlighted">{{ info?.event?.name || 'RotorHazard' }}</span>
        <div class="ms-auto flex items-center gap-1 transition-opacity duration-500 focus-within:opacity-100" :class="idle ? 'opacity-0' : 'opacity-100'">
          <RhAudioToggle />
          <UTooltip v-if="canFullscreen" :text="fullscreen ? t('Exit full screen') : t('Full screen')" :kbds="['F']">
            <UButton
              color="neutral"
              variant="ghost"
              :icon="fullscreen ? 'i-lucide-minimize' : 'i-lucide-maximize'"
              :aria-label="fullscreen ? t('Exit full screen') : t('Full screen')"
              @click="toggleFullscreen"
            />
          </UTooltip>
          <UTooltip :text="t('Exit presentation mode')" :kbds="['Esc']">
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('Exit presentation mode')" @click="exitKiosk" />
          </UTooltip>
        </div>
      </div>
      <UDashboardNavbar v-else :title="t('Live')">
        <template #right>
          <RhBell />
          <RhAudioToggle />
          <UTooltip :text="t('Presentation mode: full screen, for a projector or TV')">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-presentation"
              :aria-label="t('Presentation mode')"
              :label="t('Present')"
              :ui="{ label: 'hidden sm:inline' }"
              @click="present"
            />
          </UTooltip>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!loaded" class="mx-auto w-full max-w-6xl space-y-6" aria-busy="true" :style="kioskZoom">
        <USkeleton class="h-48 w-full rounded-2xl" />
        <USkeleton class="h-64 w-full rounded-2xl" />
      </div>
      <div
        v-else
        ref="kioskBody"
        class="mx-auto grid w-full gap-6"
        :class="kiosk && landscape ? 'grid-cols-[minmax(0,4fr)_minmax(0,8fr)] items-stretch' : 'max-w-6xl grid-cols-1'"
        :style="kioskZoom"
      >
        <!-- side by side, the race card and the leaderboard share one height -->
        <div class="min-w-0 space-y-6" :class="kiosk && landscape ? 'flex flex-col' : ''">
          <!-- between races: a compact header for the last race; during one: the big clock -->
          <section
            class="flex flex-col items-center justify-center gap-2 rounded-2xl bg-default px-6 text-center ring ring-default"
            :class="[showLast ? 'py-5' : 'py-8 sm:py-10', kiosk && landscape ? 'flex-1' : '']"
          >
            <div class="text-sm font-medium text-muted">
              {{ heroLabel }}<template v-if="showLast && lb.round"> · {{ t('Round') }} {{ lb.round }}</template>
            </div>
            <h1 class="text-balance font-display font-semibold text-highlighted" :class="showLast ? 'text-2xl' : 'text-3xl sm:text-4xl'">
              {{ lb.displayname || t('Practice') }}
            </h1>
            <div v-if="lb.round && !showLast" class="text-sm font-medium text-muted">
              {{ t('Round') }} {{ lb.round }}
            </div>
            <!-- between races this card shows the last race's result, not the next race's clock -->
            <RhRaceClock v-if="!showLast" class="mt-4" />
            <div v-if="statusMessage" class="mt-3 rounded-full bg-elevated px-4 py-1.5 text-sm font-medium">
              {{ statusMessage }}
            </div>
          </section>

          <!-- the same card as the race card and the leaderboard beside it -->
          <section v-if="showLast && nextHeat" class="flex items-start gap-3 rounded-2xl bg-default px-5 py-4 ring ring-default">
            <UIcon name="i-lucide-arrow-right-circle" class="mt-0.5 size-5 shrink-0 text-muted" />
            <div class="min-w-0 space-y-1">
              <div class="text-sm font-semibold text-highlighted">
                {{ t('Up next') }}: {{ nextHeat }}<template v-if="nextRound"> · {{ t('Round') }} {{ nextRound }}</template>
              </div>
              <div v-if="nextPilots" class="text-sm text-muted">
                {{ nextPilots }}
              </div>
            </div>
          </section>
        </div>

        <div class="min-w-0 space-y-6" :class="kiosk && landscape ? 'flex flex-col' : ''">
          <UCard :class="kiosk && landscape ? 'flex flex-1 flex-col' : ''" :ui="{ body: kiosk && landscape ? 'flex-1 p-0 sm:p-0' : 'p-0 sm:p-0' }">
            <RhLeaderboard :board="lb.leaderboard" kind="current" :seat-colors="seatColors" :min-lap-ms="minLapMs" top-speed :fill="kiosk && landscape" />
          </UCard>
          <UCard v-if="lb.team_leaderboard" :ui="{ body: 'p-0 sm:p-0' }">
            <RhTeamLeaderboard :board="lb.team_leaderboard" />
          </UCard>
        </div>

        <!-- presentation mode: compact cards (no lap lists) in one row on a landscape screen -->
        <div
          v-if="!kiosk || seatsFit"
          class="grid gap-4"
          :class="kiosk ? (landscape ? 'col-span-2' : 'grid-cols-2') : 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-4'"
          :style="kiosk && landscape ? { gridTemplateColumns: `repeat(${kioskSeatCols}, minmax(0, 1fr))` } : undefined"
        >
          <RhSeatCard
            v-for="s in shownSeats"
            :key="s.seat"
            :seat="s.seat"
            :node="s.node"
            :freq="S.frequency_data?.fdata?.[s.seat]"
            :laps="(laps[s.seat]?.laps || []).filter((l: any) => !l.late_lap)"
            :fastest-index="laps[s.seat]?.fastest_lap_index"
            :finished="laps[s.seat]?.finished_flag"
            :row="rowsByNode[s.seat]"
            :rssi="S.heartbeat?.current_rssi?.[s.seat]"
            :crossing="S.heartbeat?.crossing_flag?.[s.seat]"
            :min-lap-ms="minLapMs"
            :show-signal="false"
            :compact="kiosk"
          />
        </div>

        <p v-if="!audio.unlocked.value && audio.settings.enabled" class="text-center text-sm text-muted" :class="kiosk && landscape ? 'col-span-2' : ''">
          {{ t('Tap anywhere to hear race callouts on this device.') }}
        </p>
      </div>
    </template>
  </UDashboardPanel>
</template>
