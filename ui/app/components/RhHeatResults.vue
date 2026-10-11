<script setup lang="ts">
/** Saved results of one heat: summary plus each round with its laps. */
const props = defineProps<{ heat: any }>()
const { t } = useI18n()
const rounds = computed<any[]>(() => props.heat?.rounds || [])
const openRound = ref<number | null>(rounds.value.length ? rounds.value[rounds.value.length - 1].id : null)

function lapLabel(lap: any, idx: number | string, startBehavior?: number) {
  idx = Number(idx)
  return startBehavior === 1 ? idx + 1 : idx === 0 ? 'HS' : idx
}
function visibleLaps(node: any) {
  return (node.laps || []).filter((l: any) => !l.deleted)
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="rounds.length > 1">
      <div class="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">
        {{ t('Heat Summary') }}
      </div>
      <div class="overflow-hidden rounded-xl ring-1 ring-default">
        <RhLeaderboard :board="heat.leaderboard" kind="heat" />
      </div>
    </div>

    <div v-for="r in rounds" :key="r.id" class="overflow-hidden rounded-xl ring-1 ring-default">
      <button
        type="button"
        class="flex w-full items-center justify-between gap-3 bg-elevated/40 px-4 py-2.5 text-left transition-colors hover:bg-elevated"
        @click="openRound = openRound === r.id ? null : r.id"
      >
        <div class="min-w-0">
          <span class="font-medium text-highlighted">{{ t('Round') }} {{ r.id }}</span>
          <span class="ml-2 text-sm text-muted">{{ formatStartTime(r.start_time_formatted) }}</span>
          <span class="ml-2 hidden text-sm text-dimmed sm:inline">· {{ r.format_name }}</span>
        </div>
        <UIcon name="i-lucide-chevron-down" class="size-4 text-muted transition-transform" :class="openRound === r.id ? 'rotate-180' : ''" />
      </button>
      <div v-show="openRound === r.id" class="border-t border-default">
        <RhLeaderboard :board="r.leaderboard" kind="round" />
        <div class="grid gap-px border-t border-default bg-(--ui-border) sm:grid-cols-2 lg:grid-cols-4">
          <div v-for="n in r.nodes" :key="n.node_index" class="bg-default p-3">
            <div class="mb-1.5 text-sm font-semibold text-highlighted">
              {{ n.callsign }}
            </div>
            <ol class="space-y-0.5 text-sm tabular">
              <li v-for="(lap, i) in visibleLaps(n)" :key="lap.id" class="flex justify-between gap-3">
                <span class="text-dimmed">{{ lapLabel(lap, i, r.leaderboard?.meta?.start_behavior) }}</span>
                <span class="flex-1 text-right">
                  <span v-if="lap.speed" class="mr-2 text-xs text-dimmed">{{ lap.speed }}</span>
                  {{ lap.lap_time_formatted }}
                </span>
              </li>
              <li v-if="!visibleLaps(n).length" class="text-dimmed">
                {{ t('No laps') }}
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
