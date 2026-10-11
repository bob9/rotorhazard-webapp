<script setup lang="ts">
import type { MarshalCommit, MarshalPilotData } from '~/components/RhMarshalEditor.vue'

const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Marshal')) })
const { admin, loginOpen } = useAuth()
rh.load(['race_list', 'heat_data', 'class_data', 'format_data', 'min_lap', { type: 'ui', value: 'marshal' }])

const S = rh.state
const raceList = computed(() => S.race_list)
const heatsMap = computed<Record<string, any>>(() => raceList.value?.heats || {})
const hasRaces = computed(() => Object.keys(heatsMap.value).length > 0)
const classes = computed<any[]>(() => S.class_data?.classes || [])
const formats = computed<any[]>(() => S.format_data?.formats || [])

// ---- selection: Heat → Round → Pilot ----
const heatKey = ref<string | null>(null)
const roundKey = ref<string | null>(null)
const pilotId = ref<number | null>(null)

// As in the classic page, the stored selection is restored only after a browser
// reload; otherwise the page opens on the most recent race.
let pending: { heat?: string | null, round?: string | null, pilot?: string | null } = {}
if (import.meta.client) {
  try {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const w = window as any
    if (nav?.type === 'reload' && !w.__rhMarshalRestored) {
      pending = { heat: sessionStorage.getItem('marshal_heat'), round: sessionStorage.getItem('marshal_round'), pilot: sessionStorage.getItem('marshal_pilot') }
    }
    w.__rhMarshalRestored = true
  } catch { /* storage unavailable */ }
}
function popPending(k: 'heat' | 'round' | 'pilot') {
  const v = pending[k]
  pending[k] = null
  return v
}
function store(k: string, v: string | number | null) {
  try {
    if (v !== null) sessionStorage.setItem('marshal_' + k, String(v))
  } catch { /* storage unavailable */ }
}

const heat = computed(() => heatKey.value ? heatsMap.value[heatKey.value] : null)
const roundKeys = computed(() => Object.keys(heat.value?.rounds || {}).sort((a, b) => Number(a) - Number(b)))
const round = computed(() => roundKey.value ? heat.value?.rounds?.[roundKey.value] : null)
const pilotraces = computed<any[]>(() => round.value?.pilotraces || [])
const pilotrace = computed(() => pilotraces.value.find(p => p.pilot_id === pilotId.value) || null)
const singleRound = computed(() => roundKeys.value.length === 1 && roundKeys.value[0] === '1')

function newestHeat() {
  let best: string | null = null
  let bestT = -Infinity
  for (const [hk, h] of Object.entries(heatsMap.value)) {
    for (const r of Object.values<any>(h.rounds || {})) {
      const tm = new Date(String(r.start_time_formatted).replace(' ', 'T')).getTime() || r.start_time || 0
      if (tm > bestT) {
        bestT = tm
        best = hk
      }
    }
  }
  return best
}

// keep the selection valid whenever the race list changes
let followRaceId: number | null = null
watch(heatsMap, () => {
  if (!hasRaces.value) return
  if (followRaceId !== null) {
    // after a reassignment, follow the race to its new heat / round
    for (const [hk, h] of Object.entries(heatsMap.value)) {
      for (const [rk, r] of Object.entries<any>(h.rounds || {})) {
        if (r.race_id === followRaceId) {
          heatKey.value = hk
          roundKey.value = rk
        }
      }
    }
    followRaceId = null
  }
  let hk = heatKey.value ?? popPending('heat')
  if (!hk || !(hk in heatsMap.value)) hk = newestHeat()
  setHeat(hk)
}, { immediate: true })

function setHeat(hk: string | null) {
  heatKey.value = hk
  store('heat', hk)
  const keys = roundKeys.value
  const prev = roundKey.value
  const stored = popPending('round')
  const rk = [prev, stored].find(k => k && keys.includes(k)) ?? keys[keys.length - 1] ?? null
  setRound(rk)
}
function setRound(rk: string | null) {
  roundKey.value = rk
  store('round', rk)
  const list = pilotraces.value
  const stored = popPending('pilot')
  const want = [pilotId.value, stored ? Number(stored) : null].find(id => id !== null && list.some(p => p.pilot_id === id))
  setPilot(want ?? list[0]?.pilot_id ?? null)
}
function setPilot(id: number | null) {
  pilotId.value = id
  store('pilot', id)
}

