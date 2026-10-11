<script setup lang="ts">
/** Class ranking produced by a ranking method (plugin-defined columns). */
const props = defineProps<{ ranking: any }>()
const { t } = useI18n()
const rows = computed<any[]>(() => props.ranking?.ranking || [])
const fields = computed<any[]>(() => props.ranking?.meta?.rank_fields || [])
const team = computed(() => rows.value.some(r => r.team_name) && props.ranking?.meta?.team_racing_mode === 1)
</script>

<template>
  <div class="overflow-x-auto">
    <table v-if="rows.length" class="w-full text-sm tabular">
      <thead>
        <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-dimmed">
          <th class="w-12 px-3 py-2">
            {{ t('Rank') }}
          </th>
          <th class="px-3 py-2">
            {{ t('Pilot') }}
          </th>
          <th v-if="team" class="px-3 py-2">
            {{ t('Team') }}
          </th>
          <th v-for="f in fields" :key="f.name" class="px-3 py-2 text-right">
            {{ t(f.label) }}
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-default">
        <tr v-for="(r, i) in rows" :key="r.pilot_id ?? i">
          <td class="px-3 py-2.5 font-semibold text-highlighted">
            <RhValue :value="r.position" />
          </td>
          <td class="px-3 py-2.5 font-medium text-highlighted">
            {{ r.callsign }}
          </td>
          <td v-if="team" class="px-3 py-2.5 text-muted">
            {{ r.team_name }}
          </td>
          <td v-for="f in fields" :key="f.name" class="px-3 py-2.5 text-right">
            <RhValue :value="r[f.name]" />
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else class="px-4 py-6 text-center text-sm text-muted">
      {{ ranking?.meta?.method_label }} {{ t('did not produce a ranking.') }}
    </div>
  </div>
</template>
