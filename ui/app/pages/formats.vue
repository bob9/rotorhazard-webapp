<script setup lang="ts">
import { WIN_CONDITIONS } from '~/utils/format'

const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Formats')) })
const { admin } = useAuth()
rh.load(['format_data', 'race_status', 'race_points_method_list', 'class_data'])

const S = rh.state
const formats = computed<any[]>(() => S.format_data?.formats || [])
const sel = ref<number | null>(null)
watch(formats, (fs) => {
  if (fs.length && !fs.some(f => f.id === sel.value)) sel.value = fs[0].id
}, { immediate: true })
const fmt = computed(() => formats.value.find(f => f.id === sel.value))
const locked = ref(false)
watch(fmt, (f, old) => { if (f?.id !== old?.id) locked.value = !!f?.locked }, { immediate: true })
const activeRace = computed(() => [1, 2, 3].includes(S.race_status?.race_status) && S.race_status?.race_format_id === sel.value)
const editable = computed(() => !!admin.value && !locked.value && !activeRace.value)
const usedBy = computed(() => (S.class_data?.classes || []).filter((c: any) => c.format === sel.value).map((c: any) => c.displayname))

const FIELD_KEYS: Record<string, string> = {
  format_name: 'name', start_delay_min_ms: 'start_delay_min', start_delay_max_ms: 'start_delay_max'
}
function alter(data: Record<string, any>) {
  if (!fmt.value) return
  rh.emit('alter_race_format', { format_id: fmt.value.id, ...data })
  for (const [k, v] of Object.entries(data)) fmt.value[FIELD_KEYS[k] || k] = v
}

function duplicate() {
  const before = new Set(formats.value.map(f => f.id))
  rh.emit('add_race_format', { source_format_id: sel.value })
  const stop = watch(formats, (fs) => {
    const fresh = fs.find(f => !before.has(f.id))
    if (fresh) {
      sel.value = fresh.id
      stop()
    }
  })
}
const deleteOpen = ref(false)
const unlockOpen = ref(false)

const clockModes = computed(() => [{ label: t('Fixed Time'), value: 0 }, { label: t('No Time Limit'), value: 1 }])
const stagingTones = computed(() => [{ label: t('Each Second'), value: 2 }, { label: t('None'), value: 0 }])
const startBehaviors = computed(() => [
  { label: t('Hole Shot'), value: 0, description: t('The first crossing starts the race; laps count from the next one.') },
  { label: t('First Lap'), value: 1, description: t('The first crossing counts as lap 1.') },
  { label: t('Staggered Start'), value: 2, description: t('Each pilot\'s time starts at their own first crossing.') }
])
const winItems = computed(() => [1, 5, 6, 2, 3, 4, 0].map(v => ({ value: v, label: t(WIN_CONDITIONS.find(w => w.value === v)!.label) })))
const teamItems = computed(() => [{ label: t('Individual'), value: 0 }, { label: t('Team'), value: 1 }, { label: t('Co-op'), value: 2 }])
const pointsItems = computed(() => [{ label: t('None'), value: '__none__' }, ...(S.race_points_method_list?.methods || []).map((m: any) => ({ label: m.label, value: m.name }))])
const pointsMethod = computed(() => (S.race_points_method_list?.methods || []).find((m: any) => m.name === fmt.value?.points_method))
const pointsDraft = ref<Record<string, any>>({})
const pointsOpen = ref(false)
function openPoints() {
  pointsDraft.value = Object.fromEntries((pointsMethod.value?.settings || []).map((f: any) => [f.name, fmt.value?.points_settings?.[f.name] ?? f.value]))
  pointsOpen.value = true
}
function savePoints() {
  // the server replaces the whole settings object, so always send every field
  alter({ points_settings: { ...pointsDraft.value } })
  pointsOpen.value = false
}

