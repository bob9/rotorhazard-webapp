<script setup lang="ts">
import { currentStatusMessage } from '~/utils/winner'
const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Race')) })
const { admin, hasCredentials } = useAuth()
const { info } = useServerInfo()
const audio = useAudio()
const toast = useToast()

rh.load([
  'race_status', 'current_heat', 'current_laps', 'leaderboard', 'frequency_data', 'heat_data', 'class_data',
  'format_data', 'pilot_data', 'node_data', 'enter_and_exit_at_levels', 'min_lap', 'callouts', 'node_tuning'
])

// guests can't run races: send them to the spectator view once sign-in status is known.
// A device with saved credentials that failed the check (wrong password, or the
// timer briefly unreachable) gets the sign-in prompt instead of being sent away.
const guest = computed(() => admin.value === false && !hasCredentials())
watch(guest, (g) => {
  if (g) navigateTo('/live', { replace: true })
}, { immediate: true })

const S = rh.state
const liveStatus = computed<number>(() => S.race_status?.race_status ?? 0)
// Save Results: the timer first resets the race (no laps, empty leaderboard, Ready) and only
// then moves to the next heat, about a second later. The finished race stays on screen
// (status, clock, laps, leaderboard) until the save is done, then everything switches together.
const saveHold = ref(false)
const status = computed<number>(() => saveHold.value ? RACE_STATUS.DONE : liveStatus.value)
// until the timer has sent the race, heat and seats, show placeholders rather than a
// made-up Practice race with a live Start button (the class completes the race card: arriving
// later it would widen it and push the seats down). The format list comes last of the race
// data and is not waited for: its picker keeps its place with a placeholder meanwhile.
const loaded = computed(() => !!(S.race_status && S.current_heat && S.frequency_data && S.heat_data && S.class_data))
const isReady = computed(() => loaded.value && status.value === RACE_STATUS.READY)

// The heat, its seats and its leaderboard arrive as separate messages (after Save Results the
// next heat's lineup can come a moment before or after its leaderboard). Show them together:
// the previous race stays up until both name the same heat, so the card never pairs one
// heat's name with another heat's pilots. (A mismatch that doesn't resolve is shown after 1.5s.)
const heatOf = (v: any) => Number(v || 0)
const snapshot = () => ({ heat: S.current_heat, board: S.leaderboard, laps: S.current_laps })
const view = shallowRef(snapshot())
const heatsAgree = () => {
  const lbHeat = S.leaderboard?.current
  return !S.current_heat || !lbHeat || heatOf(S.current_heat.current_heat) === heatOf(lbHeat.heat)
}
let viewTimer: ReturnType<typeof setTimeout> | undefined
watch(() => [S.current_heat, S.leaderboard, S.current_laps], () => {
  clearTimeout(viewTimer)
  // another device saved the finished race: its laps clear first, then the status and heat follow
  if (!saveHold.value && liveStatus.value === RACE_STATUS.DONE && hasLaps(view.value.laps) && !hasLaps(S.current_laps)) startObserverHold()
  if (saveHold.value) return tryEndSaveHold()
  if (heatsAgree()) view.value = snapshot()
  else viewTimer = setTimeout(() => { view.value = snapshot() }, 1500)
})
// the hold ends once the server confirms the save (race_saved comes after the move to the next
// heat) and the heat and leaderboard agree; it never outlasts a few seconds (a refused save,
// a save that stays on the same heat, a lost message)
let saveConfirmed = false
let holdTimer: ReturnType<typeof setTimeout> | undefined
function endSaveHold() {
  clearTimeout(holdTimer)
  if (!saveHold.value) return
  saveHold.value = false
  view.value = snapshot()
}
function tryEndSaveHold() {
  if (saveConfirmed && heatsAgree()) endSaveHold()
}
function startSaveHold(limit = 4000) {
  saveConfirmed = false
  saveHold.value = true
  clearTimeout(holdTimer)
  holdTimer = setTimeout(endSaveHold, limit)
}
// A save made on another device looks the same here: the finished race is cleared, then the
// timer moves to the next heat. Hold the finished race just the same, unless this device
// cleared it itself (Discard, Stop and Save, Clear Laps). A discard elsewhere can't be told
// apart from a save until no heat change follows, so that hold is shorter.
const hasLaps = (l: any) => (l?.current?.node_index || []).some((s: any) => s?.laps?.length)
let localResetAt = 0
function startObserverHold() {
  if (saveHold.value || !currentHeatId.value || Date.now() - localResetAt < 5000) return
  startSaveHold(3000)
}
rh.on('race_saved', () => {
  if (!saveHold.value) return
  saveConfirmed = true
  clearTimeout(holdTimer)
  holdTimer = setTimeout(endSaveHold, 1500)
  tryEndSaveHold()
})
// someone started the next race meanwhile
watch(liveStatus, (s, old) => {
  if (s === RACE_STATUS.STAGING || s === RACE_STATUS.RACING) endSaveHold()
  else if (s === RACE_STATUS.READY && old === RACE_STATUS.DONE) startObserverHold()
})
onBeforeUnmount(() => { clearTimeout(viewTimer); clearTimeout(holdTimer) })

