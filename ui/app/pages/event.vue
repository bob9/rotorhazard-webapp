<script setup lang="ts">
import { WIN_CONDITIONS } from '~/utils/format'

const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Event')) })
const { admin } = useAuth()
const { info } = useServerInfo()
rh.load(['frequency_data', 'pilot_data', 'class_data', 'format_data', 'heat_data', 'result_data', 'raceclass_rank_method_list'])

const S = rh.state
const fdata = computed<any[]>(() => S.frequency_data?.fdata || [])
const pilots = computed<any[]>(() => S.pilot_data?.pilots || [])
const classes = computed<any[]>(() => S.class_data?.classes || [])
const formats = computed<any[]>(() => S.format_data?.formats || [])
const heats = computed<any[]>(() => (S.heat_data?.heats || []).filter((h: any) => h.active !== false))

const heatGroups = computed(() => {
  const out: { title: string, id: number | null, heats: any[] }[] = []
  for (const c of classes.value) {
    const hs = heats.value.filter(h => h.class_id === c.id)
    if (hs.length) out.push({ title: c.displayname, id: c.id, heats: hs })
  }
  const none = heats.value.filter(h => !h.class_id)
  if (none.length) out.push({ title: classes.value.length ? t('Unclassified') : t('Heats'), id: null, heats: none })
  return out
})
const groupTab = ref<string>('')
watch(heatGroups, (g) => {
  if (!g.some(x => String(x.id) === groupTab.value)) groupTab.value = g.length ? String(g[0]!.id) : ''
}, { immediate: true })
const activeGroup = computed(() => heatGroups.value.find(g => String(g.id) === groupTab.value))

function slotText(h: any, s: any) {
  const p = pilots.value.find(x => x.pilot_id === s.pilot_id)
  if (p) return p.callsign
  if (s.method === 1) return `${S.heat_data.heats.find((x: any) => x.id === s.seed_id)?.displayname || t('Heat')} ${t('Rank')} ${s.seed_rank}`
  if (s.method === 2) return `${classes.value.find(c => c.id === s.seed_id)?.displayname || t('Class')} ${t('Rank')} ${s.seed_rank}`
  return null
}
function showChannel(h: any) {
  return h.locked || h.status === 2 || h.auto_frequency === false
}
// only slots that hold a pilot or a seeding rule, in seat order
function filledSlots(h: any) {
  return (h.slots || [])
    .filter((s: any) => s.pilot_id || s.method === 1 || s.method === 2)
    .sort((a: any, b: any) => (a.node_index ?? 1e9) - (b.node_index ?? 1e9) || a.id - b.id)
}
const filled = computed<Record<number, any[]>>(() => Object.fromEntries(heats.value.map(h => [h.id, filledSlots(h)])))
function seatLabel(h: any, s: any) {
  if (!showChannel(h) || s.node_index === null || s.node_index === undefined) return ''
  return channelLabel(fdata.value[s.node_index]) || `${t('Seat')} ${s.node_index + 1}`
}
const pilotsInHeats = computed(() => {
  const ids = new Set(heats.value.flatMap(h => (h.slots || []).map((s: any) => s.pilot_id)).filter(Boolean))
  return pilots.value.filter(p => ids.has(p.pilot_id))
})

const usedFormats = computed(() => formats.value.filter(f => classes.value.some(c => c.format === f.id)))
function startLabel(v: number) {
  return [t('Hole Shot'), t('First Lap'), t('Staggered Start')][v] || ''
}
function winLabel(v: number) {
  return t(WIN_CONDITIONS.find(w => w.value === v)?.label || '')
}
function rankLabel(c: any) {
  return c.rank_method_label || (S.raceclass_rank_method_list?.methods || []).find((m: any) => m.name === c.win_condition)?.label || t('From Race Format')
}

// admin editing
const editingDesc = ref(false)
const desc = ref('')
const editingName = ref(false)
const nameDraft = ref('')
const nameInput = ref<HTMLInputElement>()
async function startName() {
  nameDraft.value = info.value?.event?.name || ''
  editingName.value = true
  await nextTick()
  nameInput.value?.focus()
  nameInput.value?.select()
}
function saveName() {
  if (!editingName.value) return
  editingName.value = false
  const v = nameDraft.value.trim()
  if (v === (info.value?.event?.name || '')) return
  rh.emit('set_option', { option: 'eventName', value: v })
  if (info.value) info.value.event.name = v
}
function startDesc() {
  desc.value = info.value?.event?.description || ''
  editingDesc.value = true
}
function saveDesc() {
  rh.emit('set_option', { option: 'eventDescription', value: desc.value })
  if (info.value) info.value.event.description = desc.value
  editingDesc.value = false
}
const consecutives = computed(() => S.result_data?.consecutives_count ?? 3)
function setConsecutives(v: number) {
  if (!v || v < 2) return
  rh.emit('set_consecutives_count', { count: v })
  setTimeout(() => rh.refresh(['result_data']), 400)
}
</script>

