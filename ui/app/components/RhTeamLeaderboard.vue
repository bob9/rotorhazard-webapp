<script setup lang="ts">
/** Team (team_racing_mode 1) or co-op (2) leaderboard. */
const props = defineProps<{ board?: any, list?: string }>()
const { t } = useI18n()
const coop = computed(() => !!props.board?.meta?.coopGroup)
const key = computed(() => props.list || props.board?.meta?.primary_leaderboard || 'by_race_time')
const rows = computed<any[]>(() => props.board?.[key.value] || [])
const consecutives = computed(() => props.board?.meta?.consecutives_count || 3)
</script>

<template>
  <div v-if="rows.length" class="overflow-x-auto">
    <table class="w-full text-sm">
      <thead>
        <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-dimmed">
          <th v-if="!coop" class="w-10 px-3 py-2 whitespace-nowrap first:pl-4 sm:first:pl-6">
            #
          </th>
          <th class="w-full px-3 py-2 first:pl-4 sm:first:pl-6">
            {{ coop ? t('Co-op') : t('Team') }}
          </th>
          <th class="whitespace-nowrap px-3 py-2 text-right last:pr-4 sm:last:pr-6">
            {{ t('Contributors') }}
          </th>
          <template v-if="key === 'by_race_time'">
            <th class="whitespace-nowrap px-3 py-2 text-right last:pr-4 sm:last:pr-6">
              {{ t('Laps') }}
            </th>
            <th class="whitespace-nowrap px-3 py-2 text-right last:pr-4 sm:last:pr-6">
              {{ coop ? t('Total') : t('Average Lap') }}
            </th>
          </template>
          <th v-else-if="key === 'by_avg_fastest_lap'" class="whitespace-nowrap px-3 py-2 text-right last:pr-4 sm:last:pr-6">
            {{ t('Average Fastest') }}
          </th>
          <th v-else class="whitespace-nowrap px-3 py-2 text-right last:pr-4 sm:last:pr-6">
            {{ t('Average') }} {{ consecutives }} {{ t('Consecutive') }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default tabular">
        <tr v-for="r in rows" :key="r.name">
          <td v-if="!coop" class="px-3 py-2.5 font-semibold first:pl-4 sm:first:pl-6">
            <RhValue :value="r.position" />
          </td>
          <td class="max-w-0 truncate px-3 py-2.5 font-medium text-highlighted first:pl-4 sm:first:pl-6">
            {{ coop ? t('Group') : r.name }}
          </td>
          <td class="whitespace-nowrap px-3 py-2.5 text-right text-muted last:pr-4 sm:last:pr-6">
            {{ r.contributing }}/{{ r.members }}
          </td>
          <template v-if="key === 'by_race_time'">
            <td class="whitespace-nowrap px-3 py-2.5 text-right font-semibold last:pr-4 sm:last:pr-6">
              {{ r.laps }}
            </td>
            <td class="whitespace-nowrap px-3 py-2.5 text-right last:pr-4 sm:last:pr-6">
              <RhValue :value="coop ? r.coop_total_time || r.total_time : r.average_lap" />
            </td>
          </template>
          <td v-else-if="key === 'by_avg_fastest_lap'" class="whitespace-nowrap px-3 py-2.5 text-right last:pr-4 sm:last:pr-6">
            <RhValue :value="r.average_fastest_lap" />
          </td>
          <td v-else class="whitespace-nowrap px-3 py-2.5 text-right last:pr-4 sm:last:pr-6">
            <RhValue :value="r.average_consecutives" />
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
