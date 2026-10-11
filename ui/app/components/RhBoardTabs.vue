<script setup lang="ts">
/** A leaderboard with a segmented switch between its rankings. */
const props = defineProps<{ board: any, starts?: boolean, avgSpeed?: boolean, title?: string }>()
const { t } = useI18n()

const options = computed(() => {
  const o = [
    { label: t('Race Totals'), value: 'by_race_time' },
    { label: t('Fastest Laps'), value: 'by_fastest_lap' },
    { label: `${t('Fastest')} ${props.board?.meta?.consecutives_count || 3} ${t('Consecutive')}`, value: 'by_consecutives' }
  ]
  if (props.board?.meta?.speed_data) o.push({ label: t('Fastest Speeds'), value: 'by_fastest_speed' })
  return o
})
const sel = ref<string>(props.board?.meta?.primary_leaderboard || 'by_race_time')
const card = useTemplateRef('card')
watch(() => props.board?.meta?.primary_leaderboard, (v) => { if (v) sel.value = v })

// 'Fastest Speeds' is derived client-side (ties share a position)
const speedBoard = computed(() => {
  const rows = [...(props.board?.by_race_time || [])].filter((r: any) => r.top_speed).sort((a: any, b: any) => b.top_speed - a.top_speed)
  let pos = 0
  let last: number | null = null
  return { meta: props.board?.meta, by_fastest_speed: rows.map((r: any, i: number) => {
    if (r.top_speed !== last) pos = i + 1
    last = r.top_speed
    return { ...r, position: pos }
  }) }
})
</script>

<template>
  <UCard ref="card" :ui="{ body: 'p-0 sm:p-0', header: 'p-3 sm:px-4' }">
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h3 v-if="title" class="font-semibold text-highlighted">
          {{ title }}
        </h3>
        <UTabs v-model="sel" :items="options" :content="false" size="xs" color="neutral" class="max-w-full overflow-x-auto" :ui="{ list: 'w-fit' }" @update:model-value="revealAfterTabChange(card)" />
      </div>
    </template>
    <div v-if="sel === 'by_fastest_speed'" class="overflow-x-auto">
      <table class="w-full text-sm tabular">
        <thead>
          <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-dimmed">
            <th class="w-10 px-3 py-2">
              #
            </th>
            <th class="px-3 py-2">
              {{ t('Pilot') }}
            </th>
            <th class="px-3 py-2 text-right">
              {{ t('Top Speed') }}
            </th>
            <th class="px-3 py-2">
              {{ t('Source') }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-default">
          <tr v-for="r in speedBoard.by_fastest_speed" :key="r.pilot_id">
            <td class="px-3 py-2.5 font-semibold">
              {{ r.position }}
            </td>
            <td class="px-3 py-2.5 font-medium">
              {{ r.callsign }}
            </td>
            <td class="px-3 py-2.5 text-right">
              {{ r.top_speed }}
            </td>
            <td class="px-3 py-2.5 text-muted">
              {{ r.top_speed_source?.displayname }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <RhLeaderboard v-else :board="board" :kind="sel as any" :starts="starts" :avg-speed="avgSpeed && sel === 'by_race_time'" />
  </UCard>
</template>