// guarded selection changes (unsaved edits)
const dirty = ref(false)
const confirmOpen = ref(false)
let confirmResolve: ((ok: boolean) => void) | null = null
function confirmDiscard(): Promise<boolean> {
  if (!dirty.value) return Promise.resolve(true)
  confirmOpen.value = true
  return new Promise((resolve) => { confirmResolve = resolve })
}
function answer(ok: boolean) {
  confirmOpen.value = false
  confirmResolve?.(ok)
  confirmResolve = null
}
async function pickHeat(hk: string) {
  if (hk !== heatKey.value && await confirmDiscard()) setHeat(hk)
}
async function pickRound(rk: string) {
  if (rk !== roundKey.value && await confirmDiscard()) setRound(rk)
}
async function pickPilot(id: number) {
  if (id !== pilotId.value && await confirmDiscard()) setPilot(id)
}
onBeforeRouteLeave(() => confirmDiscard())

// heat picker items, grouped by class
const heatItems = computed(() => {
  const byClass = new Map<string, any[]>()
  for (const [hk, h] of Object.entries(heatsMap.value)) {
    const k = String(h.class_id ?? 'null')
    if (!byClass.has(k)) byClass.set(k, [])
    const n = Object.keys(h.rounds || {}).length
    byClass.get(k)!.push({ label: h.displayname, value: hk, description: `${n} ${n === 1 ? t('round') : t('rounds')}` })
  }
  const groups: any[] = []
  for (const [cid, items] of byClass) {
    const cls = classes.value.find(c => String(c.id) === cid)
    groups.push(byClass.size > 1 ? [{ type: 'label', label: cls ? cls.displayname : t('Unclassified') }, ...items] : items)
  }
  return groups
})
const heatModel = computed({ get: () => heatKey.value ?? undefined, set: (v?: string) => { if (v) pickHeat(v) } })
const roundTabs = computed(() => roundKeys.value.map(k => ({ label: `${t('Round')} ${k}`, value: k })))
// on narrow screens the round strip scrolls: keep the chosen round in view
const roundStrip = ref<any>(null)
function centreRound() {
  nextTick(() => {
    const root: HTMLElement | undefined = roundStrip.value?.$el
    const tab = root?.querySelector<HTMLElement>('[role=tab][data-state=active]')
    if (!root || !tab) return
    let scroller: HTMLElement | null = tab.parentElement
    while (scroller && scroller !== root.parentElement && scroller.scrollWidth <= scroller.clientWidth) scroller = scroller.parentElement
    if (!scroller || scroller.scrollWidth <= scroller.clientWidth) return
    const offset = tab.getBoundingClientRect().left - scroller.getBoundingClientRect().left + scroller.scrollLeft
    scroller.scrollTo({ left: offset - (scroller.clientWidth - tab.offsetWidth) / 2 })
    updateRoundFade()
  })
}
watch([() => roundKey.value, roundStrip], centreRound, { flush: 'post' })
// the strip fades out at an edge where more rounds are scrolled out of view, so a round cut
// off there reads as "more this way" rather than clipped text
const roundFade = reactive({ start: false, end: false })
function updateRoundFade() {
  const el: HTMLElement | undefined = roundStrip.value?.$el
  if (!el) return
  const max = el.scrollWidth - el.clientWidth
  const x = Math.abs(el.scrollLeft) // negative in right-to-left layouts
  roundFade.start = max > 1 && x > 1
  roundFade.end = max > 1 && x < max - 1
}
let roundStripRO: ResizeObserver | undefined
watch(roundStrip, (c) => {
  roundStripRO?.disconnect()
  const el: HTMLElement | undefined = c?.$el
  if (!el) return
  roundStripRO = new ResizeObserver(updateRoundFade)
  roundStripRO.observe(el)
  updateRoundFade()
}, { flush: 'post' })
onBeforeUnmount(() => roundStripRO?.disconnect())
const roundModel = computed({ get: () => roundKey.value ?? undefined, set: (v: string | number) => pickRound(String(v)) })

// ---- the selected pilot's race ----
const details = ref<MarshalPilotData | null>(null)

