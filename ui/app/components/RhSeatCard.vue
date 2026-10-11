<script setup lang="ts">
/** Live view of one timer seat: pilot, channel, signal, laps. */
const props = withDefaults(defineProps<{
  seat: number
  node?: { callsign?: string | null, pilot_id?: number | null, activeColor?: number | string | null } | null
  freq?: { band?: string | null, channel?: number | null, frequency?: number } | null
  laps?: any[]
  fastestIndex?: number | null
  row?: any
  rssi?: number
  enterAt?: number
  exitAt?: number
  crossing?: boolean
  racing?: boolean
  admin?: boolean
  finished?: boolean
  minLapMs?: number
  stopped?: boolean
  /** show the signal (RSSI) meter; off on the spectator view */
  showSignal?: boolean
  /** name, laps, last and fastest only (presentation mode): no lap list, same height all race */
  compact?: boolean
}>(), { showSignal: true })
const emit = defineEmits<{ manualLap: [], deleteLap: [number], restoreLap: [number], tune: [] }>()
const { t } = useI18n()

const color = computed(() => colorHex(props.node?.activeColor ?? null))
// a seat without a pilot (practice, an empty seat) is named by its number, as on the
// leaderboard ("Seat 1"), with its channel on the line below
const practiceSeat = computed(() => !props.node?.pilot_id)
const disabled = computed(() => !props.freq?.frequency)

const visibleLaps = computed(() => [...(props.laps || [])].reverse())
// the server zeroes a deleted lap's time; show what it was: its crossing less the lap before it
function lapTimeText(lap: any) {
  if (!lap.deleted || !lap.lap_time_stamp) return lap.lap_time_formatted
  const laps = props.laps || []
  const prev = laps.slice(0, laps.indexOf(lap)).filter(l => !l.deleted).pop()
  return formatLapMs(lap.lap_time_stamp - (prev?.lap_time_stamp || 0))
}
// on phones the Last/Fastest grid and lap list collapse into a one-line summary
const expanded = ref(false)
const lapCount = computed(() => props.row?.laps ?? (props.laps || []).filter(l => !l.deleted && l.lap_number > 0).length)

// signal meter scaled to the node's enter level with headroom
const scaleMax = computed(() => Math.max((props.enterAt || 100) * 1.35, (props.rssi || 0) + 5, 60))
const pct = (v?: number) => `${Math.min(100, Math.max(0, ((v || 0) / scaleMax.value) * 100))}%`
</script>