// phones: the sticky action bar repeats the clock only when the race card's clock is off screen
const heroClock = ref<HTMLElement | null>(null)
const heroClockVisible = ref(true)
let heroObserver: IntersectionObserver | undefined
watch(heroClock, (el) => {
  heroObserver?.disconnect()
  if (!el) return
  heroObserver = new IntersectionObserver(([e]) => { heroClockVisible.value = !!e?.isIntersecting }, { threshold: 0.4 })
  heroObserver.observe(el)
})
onBeforeUnmount(() => heroObserver?.disconnect())
const isLive = computed(() => status.value === RACE_STATUS.RACING || status.value === RACE_STATUS.STAGING)
const isRacing = computed(() => status.value === RACE_STATUS.RACING)
const isDone = computed(() => status.value === RACE_STATUS.DONE)

const numNodes = computed(() => info.value?.num_nodes ?? S.frequency_data?.fdata?.length ?? 0)
const heatNodes = computed(() => view.value.heat?.heatNodes || {})
// like the classic Run page, show only seats with a frequency (or a pilot in this heat)
const seats = computed(() => Array.from({ length: numNodes.value }, (_, i) => i)
  .filter(i => S.frequency_data?.fdata?.[i]?.frequency || heatNodes.value[i]?.pilot_id))
const seatColors = computed(() => Object.fromEntries(seats.value.map(i => [i, colorHex(heatNodes.value[i]?.activeColor)])))
const lapsBySeat = computed<any[]>(() => view.value.laps?.current?.node_index || [])
const board = computed(() => view.value.board?.current?.leaderboard)
const teamBoard = computed(() => view.value.board?.current?.team_leaderboard)
const rowsByNode = computed(() => {
  const m: Record<number, any> = {}
  for (const r of board.value?.by_race_time || []) m[r.node] = r
  return m
})
const statusMessage = computed(() => currentStatusMessage(view.value.board?.current))
const minLapMs = computed(() => (S.min_lap?.min_lap || 0) * 1000)
const anyLaps = computed(() => lapsBySeat.value.some(s => s?.laps?.length))

// heat / format
const heats = computed<any[]>(() => S.heat_data?.heats || [])
const classes = computed<any[]>(() => S.class_data?.classes || [])
const formats = computed<any[]>(() => S.format_data?.formats || [])
const currentHeatId = computed<number | null>(() => view.value.heat?.current_heat ?? null)
const currentHeat = computed(() => heats.value.find(h => h.id === currentHeatId.value))
const currentClass = computed(() => classes.value.find(c => c.id === currentHeat.value?.class_id))
const currentFormat = computed(() => formats.value.find(f => f.id === S.race_status?.race_format_id))
const heatName = computed(() => view.value.board?.current?.displayname || currentHeat.value?.displayname || t('Practice'))
const round = computed(() => view.value.heat?.next_round || S.race_status?.next_round)