// race length shown as minutes and seconds
const durMin = computed(() => Math.floor((fmt.value?.race_time_sec || 0) / 60))
const durSec = computed(() => (fmt.value?.race_time_sec || 0) % 60)
function setDuration(m: number, s: number) {
  alter({ race_time_sec: Math.max(0, (m || 0) * 60 + (s || 0)) })
}

const suggestions = computed(() => {
  const f = fmt.value
  if (!f) return []
  const out: string[] = []
  if (f.win_condition === 2 && !f.unlimited_time) out.push(t('"First to X Laps" usually uses No Time Limit, so the race runs until a pilot finishes.'))
  if ([5, 6].includes(f.win_condition) && f.unlimited_time) out.push(t('"Most Laps" conditions need a fixed race time.'))
  if (f.win_condition === 2 && !f.number_laps_win) out.push(t('Set the number of laps to win.'))
  if (f.start_behavior === 2 && f.win_condition === 1) out.push(t('With a staggered start, "Most Laps Only" or "Fastest Consecutive Laps" are usually fairer.'))
  return out
})
</script>

<template>
  <UDashboardPanel id="formats" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar :title="t('Formats')">
        <template #right>
          <RhBell />
          <UButton v-if="admin && fmt && !(locked && !activeRace)" icon="i-lucide-copy-plus" color="neutral" variant="soft" :label="t('Duplicate')" @click="duplicate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- sized by its content (not flex-1, whose zero basis caps it at the panel height), so the format list's divider runs the full height -->
      <div class="flex min-h-full shrink-0 grow flex-col lg:flex-row">
        <aside class="border-b border-default p-3 lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div class="mb-2 px-2 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
            {{ t('Race Formats') }}
          </div>
          <nav class="flex gap-1 overflow-x-auto lg:flex-col">
            <button
              v-for="f in formats"
              :key="f.id"
              type="button"
              class="flex shrink-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
              :class="sel === f.id ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:bg-elevated/60 hover:text-highlighted'"
              @click="sel = f.id"
            >
              <span class="truncate">{{ t(f.name) }}</span>
              <UIcon v-if="f.locked" name="i-lucide-lock" class="size-3.5 shrink-0 text-dimmed" />
            </button>
          </nav>
        </aside>

        <div v-if="fmt" class="min-w-0 flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
          <div class="mx-auto max-w-3xl space-y-8">
            <header class="flex items-start gap-3">
              <div class="min-w-0 flex-1">
                <UInput
                  :model-value="fmt.name"
                  variant="ghost"
                  size="xl"
                  class="w-full"
                  :ui="{ base: 'font-display text-3xl font-semibold px-1 -ml-1 text-highlighted disabled:opacity-100 disabled:cursor-default' }"
                  :disabled="!editable"
                  :aria-label="t('Format name')"
                  @change="(e: any) => alter({ format_name: e.target.value })"
                />
                <p v-if="usedBy.length" class="mt-1 px-1 text-sm text-muted">
                  {{ t('Used by') }} {{ usedBy.join(', ') }}
                </p>
              </div>
              <UDropdownMenu
                v-if="admin"
                :items="[[
                  { label: t('Duplicate'), icon: 'i-lucide-copy', onSelect: duplicate },
                  ...(locked ? [{ label: t('Unlock'), icon: 'i-lucide-lock-open', onSelect: () => { unlockOpen = true } }] : [])
                ], ...(!fmt.locked ? [[{ label: t('Delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteOpen = true } }]] : [])]"
                :content="{ align: 'end' }"
              >
                <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('Format actions')" />
              </UDropdownMenu>
            </header>

            <UAlert v-if="activeRace" color="warning" variant="subtle" icon="i-lucide-info" :title="t('Format cannot be changed for currently active race.')" :actions="[{ label: t('Go to Race'), to: '/', color: 'neutral', variant: 'outline' }]" />
            <UAlert
              v-else-if="locked && admin"
              color="neutral"
              variant="subtle"
              icon="i-lucide-lock"
              :title="t('This format has saved races.')"
              :description="t('Duplicate it to make changes for future races. Editing this format changes saved results retroactively.')"
              :actions="[
                { label: t('Duplicate and edit'), icon: 'i-lucide-copy-plus', color: 'primary', variant: 'solid', onClick: duplicate },
                { label: t('Unlock anyway'), color: 'neutral', variant: 'ghost', onClick: () => { unlockOpen = true } }
              ]"
            />

            <!-- settings: read-only formats are shown greyed so they don't look editable -->
            <div class="space-y-8 transition-[opacity,filter]" :class="!editable ? 'opacity-60 grayscale' : ''" :aria-disabled="!editable || undefined">
              <RhGroup :title="t('Race Clock')">
                <RhRow :label="t('Race Clock Mode')">
                  <UTabs :model-value="fmt.unlimited_time ? 1 : 0" :items="clockModes.map(m => ({ ...m, disabled: !editable }))" :content="false" size="sm" :ui="{ list: 'w-fit' }" @update:model-value="(v: any) => alter({ unlimited_time: Number(v) })" />
                </RhRow>
                <template v-if="!fmt.unlimited_time">
                  <RhRow :label="t('Timer Duration')">
                    <div class="flex items-center gap-2">
                      <UInputNumber :model-value="durMin" :min="0" class="w-28" :disabled="!editable" @update:model-value="(v: any) => setDuration(v, durSec)" />
                      <span class="text-sm text-muted">{{ t('min') }}</span>
                      <UInputNumber :model-value="durSec" :min="0" :max="59" class="w-28" :disabled="!editable" @update:model-value="(v: any) => setDuration(durMin, v)" />
                      <span class="text-sm text-muted">{{ t('sec') }}</span>
                    </div>
                  </RhRow>
                  <!-- the server's lap_grace_sec uses -1 for "wait for a manual stop" -->
                  <RhRow id="grace-period" :label="t('Wait for a manual stop')" :description="t('After the clock ends, keep counting laps until you stop the race.')" inline>
                    <USwitch :model-value="fmt.lap_grace_sec < 0" :disabled="!editable" :aria-label="t('Wait for a manual stop')" @update:model-value="(v: boolean) => alter({ lap_grace_sec: v ? -1 : 60 })" />
                  </RhRow>
                  <RhRow v-if="fmt.lap_grace_sec >= 0" :label="t('Grace Period')" :description="t('Seconds after the clock ends that a final lap still counts.')">
                    <div class="flex items-center gap-2">
                      <UInputNumber :model-value="fmt.lap_grace_sec" :min="0" class="w-36" :disabled="!editable" @update:model-value="(v: any) => alter({ lap_grace_sec: v })" />
                      <span class="text-sm text-muted">{{ t('sec') }}</span>
                    </div>
                  </RhRow>
                </template>
              </RhGroup>

              <RhGroup :title="t('Staging')" :footer="fmt.start_delay_max ? t('With a random delay, the staging countdown is hidden so pilots react to the start tone.') : undefined">
                <RhRow :label="t('Prestage Tones')" :description="t('Fixed beeps before staging starts.')">
                  <UInputNumber :model-value="fmt.staging_fixed_tones" :min="0" class="w-36" :disabled="!editable" @update:model-value="(v: any) => alter({ staging_fixed_tones: v })" />
                </RhRow>
                <RhRow :label="t('Staging Tones')">
                  <USelect :model-value="fmt.staging_delay_tones" :items="stagingTones" class="w-48" :disabled="!editable" @update:model-value="(v: any) => alter({ staging_delay_tones: v })" />
                </RhRow>
                <RhRow :label="t('Minimum Staging Time')">
                  <div class="flex items-center gap-2">
                    <UInputNumber :model-value="(fmt.start_delay_min || 0) / 1000" :min="0" :step="0.1" :format-options="{ maximumFractionDigits: 1 }" class="w-36" :disabled="!editable" @update:model-value="(v: any) => alter({ start_delay_min_ms: Math.round((v || 0) * 1000) })" />
                    <span class="text-sm text-muted">{{ t('sec') }}</span>
                  </div>
                </RhRow>
                <RhRow :label="t('Random Staging Time')" :description="t('Adds a random extra delay of up to this length.')">
                  <div class="flex items-center gap-2">
                    <UInputNumber :model-value="(fmt.start_delay_max || 0) / 1000" :min="0" :step="0.1" :format-options="{ maximumFractionDigits: 1 }" class="w-36" :disabled="!editable" @update:model-value="(v: any) => alter({ start_delay_max_ms: Math.round((v || 0) * 1000) })" />
                    <span class="text-sm text-muted">{{ t('sec') }}</span>
                  </div>
                </RhRow>
              </RhGroup>

              <RhGroup :title="t('Scoring')">
                <RhRow :label="t('First Crossing')" :description="startBehaviors.find(s => s.value === fmt.start_behavior)?.description">
                  <USelect :model-value="fmt.start_behavior" :items="startBehaviors" class="w-full sm:w-56" :disabled="!editable" @update:model-value="(v: any) => alter({ start_behavior: v })" />
                </RhRow>
                <RhRow :label="t('Win Condition')">
                  <USelect :model-value="fmt.win_condition" :items="winItems" class="w-full sm:w-64" :disabled="!editable" @update:model-value="(v: any) => alter({ win_condition: v })" />
                </RhRow>
                <RhRow v-if="fmt.win_condition === 2" :label="t('Number of Laps to Win')">
                  <UInputNumber :model-value="fmt.number_laps_win" :min="0" class="w-36" :disabled="!editable" @update:model-value="(v: any) => alter({ number_laps_win: v })" />
                </RhRow>
                <RhRow :label="t('Team/Co-op Racing Mode')">
                  <USelect :model-value="fmt.team_racing_mode || 0" :items="teamItems" class="w-48" :disabled="!editable" @update:model-value="(v: any) => alter({ team_racing_mode: v })" />
                </RhRow>
                <RhRow :label="t('Points Assignment')" :description="t('Award points by finishing position, for class rankings.')">
                  <div class="flex w-full gap-2 sm:w-auto">
                    <USelect :model-value="fmt.points_method || '__none__'" :items="pointsItems" class="w-full sm:w-56" :disabled="!editable" @update:model-value="(v: any) => alter({ points_method: v === '__none__' ? null : v })" />
                    <UButton v-if="pointsMethod?.settings?.length" icon="i-lucide-settings-2" color="neutral" variant="outline" :disabled="!editable" :aria-label="t('Settings')" @click="openPoints" />
                  </div>
                </RhRow>
              </RhGroup>
            </div>

            <div v-if="suggestions.length" class="space-y-2">
              <UAlert v-for="s in suggestions" :key="s" color="info" variant="subtle" icon="i-lucide-lightbulb" :description="s" />
            </div>
          </div>
        </div>
      </div>

      <UModal v-model:open="pointsOpen" :title="pointsMethod?.label" :description="t('Points settings')">
        <template #body>
          <RhGroup>
            <RhField v-for="f in pointsMethod?.settings || []" :key="f.name" :field="f" :model-value="pointsDraft[f.name]" @commit="(v: any) => { pointsDraft[f.name] = v }" />
          </RhGroup>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton :label="t('Save')" @click="savePoints" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="unlockOpen" :title="t('Unlock format?')" :description="t('Modifying a locked format retroactively changes saved race data.')">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="warning" :label="t('Unlock')" @click="() => { locked = false; close() }" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="deleteOpen" :title="t('Delete format?')" :description="t('This cannot be undone.')">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="error" :label="t('Delete')" @click="() => { rh.emit('delete_race_format', { format_id: sel }); close() }" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