<template>
  <div
    class="group relative flex flex-col overflow-hidden rounded-2xl bg-default ring-1 ring-default shadow-xs transition-shadow"
    :class="[crossing && racing ? 'shadow-lg' : '', disabled ? 'opacity-60' : '']"
    :style="crossing ? { boxShadow: `0 0 0 2px ${color}, 0 10px 30px -10px ${color}` } : undefined"
  >
    <div class="h-1 w-full" :style="{ background: color }" />
    <div class="flex items-start gap-3 p-4 pb-3">
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="truncate text-lg font-semibold text-highlighted">
            {{ practiceSeat ? `${t('Seat')} ${seat + 1}` : node?.callsign }}
          </span>
          <UBadge v-if="row?.position && lapCount" :label="`P${row.position}`" size="sm" variant="subtle" color="neutral" class="tabular" />
          <UBadge v-if="finished" :label="t('Done')" size="sm" variant="subtle" color="success" />
        </div>
        <div class="mt-0.5 flex items-center gap-1.5 text-[13px] text-muted">
          <span class="size-2 shrink-0 rounded-full" :style="{ background: color }" />
          <span v-if="!practiceSeat" class="font-medium text-default">{{ t('Seat') }} {{ seat + 1 }}</span>
          <template v-if="freq?.frequency">
            <span v-if="!practiceSeat">·</span>
            <UTooltip v-if="admin" :text="t('Change frequency')">
              <NuxtLink to="/timer" class="truncate underline-offset-2 hover:text-default hover:underline">{{ channelLabel(freq) }} {{ freq.band ? freq.frequency : '' }}</NuxtLink>
            </UTooltip>
            <span v-else class="truncate">{{ channelLabel(freq) }} {{ freq.band ? freq.frequency : '' }}</span>
          </template>
          <span v-else>· {{ t('Disabled') }}</span>
        </div>
      </div>
      <div class="text-right">
        <div class="font-display tabular text-3xl font-semibold leading-none text-highlighted">
          {{ lapCount }}
        </div>
        <div class="mt-1 text-[11px] font-medium uppercase tracking-wider text-dimmed">
          {{ t('Laps') }}
        </div>
      </div>
    </div>

    <!-- signal -->
    <button
      v-if="showSignal"
      type="button"
      class="mx-4 mb-3 block cursor-pointer text-left"
      :aria-label="stopped ? t('Edit laps') : t('Tuning')"
      :disabled="!admin"
      @click="emit('tune')"
    >
      <div class="relative h-2 overflow-hidden rounded-full bg-accented/70">
        <div
          class="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
          :style="{ width: pct(rssi), background: crossing ? color : 'var(--ui-text-dimmed)' }"
        />
        <div v-if="exitAt" class="absolute inset-y-0 w-px bg-warning/80" :style="{ left: pct(exitAt) }" />
        <div v-if="enterAt" class="absolute inset-y-0 w-px bg-error/80" :style="{ left: pct(enterAt) }" />
      </div>
      <div class="mt-1 flex justify-between text-[11px] text-dimmed tabular">
        <span>{{ crossing ? t('Crossing') : t('Signal') }} {{ rssi ?? 0 }}</span>
        <span v-if="admin" class="transition-opacity" :class="stopped ? 'text-primary' : 'opacity-0 group-hover:opacity-100'">{{ stopped ? t('Edit laps') : t('Tune') }} →</span>
      </div>
    </button>

    <!-- phone summary: last / fastest on one line, expands to the full detail -->
    <button
      v-if="!compact"
      type="button"
      class="flex items-center gap-3 border-t border-default px-4 py-2.5 text-left text-[13px] sm:hidden"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <span class="text-dimmed">{{ t('Last') }}</span>
      <span class="tabular font-medium text-highlighted"><RhValue :value="row?.last_lap" /></span>
      <span class="text-dimmed">{{ t('Fastest') }}</span>
      <span class="tabular font-medium text-highlighted"><RhValue :value="row?.fastest_lap" /></span>
      <UIcon name="i-lucide-chevron-down" class="ms-auto size-4 text-dimmed transition-transform" :class="expanded ? 'rotate-180' : ''" />
    </button>

    <div class="grid-cols-2 gap-px border-t border-default bg-(--ui-border)" :class="expanded || compact ? 'grid' : 'hidden sm:grid'">
      <div class="bg-default px-4 py-2">
        <div class="text-[11px] uppercase tracking-wider text-dimmed">
          {{ t('Last') }}
        </div>
        <div class="tabular text-[15px] font-medium text-highlighted">
          <RhValue :value="row?.last_lap" />
        </div>
      </div>
      <div class="bg-default px-4 py-2">
        <div class="text-[11px] uppercase tracking-wider text-dimmed">
          {{ t('Fastest') }}
        </div>
        <div class="tabular text-[15px] font-medium text-highlighted">
          <RhValue :value="row?.fastest_lap" />
        </div>
      </div>
    </div>

    <div v-if="!compact" class="max-h-48 min-h-12 flex-1 overflow-y-auto border-t border-default" :class="expanded ? '' : 'max-sm:hidden'">
      <TransitionGroup tag="ul" name="rh" class="divide-y divide-default/60">
        <li
          v-for="lap in visibleLaps"
          :key="lap.lap_index"
          class="group/lap flex items-center gap-3 px-4 py-1.5 text-sm"
          :class="lap.deleted || lap.late_lap ? 'text-dimmed' : ''"
        >
          <span class="w-8 tabular text-xs text-dimmed">{{ lap.lap_number === 0 ? 'HS' : lap.lap_number > 0 ? lap.lap_number : '—' }}</span>
          <span
            class="flex-1 tabular"
            :class="[
              lap.deleted ? 'line-through' : '',
              !lap.deleted && lap.lap_index === fastestIndex ? 'font-semibold text-success' : '',
              !lap.deleted && minLapMs && lap.lap_number > 0 && lap.lap_time < minLapMs ? 'text-amber-700 dark:text-amber-400' : ''
            ]"
          >{{ lapTimeText(lap) }}</span>
          <UIcon v-if="lap.source === 1" name="i-lucide-hand" class="size-3.5 text-dimmed" :title="t('Manual')" />
          <template v-if="admin">
            <UButton
              v-if="!lap.deleted"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              class="opacity-0 group-hover/lap:opacity-100 focus:opacity-100"
              :aria-label="t('Delete lap')"
              @click="emit('deleteLap', lap.lap_index)"
            />
            <UButton
              v-else
              icon="i-lucide-undo-2"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="t('Restore lap')"
              @click="emit('restoreLap', lap.lap_index)"
            />
          </template>
        </li>
      </TransitionGroup>
      <div v-if="!visibleLaps.length" class="px-4 py-3 text-center text-xs text-dimmed">
        {{ t('No laps yet') }}
      </div>
    </div>

    <div v-if="admin && racing" class="border-t border-default p-2">
      <UButton block color="neutral" variant="soft" icon="i-lucide-plus" :label="t('Lap')" :disabled="disabled" @click="emit('manualLap')" />
    </div>
  </div>
</template>