const heatItems = computed(() => {
  const groups: any[] = [[{ label: t('Practice Mode'), value: 0, icon: 'i-lucide-dumbbell', description: t('Races are not saved') }]]
  const active = heats.value.filter(h => h.active !== false)
  const byClass = new Map<number | null, any[]>()
  for (const h of active) {
    const k = h.class_id ?? null
    if (!byClass.has(k)) byClass.set(k, [])
    byClass.get(k)!.push(h)
  }
  const ordered = [...classes.value.map(c => c.id), null]
  for (const cid of ordered) {
    const hs = byClass.get(cid)
    if (!hs?.length) continue
    const cls = classes.value.find(c => c.id === cid)
    groups.push([
      { type: 'label', label: cls ? cls.displayname : t('Unclassified') },
      ...hs.map(h => ({ label: h.displayname, value: h.id, description: [heatStatus(h), heatPilots(h)].filter(Boolean).join(' · ') }))
    ])
  }
  return groups
})
function heatStatus(h: any) {
  // in heat data, next_round holds the highest saved round (rounds raced so far)
  const raced = Math.max(0, Number(h.next_round) || 0)
  return raced ? `${raced} ${raced === 1 ? t('round raced') : t('rounds raced')}` : t('Not raced')
}
function heatPilots(h: any) {
  const pilots = S.pilot_data?.pilots || []
  return (h.slots || []).map((s: any) => pilots.find((p: any) => p.pilot_id === s.pilot_id)?.callsign).filter(Boolean).join(', ')
}
const selectedHeat = computed({
  get: () => currentHeatId.value ?? 0,
  set: (v: number) => rh.emit('set_current_heat', { heat: v || null })
})
// formats grouped by racing mode, like the heat picker groups heats by class
const formatItems = computed<any[]>(() => {
  const modes = [
    { mode: 0, label: t('Individual') },
    { mode: 1, label: t('Team') },
    { mode: 2, label: t('Co-op') }
  ]
  return modes
    .map(m => {
      const fs = formats.value.filter(f => (f.team_racing_mode || 0) === m.mode)
      return fs.length ? [{ type: 'label' as const, label: m.label }, ...fs.map(f => ({ label: t(f.name), value: f.id }))] : []
    })
    .filter(g => g.length)
})
const selectedFormat = computed({
  get: () => S.race_status?.race_format_id ?? undefined,
  set: (v: number) => rh.emit('set_race_format', { race_format: v })
})
const formatLocked = computed(() => !!view.value.heat?.heat_format)

// heat navigation: previous/next heat in the list
const flatHeats = computed(() => heatItems.value.flat().filter((i: any) => i.value !== undefined && i.type !== 'label'))
function stepHeat(dir: number) {
  const idx = flatHeats.value.findIndex((i: any) => i.value === (currentHeatId.value ?? 0))
  const next = flatHeats.value[idx + dir] as any
  if (next) selectedHeat.value = next.value
}

// actions
const discardOpen = ref(false)
// spinner on Start/Stop/Save until the race status changes, or 3s if the server refused (the server
// explains why with a priority message)
const busy = ref(false)
let busyTimer: ReturnType<typeof setTimeout> | undefined
function send(event: string) {
  busy.value = true
  clearTimeout(busyTimer)
  busyTimer = setTimeout(() => { busy.value = false }, 3000)
  rh.emit(event)
}
function start() {
  audio.unlock()
  send('stage_race')
}
watch(status, () => {
  busy.value = false
  clearTimeout(busyTimer)
})
// The action buttons swap as the race moves on (Stop for Start, Save for Stop...), which would
// drop keyboard focus to the page. Move it to the new primary action, but only when focus was
// on the race controls or nowhere: never take it from something else.
const actionsEl = ref<HTMLElement | null>(null)
const barEl = ref<HTMLElement | null>(null)
const inControls = (el: Element | null) => !!el && (!!actionsEl.value?.contains(el) || !!barEl.value?.contains(el))
watch(status, () => {
  const before = document.activeElement
  if (before && before !== document.body && !inControls(before)) return
  nextTick(() => {
    const now = document.activeElement
    if (now && now !== document.body && now !== before && !inControls(now)) return
    const primary = [...document.querySelectorAll<HTMLElement>('[data-rh-primary]')]
      .find(b => b.offsetParent !== null && !b.matches(':disabled'))
    if (primary && primary !== now) primary.focus({ preventScroll: true })
  })
})
onBeforeUnmount(() => clearTimeout(busyTimer))
function stop() {
  send('stop_race')
}
function save() {
  localResetAt = Date.now()
  // Practice races aren't saved (the timer just clears them), and Stop and Save during a race
  // shows the race stopping: only a finished heat race is held on screen while it saves
  if (liveStatus.value === RACE_STATUS.DONE && currentHeatId.value) startSaveHold()
  send('save_laps')
}
// confirm from the server's own notice rather than on click
rh.on('race_saved', (d: any) => {
  const heat = heats.value.find(h => h.id === d?.heat_id)
  toast.add({ title: t('Race saved'), description: heat?.displayname, icon: 'i-lucide-check-circle', color: 'success' })
  // the server doesn't resend heat data after a normal save: refresh it for rounds raced
  // (grouped classes get it before this notice, so there's nothing to wait for)
  const grouped = classes.value.find(c => c.id === heat?.class_id)?.round_type === 1
  if (heat?.class_id) classToCheck.value = { cid: heat.class_id, heatId: heat.id, before: grouped ? -1 : racedRounds(heat) }
  rh.refresh(['heat_data'])
})

