<script setup lang="ts">
import { VTX_CHANNELS } from '~/utils/channels'

const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Timer')) })
const { admin } = useAuth()
const { info } = useServerInfo()
rh.load(['frequency_data', 'node_tuning', 'node_data', 'enter_and_exit_at_levels', 'seat_data', 'vrx_list', 'start_thresh_lower_amount', 'start_thresh_lower_duration', 'race_status', 'current_heat'])

const S = rh.state
const fdata = computed<any[]>(() => S.frequency_data?.fdata || [])
const seatColors = computed<Record<number, string>>(() => Object.fromEntries((S.seat_data?.seats || []).map((s: any) => [s.seat_id, s.color])))
const raceActive = computed(() => [1, 3].includes(S.race_status?.race_status))

// profiles
const profiles = computed(() => (S.node_tuning?.profile_ids || []).map((id: number, i: number) => ({ value: id, label: S.node_tuning.profile_names[i] })))
const deleteProfileOpen = ref(false)
const renameOpen = ref(false)
const profileDraft = ref('')
function openRename() {
  profileDraft.value = S.node_tuning?.profile_name || ''
  renameOpen.value = true
}
function renameProfile() {
  const name = profileDraft.value.trim()
  if (name && name !== S.node_tuning?.profile_name) {
    rh.emit('alter_profile', { profile_name: name })
    if (S.node_tuning) {
      S.node_tuning.profile_name = name
      const i = (S.node_tuning.profile_ids || []).indexOf(S.node_tuning.current_profile)
      if (i >= 0 && S.node_tuning.profile_names) S.node_tuning.profile_names[i] = name
    }
  }
  renameOpen.value = false
}

// frequencies
const channelItems = computed(() => [
  { label: t('Disabled'), value: '0' },
  ...Object.entries(VTX_CHANNELS).map(([k, f]) => ({ label: `${k} · ${f}`, value: k }))
])
function channelKey(f: any) {
  if (!f?.frequency) return '0'
  const k = f.band && f.channel ? `${f.band}${f.channel}` : ''
  if (k && VTX_CHANNELS[k] === f.frequency) return k
  const found = Object.entries(VTX_CHANNELS).find(([, v]) => v === f.frequency)
  return found ? found[0] : undefined
}
function setChannel(node: number, key: string) {
  if (key === '0') return rh.emit('set_frequency', { node, frequency: 0, band: null, channel: null })
  rh.emit('set_frequency', { node, frequency: VTX_CHANNELS[key], band: key[0], channel: Number(key.slice(1)) })
}
function setFrequency(node: number, freq: number) {
  if (!freq) return
  const found = Object.entries(VTX_CHANNELS).find(([, v]) => v === freq)
  rh.emit('set_frequency', { node, frequency: freq, band: found ? found[0][0] : null, channel: found ? Number(found[0].slice(1)) : null })
}
const presets = computed(() => [
  { label: 'Raceband 4 (R1 R3 R6 R7)', value: 'RB-4' },
  { label: 'Raceband 8', value: 'RB-8' },
  { label: 'IMD 5-channel', value: 'IMD5C' },
  { label: 'IMD 6-channel', value: 'IMD6C' },
  { label: t('Apply Node 1 to all'), value: 'All-N1' }
])
// nodes with no frequency and no pilot in the current heat are collapsed
const showDisabled = ref(false)
function nodeInUse(f: any, i: number) {
  return !!f?.frequency || !!S.current_heat?.heatNodes?.[i]?.pilot_id
}
const nodeRows = computed(() => fdata.value.map((f, i) => ({ f, i })))
const disabledCount = computed(() => nodeRows.value.filter(r => !nodeInUse(r.f, r.i)).length)
const visibleNodes = computed(() => nodeRows.value.filter(r => showDisabled.value || nodeInUse(r.f, r.i)))
const imd = ref<string | null>(null)
rh.on('imdtabler_rating', (d: any) => { imd.value = d?.imd_rating ?? null })

// vrx locks per seat
const vrxBySeat = computed(() => {
  const m: Record<number, { locked: number, total: number }> = {}
  for (const d of Object.values<any>(S.vrx_list?.devices || {})) {
    const seat = d.map?.seat ?? d.map_seat
    if (seat === undefined || seat === null) continue
    m[seat] ||= { locked: 0, total: 0 }
    m[seat].total++
    if (d.video_lock) m[seat].locked++
  }
  return m
})

// the timer's frequency and firmware tools (the full list is under Settings › System)
const timerTools = useTools().tools(['scanner', 'imdtabler', 'update-nodes'])

