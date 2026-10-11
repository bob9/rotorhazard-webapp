<script setup lang="ts">
/**
 * Leaderboard table. `kind` follows the classic interface's display types:
 * 'current' | 'heat' | 'round' show the combined columns; 'by_race_time',
 * 'by_fastest_lap', 'by_consecutives' show one ranking with its source.
 * Rows are always rendered in the server's order.
 */
const props = withDefaults(defineProps<{
  board?: any
  kind?: 'current' | 'heat' | 'round' | 'by_race_time' | 'by_fastest_lap' | 'by_consecutives'
  list?: string
  starts?: boolean
  avgSpeed?: boolean
  topSpeed?: boolean
  seatColors?: Record<number, string>
  minLapMs?: number
  dense?: boolean
  /** fill the height of its container, spreading the rows out (presentation mode) */
  fill?: boolean
}>(), { kind: 'current' })
const { t } = useI18n()

const meta = computed(() => props.board?.meta || {})
const listKey = computed(() => props.list || (['by_race_time', 'by_fastest_lap', 'by_consecutives'].includes(props.kind) ? props.kind : meta.value.primary_leaderboard || 'by_race_time'))
const rows = computed<any[]>(() => props.board?.[listKey.value] || [])
const team = computed(() => meta.value.team_racing_mode === 1)
const combined = computed(() => ['current', 'heat', 'round'].includes(props.kind))
const staggered = computed(() => meta.value.start_behavior === 2)
const showRaceTime = computed(() => combined.value || props.kind === 'by_race_time')
const showFastest = computed(() => combined.value || props.kind === 'by_fastest_lap')
const showConsec = computed(() => combined.value || props.kind === 'by_consecutives')
const showSource = computed(() => props.kind === 'by_fastest_lap' || props.kind === 'by_consecutives')
const showPoints = computed(() => props.kind === 'round' && 'primary_points' in meta.value)
const showTopSpeed = computed(() => meta.value.speed_data && (props.kind === 'heat' || props.kind === 'round' || (props.kind === 'current' && props.topSpeed)))
const showAvgSpeed = computed(() => meta.value.speed_data && props.avgSpeed)

function source(s: any) {
  if (!s) return ''
  return s.round ? `${s.displayname} / ${t('Round')} ${s.round}` : s.displayname
}
function avgSpeed(r: any) {
  return r.speed_count ? (r.speed_total / r.speed_count).toFixed(1) : null
}
// numeric columns hug their content; the outer columns line up with the card's padding
// (a little tighter on phones, so a pilot column and four figures fit a 360px screen)
const cell = computed(() => ['whitespace-nowrap', props.dense ? 'px-2 py-2' : 'px-2 py-2.5 sm:px-3'])
// table inset so the outer cells line up with the card's padding (16px / 24px from sm)
const inset = computed(() => props.dense ? 'px-2 sm:px-4' : 'px-1 sm:px-3')
// on phones a combined board drops the less important columns (Avg. is already hidden)
const consecClass = computed(() => combined.value ? 'hidden sm:table-cell' : '')
// ...and the total time, so pilot names stay readable (laps and fastest lap remain)
const totalClass = consecClass
// the pilots (or seats) on the board; it changes with the heat, not while a race runs
const rowsKey = computed(() => rows.value.map((r, i) => r.pilot_id ?? `n${r.node}-${i}`).sort().join(','))
</script>