// Say when a save completes a class with a set number of rounds, and point to what
// usually comes next. Races-per-heat classes are complete once every heat has raced the
// rounds; grouped classes deactivate each heat as it's raced and stop adding new ones.
const racedRounds = (h: any) => Number(h?.next_round) || 0
const classToCheck = ref<{ cid: number, heatId: number, before: number } | null>(null)
const classesAnnounced = new Set<number>()
watch(heats, () => {
  if (!classToCheck.value) return
  const { cid, heatId, before } = classToCheck.value
  const saved = heats.value.find(h => h.id === heatId)
  if (!saved || racedRounds(saved) <= before) return // still the data from before the save
  classToCheck.value = null
  const cls = classes.value.find(c => c.id === cid)
  const rounds = Number(cls?.rounds) || 0
  const classHeats = heats.value.filter(h => h.class_id === cid)
  const done = !!rounds && (cls.round_type === 1
    ? !classHeats.some(h => h.active !== false)
    : classHeats.filter(h => h.active !== false).every(h => racedRounds(h) >= rounds))
  // with every heat raced, the server moves the Race page to Practice: say why, every time
  const toPractice = (currentHeatId.value ?? 0) === 0
  if (!done || (classesAnnounced.has(cid) && !toPractice)) return
  classesAnnounced.add(cid)
  toast.add({
    title: `${cls.displayname}: ${t('all rounds raced')}`,
    description: toPractice
      ? t('No heats are left to race in this class, so the Race page switched to Practice.')
      : t('Review the results, or generate heats for the next stage.'),
    icon: 'i-lucide-flag',
    color: 'primary',
    duration: 15000,
    actions: [
      { label: t('Results'), color: 'neutral', variant: 'outline', onClick: () => { navigateTo('/results') } },
      { label: t('Generate Heats'), color: 'neutral', variant: 'outline', onClick: () => { navigateTo({ path: '/heats', query: { class: String(cid), generate: '1' } }) } }
    ]
  })
})
function discard() {
  localResetAt = Date.now()
  rh.emit('discard_laps')
  discardOpen.value = false
}
function manualLap(seat: number) {
  audio.manualLapBeep()
  rh.emit('simulate_lap', { node: seat })
}

// heat plan (dynamic heats need confirmation before racing)
const plan = ref<any>(null)
rh.on('heat_plan_result', (d: any) => { plan.value = d })

// tuning while ready/racing; after the race stops the same tap opens lap correction
const tuneSeat = ref<number | null>(null)
const marshal = ref<any>(null)
const marshalSeat = ref<number | null>(null)
rh.on('current_marshal_data', (d: any) => { marshal.value = d })
watch(isDone, (d) => {
  if (d) rh.emit('current_race_marshal')
  else {
    marshal.value = null
    marshalSeat.value = null
  }
}, { immediate: true })
const marshalData = computed(() => marshalSeat.value === null ? null : marshal.value?.seats?.[marshalSeat.value] ?? null)
function openSeat(i: number) {
  if (isDone.value && marshal.value?.seats?.[i]) marshalSeat.value = i
  else tuneSeat.value = i
}
function commitMarshal(c: any) {
  rh.emit('replace_current_laps', { seat: marshalSeat.value, ...c })
  rh.emit('current_race_marshal')
  marshalSeat.value = null
}

// hotkeys (classic: z start, x stop, c save, v discard, space = primary action, alt+n manual lap)