// The classic marshal page's globals, which classic-page plugins (e.g. Auto
// Marshalling) use to read the shown race and move its EnterAt / ExitAt.
const editor = ref<any>(null)
if (import.meta.client) {
  const w = window as any
  watchEffect(() => {
    w.current_race_data = details.value ? { ...details.value, pilotrace_id: pilotrace.value?.pilotrace_id } : null
  })
  w.marshal = {
    get race() { return details.value },
    setEnter: (v: number) => editor.value?.setEnter(v),
    setExit: (v: number) => editor.value?.setExit(v),
    recalcRace: () => editor.value?.recalc()
  }
  onBeforeUnmount(() => {
    delete w.marshal
    delete w.current_race_data
  })
}
const loading = ref(false)
function loadRace() {
  details.value = null
  if (!pilotrace.value) return
  loading.value = true
  rh.emit('get_pilotrace', { pilotrace_id: pilotrace.value.pilotrace_id })
}
rh.on('race_details', (d: any) => {
  if (d?.pilotrace_id !== pilotrace.value?.pilotrace_id) return
  details.value = d
  loading.value = false
})
watch(() => pilotrace.value?.pilotrace_id, loadRace, { immediate: true })
// a server restart or reconnect: fetch again
watch(() => rh.status.connected, (c) => { if (c && pilotrace.value && !dirty.value) loadRace() })

const format = computed(() => formats.value.find(f => f.id === round.value?.format_id) || null)
const startedAt = computed(() => formatStartTime(round.value?.start_time_formatted))

function commit(c: MarshalCommit) {
  const pr = pilotrace.value
  if (!pr || !round.value) return
  rh.emit('resave_laps', {
    heat_id: heat.value.heat_id ?? Number(heatKey.value),
    round_id: Number(roundKey.value),
    callsign: pr.callsign,
    race_id: round.value.race_id,
    pilotrace_id: pr.pilotrace_id,
    seat: pr.node_index,
    pilot_id: pr.pilot_id,
    laps: c.laps,
    enter_at: c.enter_at,
    exit_at: c.exit_at
  })
}

// ---- reassign heat ----
const allHeats = computed<any[]>(() => S.heat_data?.heats || [])
const reassignItems = computed(() => allHeats.value.map((h) => {
  const cls = classes.value.find(c => c.id === h.class_id)
  return { label: h.displayname, value: h.id, disabled: !!cls && cls.round_type === 1 && !h.active }
}))
const reassignTo = ref<number | undefined>()
watch(heat, (h) => { reassignTo.value = h?.heat_id }, { immediate: true })
const reassignOpen = ref(false)
const reassignTarget = computed(() => allHeats.value.find(h => h.id === reassignTo.value))
function reassign() {
  if (!round.value || reassignTo.value === undefined) return
  followRaceId = round.value.race_id
  rh.emit('alter_race', { race_id: round.value.race_id, heat_id: reassignTo.value })
  reassignOpen.value = false
}
</script>