<template>
  <div class="overflow-x-auto" :class="[inset, fill ? 'h-full' : '']">
    <table class="w-full text-sm" :class="fill ? 'h-full' : ''">
      <thead>
        <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-dimmed">
          <th :class="cell" class="w-10">
            #
          </th>
          <th :class="cell" class="w-full min-w-24 sm:min-w-28">
            {{ t('Pilot') }}
          </th>
          <th v-if="team" :class="cell">
            {{ t('Team') }}
          </th>
          <th v-if="starts" :class="cell" class="text-right">
            {{ t('Starts') }}
          </th>
          <template v-if="showRaceTime">
            <th :class="cell" class="text-right">
              {{ t('Laps') }}
            </th>
            <th :class="[cell, totalClass]" class="text-right">
              {{ staggered ? t('Laps Total') : t('Total') }}
            </th>
            <th :class="cell" class="text-right hidden sm:table-cell">
              {{ t('Avg.') }}
            </th>
            <th v-if="showAvgSpeed" :class="cell" class="text-right">
              {{ t('Avg. Speed') }}
            </th>
          </template>
          <th v-if="showFastest" :class="cell" class="text-right">
            {{ t('Fastest') }}
          </th>
          <th v-if="showFastest && showSource" :class="cell" class="hidden md:table-cell">
            {{ t('Source') }}
          </th>
          <th v-if="showConsec" :class="[cell, consecClass]" class="text-right">
            {{ t('Consecutive') }}
          </th>
          <th v-if="showConsec && showSource" :class="cell" class="hidden md:table-cell">
            {{ t('Source') }}
          </th>
          <th v-if="showTopSpeed" :class="cell" class="text-right">
            {{ t('Top Speed') }}
          </th>
          <th v-if="showPoints" :class="cell" class="text-right">
            {{ t('Points') }}
          </th>
        </tr>
      </thead>
      <!-- keyed by who is on the board: another heat replaces the rows at once, instead of the
           old rows fading out beside the new ones -->
      <TransitionGroup :key="rowsKey" tag="tbody" name="rh" class="divide-y divide-default">
        <tr v-for="(r, i) in rows" :key="r.pilot_id ?? `n${r.node}-${i}`" class="tabular">
          <td :class="cell" class="font-semibold text-highlighted">
            <span
              v-if="r.position"
              class="inline-flex size-6 items-center justify-center rounded-full text-xs"
              :class="r.position === 1 ? 'bg-amber-400/20 text-amber-800 dark:text-amber-300' : r.position === 2 ? 'bg-zinc-400/20 text-zinc-600 dark:text-zinc-300' : r.position === 3 ? 'bg-orange-700/20 text-orange-800 dark:text-orange-300' : 'text-muted'"
            >{{ r.position }}</span>
            <RhValue v-else />
          </td>
          <td :class="cell" class="min-w-24 max-w-0 font-medium text-highlighted sm:min-w-28">
            <div class="flex min-w-0 items-center gap-2">
              <span v-if="seatColors && r.node !== undefined && seatColors[r.node]" class="size-2.5 shrink-0 rounded-full" :style="{ background: seatColors[r.node] }" />
              <!-- practice rows have no pilot: the server names them by channel, so show the seat -->
              <span v-if="!r.pilot_id && r.node !== undefined && r.node !== null" class="truncate">{{ t('Seat') }} {{ r.node + 1 }} <span class="font-normal text-muted">{{ r.callsign }}</span></span>
              <span v-else class="truncate">{{ r.callsign }}</span>
            </div>
          </td>
          <td v-if="team" :class="cell" class="text-muted">
            {{ r.team_name }}
          </td>
          <td v-if="starts" :class="cell" class="text-right text-muted">
            {{ r.starts }}
          </td>
          <template v-if="showRaceTime">
            <td :class="cell" class="text-right font-semibold text-highlighted">
              {{ r.laps }}<span
                v-if="r.behind && kind === 'current'"
                class="ml-1 cursor-help text-xs font-normal text-dimmed"
                :title="`${t('Laps behind the leader')}: ${r.behind}`"
              ><span aria-hidden="true">−{{ r.behind }}</span><span class="sr-only">({{ t('Laps behind the leader') }}: {{ r.behind }})</span></span>
            </td>
            <td :class="[cell, totalClass]" class="text-right">
              <RhValue :value="staggered ? r.total_time_laps : r.total_time" />
            </td>
            <td :class="cell" class="text-right text-muted hidden sm:table-cell">
              <RhValue :value="r.average_lap" />
            </td>
            <td v-if="showAvgSpeed" :class="cell" class="text-right text-muted">
              <RhValue :value="avgSpeed(r)" />
            </td>
          </template>
          <td v-if="showFastest" :class="cell" class="text-right" :title="source(r.fastest_lap_source)">
            <span :class="minLapMs && r.fastest_lap_raw && r.fastest_lap_raw < minLapMs ? 'text-amber-700 dark:text-amber-400' : ''"><RhValue :value="r.fastest_lap" /></span>
          </td>
          <td v-if="showFastest && showSource" :class="cell" class="text-muted hidden md:table-cell">
            {{ source(r.fastest_lap_source) }}
          </td>
          <td v-if="showConsec" :class="[cell, consecClass]" class="text-right" :title="source(r.consecutives_source)">
            <template v-if="r.consecutives && r.consecutives !== '0:00.000'">
              <span class="text-xs text-dimmed">{{ r.consecutives_base }}/</span>{{ r.consecutives }}
            </template>
            <RhValue v-else />
          </td>
          <td v-if="showConsec && showSource" :class="cell" class="text-muted hidden md:table-cell">
            {{ source(r.consecutives_source) }}
          </td>
          <td v-if="showTopSpeed" :class="cell" class="text-right text-muted">
            <RhValue :value="r.top_speed" />
          </td>
          <td v-if="showPoints" :class="cell" class="text-right font-semibold">
            <RhValue :value="r.points" />
          </td>
        </tr>
      </TransitionGroup>
    </table>
    <div v-if="!rows.length" class="py-8 text-center text-sm text-dimmed">
      {{ t('No results yet') }}
    </div>
  </div>
</template>