// Plugin widgets in the dock (Auto Marshalling, Gate Walkthrough...) are drawn by their own
// scripts after the page. Last visit's dock height is kept in reserve (the widgets show as soon
// as they draw), so the tools below don't jump as they arrive. The room is released once the
// widgets have stopped growing, or when this page's plugins turn out to have no scripts.
// While they arrange themselves (one widget makes room for the next) they are drawn
// invisibly, for a second at most, so they don't slide sideways in view.
const DOCK_KEY = 'rh.pluginDockHeight'
const dock = useTemplateRef<HTMLElement>('dock')
let storedDock = 0
try { storedDock = Number(localStorage.getItem(DOCK_KEY)) || 0 } catch { /* storage unavailable */ }
const dockReserve = ref(storedDock)
const dockSettled = ref(false)
const dockShown = ref(false)
let dockShowTimer: ReturnType<typeof setTimeout> | undefined
const pluginBoot = usePluginBoot()
const { panelsFor } = usePluginUI()
const runHasScripts = computed(() => panelsFor('run').some((p: any) => (p.markdowns || []).some((m: any) => /<script[^>]*\ssrc=/i.test(String(m.desc || '')))))
let dockRO: ResizeObserver | undefined
let dockQuiet: ReturnType<typeof setTimeout> | undefined
let dockCap: ReturnType<typeof setTimeout> | undefined
let stopDockWatch: (() => void) | undefined
watch(dock, (el) => {
  dockRO?.disconnect()
  stopDockWatch?.()
  if (!el) return
  const settle = () => {
    clearTimeout(dockQuiet)
    clearTimeout(dockCap)
    clearTimeout(dockShowTimer)
    dockSettled.value = true
    dockShown.value = true
    dockReserve.value = 0
    try { localStorage.setItem(DOCK_KEY, String(el.children.length ? el.offsetHeight : 0)) } catch { /* storage unavailable */ }
  }
  // generous: plugin scripts can take several seconds on a slow device
  dockCap = setTimeout(settle, 15000)
  dockRO = new ResizeObserver(() => {
    if (dockSettled.value) return
    clearTimeout(dockQuiet)
    // settled: quiet for a moment, at the remembered height
    dockQuiet = setTimeout(() => {
      if (el.children.length && el.offsetHeight >= dockReserve.value - 4) settle()
    }, 400)
  })
  dockRO.observe(el)
  new MutationObserver(() => {
    Array.from(el.children).forEach(c => dockRO?.observe(c))
    if (el.children.length && !dockShown.value && !dockShowTimer) dockShowTimer = setTimeout(() => { dockShown.value = true }, 1000)
  }).observe(el, { childList: true })
  // every plugin panel list is in and none of this page's panels loads a script: no widgets coming
  stopDockWatch = watch(() => [pluginBoot.value.panelsPending, runHasScripts.value], () => {
    if (!dockSettled.value && !pluginBoot.value.panelsPending && !runHasScripts.value && !el.children.length) settle()
  }, { immediate: true })
})
onBeforeUnmount(() => { dockRO?.disconnect(); stopDockWatch?.(); clearTimeout(dockQuiet); clearTimeout(dockCap); clearTimeout(dockShowTimer) })
// a focused control keeps its own Space and Enter (Space on a seat's Lap button records a lap)
const CONTROLS = 'button, a[href], input, textarea, select, summary, [role=button], [role=tab], [role=switch], [role=menuitem], '
  + '[role=checkbox], [role=radio], [role=option], [role=slider], [role=combobox], [contenteditable]:not([contenteditable=false])'