// the tab is part of the address (/timer?tab=tuning), so search results and links open the right one
const route = useRoute()
const router = useRouter()
const TABS = ['frequencies', 'tuning', 'advanced']
const tab = computed({
  get: () => (TABS.includes(String(route.query.tab)) ? String(route.query.tab) : 'frequencies'),
  set: v => router.replace({ query: { ...route.query, tab: v === 'frequencies' ? undefined : v } })
})
const tabs = computed(() => [
  { label: t('Frequencies'), value: 'frequencies', icon: 'i-lucide-radio' },
  { label: t('Sensor Tuning'), value: 'tuning', icon: 'i-lucide-activity' },
  { label: t('Advanced'), value: 'advanced', icon: 'i-lucide-sliders-horizontal' }
])
</script>

<template>
  <UDashboardPanel id="timer">
    <template #header>
      <UDashboardNavbar :title="t('Timer')">
        <template #right>
          <RhBell />
          <div v-if="admin" class="flex items-center gap-2">
            <span class="hidden text-sm text-muted sm:inline">{{ t('Profile') }}</span>
            <USelect :model-value="S.node_tuning?.current_profile" :items="profiles" class="w-44" @update:model-value="(v: any) => rh.emit('set_profile', { profile: v })" />
            <UDropdownMenu
              :items="[[
                { label: t('Rename Profile'), icon: 'i-lucide-pencil', onSelect: openRename },
                { label: t('Add Profile'), icon: 'i-lucide-copy-plus', onSelect: () => rh.emit('add_profile') }
              ], ...(profiles.length > 1 ? [[{ label: t('Remove Profile'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteProfileOpen = true } }]] : [])]"
              :content="{ align: 'end' }"
            >
              <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('Profile actions')" />
            </UDropdownMenu>
          </div>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <!-- on a phone the three tabs share the width, without icons, so all of them stay on screen -->
        <UTabs
          v-model="tab"
          :items="tabs"
          :content="false"
          variant="link"
          class="w-full min-w-0 sm:w-auto"
          :ui="{ list: 'w-full sm:w-auto', trigger: 'flex-1 justify-center px-1.5 text-[13px] sm:flex-none sm:px-3 sm:text-sm', leadingIcon: 'hidden sm:inline-flex', label: 'truncate' }"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <UEmpty v-if="admin === false" icon="i-lucide-lock-keyhole" :title="t('Sign in to change timer settings')" />

        <template v-else-if="tab === 'frequencies'">
          <UAlert v-if="raceActive" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="t('A race is running. Changing frequencies now affects the race.')" />
          <UAlert v-if="Object.keys(vrxBySeat).length" color="neutral" variant="soft" icon="i-lucide-triangle-alert" :ui="{ icon: 'text-warning' }" :title="t('WARNING: Video receivers connected. Changes may cause pilots to lose video.')" />

          <RhGroup :title="t('Frequencies')">
            <template #actions>
              <UDropdownMenu :items="presets.map(p => ({ label: p.label, onSelect: () => rh.emit('set_frequency_preset', { preset: p.value }) }))" :content="{ align: 'end' }">
                <UButton size="xs" color="neutral" variant="soft" trailing-icon="i-lucide-chevron-down" :label="t('Presets')" />
              </UDropdownMenu>
            </template>
            <div v-for="{ f, i } in visibleNodes" :key="i" class="flex flex-wrap items-center gap-3 px-4 py-3">
              <div class="flex w-28 items-center gap-2.5">
                <span class="size-3 rounded-full" :style="{ background: seatColors[i] || 'var(--ui-bg-accented)' }" />
                <span class="text-[15px] font-medium" :class="f.frequency ? '' : 'text-muted'">{{ t('Node') }} {{ i + 1 }}</span>
              </div>
              <USelectMenu
                :model-value="channelKey(f)"
                :items="channelItems"
                value-key="value"
                class="w-44"
                :placeholder="t('Custom')"
                :search-input="{ placeholder: t('Channel or frequency') }"
                @update:model-value="(v: any) => setChannel(i, v)"
              />
              <div class="flex items-center gap-2">
                <UInputNumber :model-value="f.frequency || null" :min="5000" :max="6001" :step="1" :format-options="{ useGrouping: false }" class="w-32" :aria-label="`${t('Node')} ${i + 1} MHz`" @change="(e: any) => setFrequency(i, Number(e.target.value))" />
                <span class="text-xs text-muted">MHz</span>
              </div>
              <div class="ml-auto flex items-center gap-3">
                <UBadge v-if="vrxBySeat[i]" :color="vrxBySeat[i].locked === vrxBySeat[i].total ? 'success' : 'warning'" variant="subtle" :label="`${t('VRx locks')} ${vrxBySeat[i].locked}/${vrxBySeat[i].total}`" />
                <div v-if="f.frequency" class="hidden w-28 items-center gap-2 sm:flex" :title="t('Signal')">
                  <span class="text-[11px] font-medium uppercase tracking-wide text-dimmed">{{ t('Signal') }}</span>
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-accented/70">
                    <div class="h-full rounded-full bg-primary/70 transition-[width] duration-150" :style="{ width: `${Math.min(100, ((S.heartbeat?.current_rssi?.[i] || 0) / 200) * 100)}%` }" />
                  </div>
                </div>
              </div>
            </div>
            <button
              v-if="disabledCount"
              type="button"
              class="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-muted transition-colors hover:bg-elevated/50 hover:text-highlighted"
              :aria-expanded="showDisabled"
              @click="showDisabled = !showDisabled"
            >
              <UIcon :name="showDisabled ? 'i-lucide-chevron-up' : 'i-lucide-plus'" class="size-4" />
              {{ showDisabled ? t('Hide disabled nodes') : `${disabledCount} ${disabledCount === 1 ? t('disabled node') : t('disabled nodes')}` }}
            </button>
            <template #footer>
              <span>{{ t('Frequency set IMD rating (100=best)') }}: <b class="text-highlighted">{{ imd ?? '—' }}</b> · <NuxtLink to="/imdtabler" class="underline">IMDTabler</NuxtLink></span>
            </template>
          </RhGroup>
        </template>

        <template v-else-if="tab === 'tuning'">
          <p class="text-muted">
            {{ t('Each node detects a pass when the signal rises above EnterAt and ends it when the signal falls below ExitAt. Fly a lap and drag the lines so passes register cleanly.') }}
          </p>
          <div class="grid gap-6 lg:grid-cols-2">
            <UCard v-for="(f, i) in fdata" :key="i">
              <template #header>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-2.5">
                    <span class="size-3 rounded-full" :style="{ background: seatColors[i] || 'var(--ui-bg-accented)' }" />
                    <span class="font-semibold">{{ t('Node') }} {{ Number(i) + 1 }}</span>
                    <span class="text-sm text-muted">{{ channelLabel(f) }} {{ f.band ? f.frequency : '' }}</span>
                  </div>
                  <UBadge v-if="S.heartbeat?.crossing_flag?.[i]" :label="t('Crossing')" color="success" variant="subtle" />
                </div>
              </template>
              <RhNodeTuning v-if="f.frequency" :node="Number(i)" />
              <div v-else class="py-6 text-center text-sm text-muted">
                {{ t('Disabled') }}
              </div>
            </UCard>
          </div>
        </template>

        <template v-else>
          <RhGroup :title="t('Start Threshold')" :footer="t('Lowers EnterAt for a short time at the start of a race, to catch the first pass of pilots launching close to the gate.')">
            <RhRow :label="t('Lower Amount')" :description="t('percent')">
              <UInputNumber :model-value="S.start_thresh_lower_amount?.start_thresh_lower_amount" :min="0" :max="100" class="w-36" @update:model-value="(v: any) => rh.emit('set_start_thresh_lower_amount', { start_thresh_lower_amount: v })" />
            </RhRow>
            <RhRow :label="t('Lower Duration')" :description="t('seconds')">
              <UInputNumber :model-value="S.start_thresh_lower_duration?.start_thresh_lower_duration" :min="0" class="w-36" @update:model-value="(v: any) => rh.emit('set_start_thresh_lower_duration', { start_thresh_lower_duration: v })" />
            </RhRow>
          </RhGroup>
          <RhGroup v-if="timerTools.length" :title="t('Tools')">
            <RhRow v-for="tool in timerTools" :key="tool.key" :to="tool.to" :icon="tool.icon" :label="tool.label" :description="tool.description" />
          </RhGroup>
        </template>
      </div>

      <UModal v-model:open="renameOpen" :title="t('Rename Profile')" :description="t('A profile stores frequency settings and sensor tuning values. Switch profiles to move between venues or setups.')">
        <template #body>
          <form id="rename-profile" @submit.prevent="renameProfile">
            <UFormField :label="t('Name')">
              <UInput v-model="profileDraft" class="w-full" autofocus />
            </UFormField>
          </form>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton type="submit" form="rename-profile" :label="t('Save')" :disabled="!profileDraft.trim()" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="deleteProfileOpen" :title="t('Remove profile?')" :description="S.node_tuning?.profile_name">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="error" :label="t('Remove')" @click="() => { rh.emit('delete_profile'); close() }" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
