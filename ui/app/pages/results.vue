<script setup lang="ts">
const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Results')) })
const { info } = useServerInfo()
const { admin } = useAuth()
rh.load(['result_data', 'pilot_data'])

const data = computed(() => rh.state.result_data)
const heatsByClass = computed<Record<string, number[]>>(() => data.value?.heats_by_class || {})
const classes = computed<Record<string, any>>(() => data.value?.classes || {})
const groups = computed(() => Object.entries(heatsByClass.value)
  .filter(([, ids]) => ids.length)
  .map(([cid, ids]) => ({
    id: cid,
    name: cid === 'null' ? (Object.keys(heatsByClass.value).length > 1 ? t('Unclassified') : t('Heats')) : (classes.value[cid]?.name || `${t('Class')} ${cid}`),
    cls: cid === 'null' ? null : classes.value[cid],
    heats: ids.map(id => data.value.heats[id]).filter(Boolean)
  })))
const hasData = computed(() => Object.keys(data.value?.heats || {}).length > 0)

const tabs = computed(() => [
  { label: t('Event Totals'), value: 'event', icon: 'i-lucide-trophy' },
  ...groups.value.map(g => ({ label: g.name, value: g.id }))
])
// the tab is part of the address (/results?tab=<class>), so a link or Back opens the same one
const route = useRoute()
const router = useRouter()
const tab = computed({
  get: () => {
    const q = typeof route.query.tab === 'string' ? route.query.tab : ''
    // a class that no longer has results falls back to the event totals
    return q && (!hasData.value || groups.value.some(g => g.id === q)) ? q : 'event'
  },
  set: v => router.replace({ query: { ...route.query, tab: v === 'event' ? undefined : v } })
})
const group = computed(() => groups.value.find(g => g.id === tab.value))

const fastest = computed(() => data.value?.event_leaderboard?.meta?.fastest_race_lap_data?.text)
const pilotsRaced = computed(() => data.value?.event_leaderboard?.by_race_time?.length || 0)
const racesRun = computed(() => Object.values(data.value?.heats || {}).reduce((n: number, h: any) => n + (h.rounds?.length || 0), 0))

const openHeats = ref<string[]>([])
watch(group, (g) => { openHeats.value = g?.heats?.length ? [String(g.heats[g.heats.length - 1].heat_id)] : [] }, { immediate: true })
</script>

<template>
  <UDashboardPanel id="results">
    <template #header>
      <UDashboardNavbar :title="t('Results')">
        <template #right>
          <RhBell />
          <UButton v-if="admin" color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :aria-label="t('Rebuild results')" @click="rh.emit('clean_cache'); rh.refresh(['result_data'])" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6">
        <!-- a banner, not a cover: the standings stay above the fold -->
        <header class="relative -mx-4 -mt-4 flex h-44 flex-col justify-end overflow-hidden bg-neutral-900 sm:-mx-6 sm:-mt-6 sm:h-56 lg:mx-0 lg:mt-0 lg:rounded-3xl">
          <RhArt name="results-hero" class="absolute inset-0 size-full object-cover object-[center_65%]" />
          <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/0" />
          <div class="relative space-y-1.5 p-5 sm:p-7">
            <p class="text-sm font-semibold text-white/75">
              {{ t('Results') }}
            </p>
            <h1 class="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {{ info?.event?.name || t('Event') }}
            </h1>
            <RhMarkdown v-if="info?.event?.description" :source="info.event.description" class="line-clamp-1 max-w-3xl text-sm text-white/80 sm:text-base" />
          </div>
        </header>
        <div v-if="hasData">
          <div class="flex flex-wrap gap-3">
            <div class="rounded-2xl bg-elevated/60 px-4 py-3">
              <div class="text-xs text-muted">
                {{ t('Pilots') }}
              </div>
              <div class="font-display tabular text-2xl font-semibold">
                {{ pilotsRaced }}
              </div>
            </div>
            <div class="rounded-2xl bg-elevated/60 px-4 py-3">
              <div class="text-xs text-muted">
                {{ t('Races') }}
              </div>
              <div class="font-display tabular text-2xl font-semibold">
                {{ racesRun }}
              </div>
            </div>
            <div v-if="fastest" class="rounded-2xl bg-elevated/60 px-4 py-3">
              <div class="text-xs text-muted">
                {{ t('Fastest Lap') }}
              </div>
              <div class="font-display tabular text-2xl font-semibold">
                {{ fastest[1] }} <span class="text-base font-medium text-muted">{{ fastest[0] }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!data" class="space-y-3">
          <USkeleton class="h-10 w-80" />
          <USkeleton class="h-64 w-full" />
        </div>
        <RhArt v-if="data && !hasData" name="empty-results" class="mx-auto w-full max-w-sm rounded-3xl shadow-lg" />
        <UEmpty
          v-if="data && !hasData"
          variant="naked"
          icon="i-lucide-trophy"
          :title="t('No results yet')"
          :description="t('Results appear here as soon as the first race is saved.')"
        />
        <template v-if="hasData">
          <UTabs v-model="tab" :items="tabs" :content="false" variant="link" class="-mt-2 max-w-full overflow-x-auto pb-px" :ui="{ list: 'w-full border-default', trigger: 'text-base py-2.5', indicator: 'h-0.5' }" />

          <div v-if="tab === 'event'" class="space-y-6">
            <RhBoardTabs :board="data.event_leaderboard" starts avg-speed />
          </div>

          <div v-else-if="group" class="space-y-6">
            <RhMarkdown v-if="group.cls?.description" :source="group.cls.description" class="text-muted" />
            <UCard v-if="group.cls?.ranking" :ui="{ body: 'p-0 sm:p-0' }">
              <template #header>
                <h3 class="font-semibold">
                  {{ t('Class Ranking') }}
                  <span class="font-normal text-muted">· {{ group.cls.ranking.meta?.method_label }}</span>
                </h3>
              </template>
              <RhRanking :ranking="group.cls.ranking" />
            </UCard>
            <RhBoardTabs :board="group.cls?.leaderboard" :title="t('Class Summary')" starts />

            <div class="space-y-3">
              <h2 class="font-display text-xl font-semibold">
                {{ t('Heats') }}
              </h2>
              <UAccordion
                v-model="openHeats"
                type="multiple"
                :items="group.heats.map((h: any) => ({ label: h.displayname, value: String(h.heat_id), heat: h }))"
                :ui="{ root: 'rounded-2xl ring-1 ring-default bg-default divide-y divide-default', item: 'px-4', trigger: 'py-4 text-base font-semibold' }"
              >
                <template #trailing="{ item }">
                  <span class="ml-auto mr-3 text-sm font-normal text-muted">{{ item.heat.rounds.length }} {{ item.heat.rounds.length === 1 ? t('round') : t('rounds') }}</span>
                </template>
                <template #body="{ item }">
                  <RhHeatResults :heat="item.heat" class="pb-4" />
                </template>
              </UAccordion>
            </div>
          </div>
        </template>

        <RhPluginPanels page="results" />
      </div>
    </template>
  </UDashboardPanel>
</template>