function onKey(e: KeyboardEvent) {
  const el = e.target as HTMLElement
  if (!admin.value || el?.closest?.('input, textarea, select, [contenteditable]:not([contenteditable=false]), [role="dialog"], [role="listbox"], [role="menu"]')) return
  const k = e.key.toLowerCase()
  if ((k === ' ' || k === 'enter') && el?.closest?.(CONTROLS)) return
  if (e.altKey && !e.ctrlKey && /^[1-8]$/.test(e.key)) {
    if (isRacing.value) manualLap(Number(e.key) - 1)
    e.preventDefault()
    return
  }
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return
  // Space starts or stops but never saves, and saving with C only works once the race
  // has finished, so a stray key can't end and save a race in one press
  if (k === ' ') {
    e.preventDefault()
    if (isReady.value) start()
    else if (isLive.value) stop()
  } else if (k === 'z' && isReady.value) start()
  else if (k === 'x' && isLive.value) stop()
  else if (k === 'c' && isDone.value) save()
  else if (k === 'v' && isDone.value) discardOpen.value = true
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <UDashboardPanel id="race" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar :title="t('Race')">
        <template #right>
          <RhBell />
          <RhAudioToggle />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- guests are redirected to /live (see the guest watcher) -->
      <div v-if="guest" />
      <div v-else-if="admin === false" class="p-6">
        <UEmpty icon="i-lucide-lock-keyhole" :title="t('Sign in to run races')" :description="t('Race control is available to the event admin.')" :actions="[{ label: t('Watch live'), to: '/live' }]" />
      </div>
      <div v-else-if="!loaded" class="mx-auto w-full max-w-[1600px] space-y-6 p-4 sm:p-6" aria-busy="true">
        <!-- the race card's height with a typical heat (one row on desktop, stacked below lg) -->
        <USkeleton class="h-[268px] w-full rounded-3xl sm:h-[288px] lg:h-[188px]" />
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <USkeleton v-for="i in 4" :key="i" class="h-56 rounded-2xl" />
        </div>
        <USkeleton class="h-64 w-full rounded-2xl" />
      </div>
      <div v-else class="mx-auto w-full max-w-[1600px] space-y-6 p-4 pb-28 sm:p-6 sm:pb-28 lg:pb-6">
        <!-- Race control -->
        <section class="relative overflow-hidden rounded-3xl bg-default ring-1 ring-default shadow-sm">
          <RhArt name="race-hero" class="pointer-events-none absolute inset-0 hidden size-full object-cover dark:block dark:opacity-15" />
          <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.06] via-transparent to-transparent" />
          <div class="relative grid grid-cols-1 items-center gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
            <!-- heat -->
            <div class="min-w-0 space-y-3">
              <div class="flex items-center gap-1">
                <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" size="sm" :disabled="!isReady" :aria-label="t('Previous heat')" @click="stepHeat(-1)" />
                <USelectMenu
                  v-model="selectedHeat"
                  :items="heatItems"
                  value-key="value"
                  :disabled="!isReady"
                  :search-input="{ placeholder: t('Find a heat…') }"
                  variant="none"
                  class="min-w-0"
                  :ui="{ base: 'px-1 py-0', content: 'min-w-80' }"
                >
                  <template #default>
                    <div class="min-w-0 text-left">
                      <div class="truncate font-display text-2xl font-semibold text-highlighted sm:text-3xl">
                        {{ heatName }}
                      </div>
                    </div>
                  </template>
                </USelectMenu>
                <UButton icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="sm" :disabled="!isReady" :aria-label="t('Next heat')" @click="stepHeat(1)" />
              </div>
              <div class="flex flex-wrap items-center gap-2 pl-2">
                <UBadge v-if="currentClass" :label="currentClass.displayname" color="neutral" variant="subtle" />
                <UBadge v-if="currentHeatId && round" :label="`${t('Round')} ${round}`" color="neutral" variant="subtle" />
                <UBadge v-if="!currentHeatId" :label="t('Practice: races are not saved')" color="warning" variant="subtle" icon="i-lucide-info" />
                <USkeleton v-if="!S.format_data" class="h-7 w-44 rounded-md" />
                <USelectMenu
                  v-else
                  v-model="selectedFormat"
                  :items="formatItems"
                  value-key="value"
                  :disabled="!isReady || formatLocked"
                  size="sm"
                  variant="soft"
                  icon="i-lucide-timer"
                  :search-input="{ placeholder: t('Find a format…') }"
                  :placeholder="t('External format')"
                  :ui="{ content: 'min-w-72' }"
                />
              </div>
            </div>

            <!-- clock -->
            <div ref="heroClock">
              <RhRaceClock :hold="saveHold" />
            </div>

            <!-- actions (below lg they live in the sticky bar at the bottom) -->
            <div ref="actionsEl" class="hidden flex-col items-stretch gap-2 lg:flex lg:items-end">
              <!-- swapped instantly: a Stop button must always be visible during staging -->
              <UButton
                v-if="isReady"
                key="start"
                data-rh-primary
                size="xl"
                icon="i-lucide-play"
                :label="t('Start Race')"
                :loading="busy"
                class="justify-center rounded-full px-8 lg:min-w-52"
                @click="start"
              />
              <UButton
                v-else-if="isLive"
                key="stop"
                data-rh-primary
                size="xl"
                color="error"
                icon="i-lucide-square"
                :label="t('Stop Race')"
                :loading="busy"
                class="justify-center rounded-full px-8 lg:min-w-52"
                @click="stop"
              />
              <UButton
                v-else
                key="save"
                data-rh-primary
                size="xl"
                color="success"
                icon="i-lucide-check"
                :label="currentHeatId ? t('Save Results') : t('Clear Laps')"
                :loading="busy"
                class="justify-center rounded-full px-8 lg:min-w-52"
                @click="save"
              />
              <div class="flex justify-center gap-1 lg:justify-end">
                <UButton
                  v-if="isDone"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-trash-2"
                  :label="t('Discard')"
                  @click="discardOpen = true"
                />
                <UButton
                  v-if="isDone && !anyLaps"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-rotate-ccw"
                  :label="t('Restart')"
                  @click="start"
                />
                <UButton
                  v-if="isRacing"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-save"
                  :label="t('Stop and Save')"
                  @click="save"
                />
              </div>
              <div class="hidden text-center text-xs text-dimmed lg:block lg:text-right">
                <template v-if="isDone">
                  <UKbd value="C" size="sm" /> {{ currentHeatId ? t('to save') : t('to clear') }}
                </template>
                <template v-else>
                  <UKbd value="space" size="sm" /> {{ isReady ? t('to start') : t('to stop') }}
                </template>
              </div>
            </div>
          </div>
          <div v-if="statusMessage" class="relative border-t border-default bg-elevated/50 px-6 py-2.5 text-center text-sm font-medium text-highlighted">
            {{ statusMessage }}
          </div>
        </section>

        <!-- seats + leaderboard -->
        <div class="grid grid-cols-1 gap-6 2xl:grid-cols-[minmax(0,1fr)_440px]">
          <div class="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <RhSeatCard
              v-for="i in seats"
              :key="i"
              :seat="i"
              :node="heatNodes[i]"
              :freq="S.frequency_data?.fdata?.[i]"
              :laps="lapsBySeat[i]?.laps"
              :fastest-index="lapsBySeat[i]?.fastest_lap_index"
              :finished="lapsBySeat[i]?.finished_flag"
              :row="rowsByNode[i]"
              :rssi="S.heartbeat?.current_rssi?.[i]"
              :crossing="S.heartbeat?.crossing_flag?.[i]"
              :enter-at="S.enter_and_exit_at_levels?.enter_at_levels?.[i]"
              :exit-at="S.enter_and_exit_at_levels?.exit_at_levels?.[i]"
              :racing="isRacing"
              :stopped="isDone && !!currentHeatId"
              :admin="!!admin"
              :min-lap-ms="minLapMs"
              @manual-lap="manualLap(i)"
              @delete-lap="(idx: number) => rh.emit('delete_lap', { node: i, lap_index: idx })"
              @restore-lap="(idx: number) => rh.emit('restore_deleted_lap', { node: i, lap_index: idx })"
              @tune="openSeat(i)"
            />
          </div>

          <div class="min-w-0 space-y-4">
            <!-- id="leaderboard": classic-page plugins dock their panels before it -->
            <UCard id="leaderboard" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <div class="flex items-center justify-between">
                  <h2 class="font-semibold text-highlighted">
                    {{ t('Leaderboard') }}
                  </h2>
                  <span class="text-xs text-muted">{{ currentFormat?.name }}</span>
                </div>
              </template>
              <RhLeaderboard :board="board" kind="current" :seat-colors="seatColors" :min-lap-ms="minLapMs" dense />
            </UCard>
            <UCard v-if="teamBoard" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <h2 class="font-semibold text-highlighted">
                  {{ t('Teams') }}
                </h2>
              </template>
              <RhTeamLeaderboard :board="teamBoard" />
            </UCard>
          </div>
        </div>

        <!-- classic-page plugins (Gate Walkthrough Calibration, Auto Marshalling...) append their panels here -->
        <div
          id="rh-plugin-dock"
          ref="dock"
          class="flex flex-wrap gap-3"
          :class="[dockReserve ? '' : 'empty:hidden', dockShown ? '' : '[&>*]:invisible']"
          :style="dockReserve ? { minHeight: `${dockReserve}px` } : undefined"
        />

        <RhRaceTools />
      </div>

      <!-- phone / tablet: race clock and primary action stay within reach -->
      <div
        v-if="admin !== false && loaded"
        ref="barEl"
        class="sticky bottom-0 z-20 mt-auto border-t border-default bg-default/85 px-4 pt-3 backdrop-blur-xl lg:hidden"
        style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
      >
        <div class="mx-auto flex max-w-3xl items-center gap-3">
          <!-- the bar's clock appears only once the big clock has scrolled away -->
          <RhRaceClock size="sm" :hold="saveHold" class="me-auto transition-opacity duration-200" :class="heroClockVisible ? 'invisible opacity-0' : 'opacity-100'" :aria-hidden="heroClockVisible" />
          <UButton
            v-if="isDone"
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            :aria-label="t('Discard')"
            :label="t('Discard')"
            :ui="{ label: 'max-[420px]:sr-only' }"
            @click="discardOpen = true"
          />
          <UButton
            v-if="isRacing"
            color="neutral"
            variant="ghost"
            icon="i-lucide-save"
            :aria-label="t('Stop and Save')"
            :ui="{ label: 'max-[420px]:sr-only' }"
            :label="t('Stop and Save')"
            @click="save"
          />
          <UButton
            v-if="isReady"
            data-rh-primary
            size="lg"
            icon="i-lucide-play"
            :label="t('Start Race')"
            :loading="busy"
            class="rounded-full px-5"
            @click="start"
          />
          <UButton
            v-else-if="isLive"
            data-rh-primary
            size="lg"
            color="error"
            icon="i-lucide-square"
            :label="t('Stop Race')"
            :loading="busy"
            class="rounded-full px-5"
            @click="stop"
          />
          <template v-else>
            <UButton
              v-if="!anyLaps"
              color="neutral"
              variant="ghost"
              icon="i-lucide-rotate-ccw"
              :aria-label="t('Restart')"
              @click="start"
            />
            <UButton
              data-rh-primary
              size="lg"
              color="success"
              icon="i-lucide-check"
              :label="currentHeatId ? t('Save Results') : t('Clear Laps')"
              :loading="busy"
              class="rounded-full px-5"
              @click="save"
            />
          </template>
        </div>
      </div>

      <UModal v-model:open="discardOpen" :title="t('Discard this race?')" :description="t('The laps from this race will be deleted and the timer reset.')">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="error" :label="t('Discard Laps')" @click="discard" />
          </div>
        </template>
      </UModal>

      <RhHeatPlan v-model:plan="plan" source="run" />

      <USlideover
        :open="marshalSeat !== null"
        :title="marshalSeat !== null ? `${t('Marshal')} · ${heatNodes[marshalSeat]?.callsign || `${t('Seat')} ${marshalSeat + 1}`}` : ''"
        :description="t('Correct laps for the race that just finished, then commit before saving.')"
        :ui="{ content: 'max-w-5xl' }"
        @update:open="(o: boolean) => { if (!o) marshalSeat = null }"
      >
        <template #body>
          <RhMarshalEditor
            v-if="marshalData && marshalSeat !== null"
            :data="marshalData"
            :start-time="marshal.race.start_time"
            :format-id="marshal.race.format_id"
            :seat="marshalSeat"
            :color="seatColors[marshalSeat]"
            :can-commit="!!heatNodes[marshalSeat]?.pilot_id"
            :graph-height="240"
            @commit="commitMarshal"
            discard-when-clean
            @discard="marshalSeat = null"
          />
        </template>
      </USlideover>

      <USlideover
        :open="tuneSeat !== null"
        :title="tuneSeat !== null ? `${t('Tuning')} · ${t('Seat')} ${tuneSeat + 1}` : ''"
        :description="tuneSeat !== null ? (heatNodes[tuneSeat]?.callsign || '') : ''"
        :ui="{ content: 'max-w-xl' }"
        @update:open="(o: boolean) => { if (!o) tuneSeat = null }"
      >
        <template #body>
          <RhNodeTuning v-if="tuneSeat !== null" :node="tuneSeat" />
        </template>
      </USlideover>
    </template>
  </UDashboardPanel>
</template>