<template>
  <UDashboardPanel id="marshal">
    <template #header>
      <UDashboardNavbar :title="t('Marshal')">
        <template #right>
          <RhBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="admin === false" class="p-2">
        <UEmpty
          icon="i-lucide-lock-keyhole"
          :title="t('Sign in to marshal races')"
          :description="t('Marshaling is available to the event admin.')"
          :actions="[{ label: t('Sign in'), icon: 'i-lucide-log-in', onClick: () => { loginOpen = true } }]"
        />
      </div>

      <div v-else class="mx-auto w-full max-w-[1400px] space-y-8">
        <div v-if="!raceList" class="space-y-4">
          <USkeleton class="h-12 w-full max-w-xl" />
          <USkeleton class="h-80 w-full rounded-3xl" />
        </div>

        <UEmpty
          v-else-if="!hasRaces"
          icon="i-lucide-pencil-ruler"
          :title="t('No saved races')"
          :description="t('There is no saved race data available to view.')"
          :actions="[{ label: t('Go to Race'), icon: 'i-lucide-flag', to: '/' }]"
        />

        <template v-else>
          <!-- race picker -->
          <header class="space-y-5">
            <div class="flex flex-wrap items-center gap-3">
              <USelectMenu
                v-model="heatModel"
                :items="heatItems"
                value-key="value"
                :search-input="heatItems.flat().length > 8 ? { placeholder: t('Find a heat…') } : false"
                icon="i-lucide-layers"
                size="lg"
                class="w-full sm:w-72"
                :aria-label="t('Heat')"
              />
              <UTabs
                v-if="!singleRound && roundTabs.length"
                ref="roundStrip"
                v-model="roundModel"
                :items="roundTabs"
                :content="false"
                color="neutral"
                size="sm"
                class="rh-scroll-fade max-w-full overflow-x-auto"
                :class="{ 'rh-fade-start': roundFade.start, 'rh-fade-end': roundFade.end }"
                :ui="{ list: 'w-fit' }"
                @scroll.passive="updateRoundFade"
              />
            </div>

            <div class="-mx-4 -my-1 overflow-x-auto px-4 py-1 sm:mx-0 sm:px-0">
              <div class="flex w-max gap-2 sm:w-auto sm:flex-wrap" role="radiogroup" :aria-label="t('Pilot')">
                <button
                  v-for="p in pilotraces"
                  :key="p.pilotrace_id"
                  type="button"
                  role="radio"
                  :aria-checked="p.pilot_id === pilotId"
                  class="flex min-w-32 items-center gap-3 rounded-2xl px-3.5 py-2.5 text-left ring-1 transition focus-visible:outline-2 focus-visible:outline-primary"
                  :class="p.pilot_id === pilotId ? 'bg-primary/10 ring-primary/50' : 'bg-default ring-default hover:bg-elevated/60'"
                  @click="pickPilot(p.pilot_id)"
                >
                  <span
                    class="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular"
                    :class="p.pilot_id === pilotId ? 'bg-primary text-inverted' : 'bg-elevated text-muted'"
                  >{{ p.node_index + 1 }}</span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold text-highlighted">{{ p.callsign || '—' }}</span>
                    <span class="block truncate text-xs text-muted">{{ p.pilot_freq || `${t('Seat')} ${p.node_index + 1}` }}</span>
                  </span>
                </button>
              </div>
            </div>
          </header>

          <!-- the classic page's race selects, read by classic-page plugins -->
          <input id="selected_heat" type="hidden" :value="heat?.heat_id ?? heatKey ?? ''">
          <input id="selected_round" type="hidden" :value="roundKey ?? ''">
          <!-- id="race-graph": classic-page plugins (e.g. Auto Marshalling) dock their panels
               just before it, so they sit above the editor card rather than inside it -->
          <div id="race-graph" class="space-y-4">
            <RhMarshalEditor
              v-if="pilotrace && round"
              ref="editor"
              :data="details"
              :start-time="round.start_time"
              :format-id="round.format_id"
              :seat="pilotrace.node_index"
              :pilotrace-id="pilotrace.pilotrace_id"
              @commit="commit"
              @discard="loadRace"
              @update:dirty="(v: boolean) => (dirty = v)"
            >
              <template #title>
                <div class="flex min-w-0 items-center gap-3">
                  <div class="min-w-0">
                    <h1 class="truncate font-display text-xl font-semibold text-highlighted">
                      {{ heat?.displayname }}<span v-if="!singleRound" class="text-muted"> / {{ t('Round') }} {{ roundKey }}</span>
                      <span class="text-muted"> / </span>{{ pilotrace.callsign }}
                    </h1>
                    <p class="truncate text-xs text-muted">
                      <span v-if="format">{{ format.name }}</span>
                      <span v-if="format && startedAt"> · </span>
                      <span>{{ startedAt }}</span>
                    </p>
                  </div>
                  <UIcon v-if="loading" name="i-lucide-loader-circle" class="size-4 shrink-0 animate-spin text-muted" />
                </div>
              </template>

              <template #aside>
                <RhGroup :title="t('Reassign Heat')" :footer="t('Moves this race to another heat. Pilots are matched to that heat\'s pilots by seat.')">
                  <div class="flex gap-2 px-4 py-3">
                    <USelect
                      v-model="reassignTo"
                      :items="reassignItems"
                      class="min-w-0 flex-1"
                      :aria-label="t('Heat')"
                    />
                    <UButton
                      color="neutral"
                      variant="soft"
                      icon="i-lucide-arrow-right-left"
                      :label="t('Reassign')"
                      :disabled="!reassignTo || reassignTo === heat?.heat_id"
                      @click="reassignOpen = true"
                    />
                  </div>
                </RhGroup>
              </template>
            </RhMarshalEditor>
          </div>
        </template>

        <RhPluginPanels page="marshal" />
      </div>

      <UModal v-model:open="reassignOpen" :title="t('Reassign Heat')" :description="t('Move this race to {0}? Each seat\'s laps are given to the pilot in that seat of the new heat.', reassignTarget?.displayname || '')">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton :label="t('Reassign Heat')" icon="i-lucide-arrow-right-left" @click="reassign" />
          </div>
        </template>
      </UModal>

      <UModal
        :open="confirmOpen"
        :title="t('Discard unsaved changes?')"
        :description="t('Your lap edits for this pilot have not been committed.')"
        @update:open="(o: boolean) => { if (!o) answer(false) }"
      >
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Keep Editing')" @click="answer(false)" />
            <UButton color="error" :label="t('Discard Changes')" @click="answer(true)" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