<template>
  <UDashboardPanel id="event">
    <template #header>
      <UDashboardNavbar :title="t('Event')">
        <template #right>
          <RhBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-12">
        <!-- event header -->
        <header class="space-y-3">
          <p class="text-sm font-semibold text-primary">
            {{ info?.timer_name || 'RotorHazard' }}
          </p>
          <input
            v-if="admin && editingName"
            ref="nameInput"
            v-model="nameDraft"
            :placeholder="t('Event name')"
            :aria-label="t('Event name')"
            class="-mx-2 block w-[calc(100%+1rem)] rounded-xl bg-elevated/60 px-2 font-display text-4xl font-semibold leading-tight tracking-tight text-highlighted outline-none ring-2 ring-primary/50 placeholder:text-dimmed sm:text-5xl sm:leading-tight"
            @keydown.enter.prevent="saveName"
            @keydown.esc.prevent="editingName = false"
            @blur="saveName"
          >
          <h1 v-else-if="admin" class="-mx-2">
            <button
              type="button"
              class="group flex w-full items-center gap-3 rounded-xl px-2 text-left font-display text-4xl font-semibold leading-tight tracking-tight text-highlighted transition-colors hover:bg-elevated/60 focus-visible:bg-elevated/60 focus-visible:outline-none sm:text-5xl sm:leading-tight"
              :title="t('Rename event')"
              @click="startName"
            >
              <span :class="info?.event?.name ? '' : 'text-dimmed'">{{ info?.event?.name || t('Event name') }}</span>
              <UIcon name="i-lucide-pencil" class="size-5 shrink-0 text-dimmed opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
          </h1>
          <h1 v-else class="font-display text-4xl font-semibold leading-tight tracking-tight text-highlighted sm:text-5xl sm:leading-tight">
            {{ info?.event?.name || t('Event') }}
          </h1>

          <div v-if="editingDesc" class="space-y-2">
            <UTextarea v-model="desc" :rows="4" autoresize class="w-full" :maxlength="256" :placeholder="t('Describe the event. Markdown is supported.')" />
            <div class="flex gap-2">
              <UButton :label="t('Save')" size="sm" @click="saveDesc" />
              <UButton :label="t('Cancel')" size="sm" color="neutral" variant="ghost" @click="editingDesc = false" />
            </div>
          </div>
          <div v-else class="group flex items-start gap-2">
            <RhMarkdown v-if="info?.event?.description" :source="info.event.description" class="max-w-3xl text-lg text-muted" />
            <p v-else class="text-lg text-dimmed">
              {{ t('(no description provided)') }}
            </p>
            <UButton v-if="admin" icon="i-lucide-pencil" size="xs" color="neutral" variant="ghost" :aria-label="t('Edit description')" @click="startDesc" />
          </div>
        </header>

        <!-- heats -->
        <section class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="font-display text-2xl font-semibold">
              {{ t('Heats') }}
            </h2>
            <UButton v-if="admin" to="/heats" color="neutral" variant="ghost" trailing-icon="i-lucide-arrow-right" :label="t('Edit heats')" />
          </div>
          <UTabs
            v-if="heatGroups.length > 1"
            v-model="groupTab"
            :items="heatGroups.map(g => ({ label: g.title, value: String(g.id) }))"
            :content="false"
            color="neutral"
            :ui="{ list: 'w-fit' }"
            class="max-w-full overflow-x-auto"
          />
          <UEmpty v-if="!heatGroups.length" icon="i-lucide-layers" :title="t('(no heats created)')" />
          <div v-else-if="activeGroup" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div v-for="h in activeGroup.heats" :key="h.id" class="overflow-hidden rounded-2xl bg-default ring-1 ring-default">
              <div class="border-b border-default px-4 py-2.5 font-semibold text-highlighted">
                {{ h.displayname }}
              </div>
              <ul class="divide-y divide-default/70">
                <li v-for="s in filled[h.id]" :key="s.id" class="flex items-center gap-3 px-4 py-2 text-sm">
                  <span v-if="showChannel(h)" class="w-20 shrink-0 tabular text-xs text-muted">
                    {{ seatLabel(h, s) }} <span v-if="fdata[s.node_index]?.band" class="text-dimmed">{{ fdata[s.node_index]?.frequency }}</span>
                  </span>
                  <span class="truncate font-medium text-highlighted">{{ slotText(h, s) }}</span>
                </li>
                <li v-if="!filled[h.id]?.length" class="px-4 py-2 text-sm text-dimmed">
                  {{ t('No pilots assigned') }}
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- classes -->
        <section v-if="classes.length" class="space-y-4">
          <h2 class="font-display text-2xl font-semibold">
            {{ t('Classes') }}
          </h2>
          <div class="grid gap-4 md:grid-cols-2">
            <div v-for="c in classes" :key="c.id" class="space-y-3 rounded-2xl bg-default p-5 ring-1 ring-default">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ c.displayname }}
              </h3>
              <RhMarkdown v-if="c.description" :source="c.description" class="text-sm text-muted" />
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">
                  {{ t('Format') }}
                </dt>
                <dd>{{ formats.find(f => f.id === c.format)?.name || t('No format restriction') }}</dd>
                <dt class="text-muted">
                  {{ t('Ranking') }}
                </dt>
                <dd>{{ rankLabel(c) }}</dd>
                <dt class="text-muted">
                  {{ t('Rounds') }}
                </dt>
                <dd>{{ c.rounds || t('Unlimited') }}</dd>
              </dl>
            </div>
          </div>
        </section>

        <!-- formats -->
        <section v-if="usedFormats.length" class="space-y-4">
          <h2 class="font-display text-2xl font-semibold">
            {{ t('Formats') }}
          </h2>
          <div class="grid gap-4 md:grid-cols-2">
            <div v-for="f in usedFormats" :key="f.id" class="space-y-3 rounded-2xl bg-default p-5 ring-1 ring-default">
              <h3 class="text-lg font-semibold text-highlighted">
                {{ t(f.name) }}
              </h3>
              <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt class="text-muted">
                  {{ t('Race Clock') }}
                </dt>
                <dd class="tabular">
                  {{ f.unlimited_time ? t('No Time Limit') : formatClock(f.race_time_sec * 1000, false) }}
                </dd>
                <dt class="text-muted">
                  {{ t('Start Delay') }}
                </dt>
                <dd class="tabular">
                  {{ (f.start_delay_min / 1000).toFixed(1) }}{{ f.start_delay_max ? `–${((f.start_delay_min + f.start_delay_max) / 1000).toFixed(1)}` : '' }} s
                </dd>
                <dt class="text-muted">
                  {{ t('First Crossing') }}
                </dt>
                <dd>{{ startLabel(f.start_behavior) }}</dd>
                <dt class="text-muted">
                  {{ t('Win Condition') }}
                </dt>
                <dd>{{ winLabel(f.win_condition) }}<span v-if="f.win_condition === 2"> ({{ f.number_laps_win }})</span></dd>
                <template v-if="f.team_racing_mode">
                  <dt class="text-muted">
                    {{ t('Racing Mode') }}
                  </dt>
                  <dd>{{ f.team_racing_mode === 2 ? t('Co-op') : t('Team') }}</dd>
                </template>
              </dl>
            </div>
          </div>
        </section>

        <!-- pilots -->
        <section v-if="pilotsInHeats.length" class="space-y-4">
          <h2 class="font-display text-2xl font-semibold">
            {{ t('Pilots') }} <span class="text-lg font-normal text-dimmed tabular">{{ pilotsInHeats.length }}</span>
          </h2>
          <div class="flex flex-wrap gap-2">
            <div v-for="p in pilotsInHeats" :key="p.pilot_id" class="flex items-center gap-2 rounded-full bg-elevated/60 py-1.5 pl-2 pr-3.5 text-sm">
              <span class="size-3 rounded-full" :style="{ background: p.color || 'var(--ui-bg-accented)' }" />
              <span class="font-medium text-highlighted">{{ p.callsign }}</span>
              <span v-if="pilotName(p)" class="text-muted">{{ pilotName(p) }}</span>
            </div>
          </div>
        </section>

        <!-- admin: event settings + plugins -->
        <section v-if="admin" class="space-y-6">
          <RhGroup :title="t('Event Settings')">
            <RhRow :label="t('Consecutive Laps Base')" :description="t('Number of laps used for the fastest consecutive laps ranking.')">
              <UInputNumber :model-value="consecutives" :min="2" :max="999" class="w-36" @update:model-value="setConsecutives" />
            </RhRow>
            <RhRow :label="t('Start a new event')" :description="t('Archive this event and clear races, heats or pilots.')" to="/settings/data" />
          </RhGroup>
          <RhPluginPanels page="format" />
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
