<script setup lang="ts">
/** Read-only view of the event database's main tables (the classic /database page). */
const { t } = useI18n()
const rh = useRH()
useHead({ title: computed(() => t('Database')) })

const data = ref<Record<string, any[]> | null>(null)
const failed = ref(false)
const loading = ref(false)
async function load() {
  loading.value = true
  failed.value = false
  try {
    data.value = await $fetch<Record<string, any[]>>('/app-database', { baseURL: '/', headers: rh.authHeader() })
  } catch {
    failed.value = true
  } finally {
    loading.value = false
  }
}
// admin-only data: never asked for until sign-in is confirmed (see middleware/admin-pages)
const { admin } = useAuth()
watch(admin, ok => { if (ok && !data.value) load() }, { immediate: true })

// table key → label and column labels (same wording as the classic page)
const TABLES = computed(() => [
  { key: 'pilots', label: t('Pilots'), icon: 'i-lucide-users', cols: { id: t('ID'), callsign: t('Call Sign'), name: t('Name'), phonetic: t('Phonetic'), team: t('Team') } },
  { key: 'heats', label: t('Heats'), icon: 'i-lucide-layers', cols: { id: t('ID'), name: t('Name'), class_id: t('Class ID') } },
  { key: 'heat_nodes', label: t('Heat Nodes'), icon: 'i-lucide-git-merge', cols: { id: t('ID'), heat_id: t('Heat ID'), node_index: t('Node'), pilot_id: t('Pilot ID') } },
  { key: 'classes', label: t('Race Class'), icon: 'i-lucide-trophy', cols: { id: t('ID'), name: t('Name'), description: t('Description'), format_id: t('Format ID') } },
  { key: 'races', label: t('Saved Races'), icon: 'i-lucide-flag', cols: { id: t('ID'), round_id: t('Round ID'), heat_id: t('Heat ID'), class_id: t('Class ID'), format_id: t('Format ID'), start_time_formatted: t('Start Time') } },
  { key: 'laps', label: t('Laps'), icon: 'i-lucide-timer', cols: { id: t('ID'), race_id: t('Race ID'), node_index: t('Node Index'), pilot_id: t('Pilot ID'), lap_time_stamp: t('Lap Time Stamp'), lap_time: t('Lap Time'), lap_time_formatted: t('Lap Time Formatted'), deleted: t('Deleted') } },
  { key: 'profiles', label: t('Profiles'), icon: 'i-lucide-radio', cols: { id: t('ID'), name: t('Name'), description: t('Description'), frequencies: t('Frequencies'), enter_ats: t('EnterAts'), exit_ats: t('ExitAts') } },
  { key: 'formats', label: t('Race Format'), icon: 'i-lucide-timer-reset', cols: { id: t('ID'), name: t('Name'), unlimited_time: t('Mode'), race_time_sec: t('Time'), start_delay_min_ms: t('Min Start Delay'), start_delay_max_ms: t('Max Start Delay'), number_laps_win: t('Laps Win Mode'), win_condition: t('Win Condition'), team_racing_mode: t('Team/Co-op Racing Mode') } },
  { key: 'options', label: t('Global Settings'), icon: 'i-lucide-settings-2', cols: { option: t('Option'), value: t('Value') } }
])
const tab = ref('pilots')
const tabs = computed(() => TABLES.value.map(x => ({ label: x.label, value: x.key, icon: x.icon, badge: data.value?.[x.key]?.length ?? undefined })))
const current = computed(() => TABLES.value.find(x => x.key === tab.value)!)

const filter = ref('')
const rows = computed(() => {
  const all = data.value?.[tab.value] || []
  const q = filter.value.trim().toLowerCase()
  if (!q) return all
  return all.filter(r => Object.values(r).some(v => String(v ?? '').toLowerCase().includes(q)))
})
// long tables (laps) render in pages so the browser stays responsive
const PAGE = 200
const page = ref(1)
watch([tab, filter], () => { page.value = 1 })
const shown = computed(() => rows.value.slice((page.value - 1) * PAGE, page.value * PAGE))
const columns = computed(() => Object.entries(current.value.cols).map(([key, header]) => ({ accessorKey: key, header })))
</script>

<template>
  <UDashboardPanel id="database">
    <template #header>
      <UDashboardNavbar :title="t('Database')">
        <template #leading>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" to="/settings/data" :aria-label="t('Data & Backups')" />
        </template>
        <template #right>
          <RhBell />
          <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :loading="loading" :aria-label="t('Refresh')" @click="load" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-5">
        <p class="text-sm text-muted">
          {{ t('A read-only view of the event database. Change data on the Pilots, Heats and Formats pages.') }}
        </p>
        <!-- one button per table, wrapping so every name shows in full -->
        <div class="flex flex-wrap gap-2" role="group" :aria-label="t('Database')">
          <UButton
            v-for="x in tabs"
            :key="x.value"
            :icon="x.icon"
            :label="x.label"
            size="sm"
            :color="tab === x.value ? 'primary' : 'neutral'"
            :variant="tab === x.value ? 'soft' : 'ghost'"
            :aria-pressed="tab === x.value"
            @click="tab = x.value"
          >
            <template #trailing>
              <span v-if="x.badge !== undefined" class="tabular text-xs opacity-70">{{ x.badge }}</span>
            </template>
          </UButton>
        </div>

        <UEmpty v-if="failed" icon="i-lucide-database-zap" :title="t('The database could not be loaded')" :actions="[{ label: t('Try again'), icon: 'i-lucide-refresh-cw', onClick: load, color: 'neutral', variant: 'subtle' }]" variant="naked" />
        <template v-else>
          <div class="flex items-center gap-3">
            <UInput v-model="filter" icon="i-lucide-search" :placeholder="t('Filter rows…')" class="w-full sm:w-72" />
            <span class="shrink-0 whitespace-nowrap text-sm tabular text-muted">{{ rows.length }} {{ rows.length === 1 ? t('row') : t('rows') }}</span>
          </div>
          <UCard :ui="{ body: 'p-0 sm:p-0' }">
            <UTable :data="shown" :columns="columns" :loading="loading && !data" class="max-h-[65vh]" sticky :ui="{ td: 'tabular whitespace-nowrap', th: 'whitespace-nowrap' }" :empty="t('No rows')" />
          </UCard>
          <div v-if="rows.length > PAGE" class="flex justify-center">
            <UPagination v-model:page="page" :total="rows.length" :items-per-page="PAGE" />
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
