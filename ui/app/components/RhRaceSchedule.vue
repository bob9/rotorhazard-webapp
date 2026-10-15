<script setup lang="ts">
/**
 * Schedule the race to start after a delay (pilots hear the countdown), next to Start Race;
 * while a start is scheduled, the same place cancels it. `iconOnly` for the phone action bar.
 */
defineProps<{ iconOnly?: boolean, size?: 'sm' | 'md' }>()
const rh = useRH()
const { t } = useI18n()
const { clock } = useRaceClock()

const open = ref(false)
const minutes = ref(0)
const seconds = ref(10)
try {
  minutes.value = JSON.parse(localStorage.getItem('rotorhazard.schedule_m') || '0')
  seconds.value = JSON.parse(localStorage.getItem('rotorhazard.schedule_s') || '10')
} catch { /* storage unavailable */ }
const scheduled = computed(() => clock.phase === 'scheduled')
const presets = [10, 30, 60, 120]
const presetLabel = (s: number) => (s < 60 ? `${s}s` : `${s / 60}m`)

function schedule(m: number, s: number) {
  if (!m && !s) return
  minutes.value = m
  seconds.value = s
  try {
    localStorage.setItem('rotorhazard.schedule_m', JSON.stringify(m))
    localStorage.setItem('rotorhazard.schedule_s', JSON.stringify(s))
  } catch { /* storage unavailable */ }
  rh.emit('schedule_race', { m: Number(m), s: Number(s) })
  open.value = false
}
</script>

<template>
  <UButton
    v-if="scheduled"
    color="neutral"
    variant="ghost"
    :size="size"
    icon="i-lucide-alarm-clock-off"
    :label="iconOnly ? undefined : t('Cancel Start')"
    :aria-label="t('Cancel Start')"
    @click="rh.emit('cancel_schedule_race')"
  />
  <UPopover v-else v-model:open="open" :content="{ align: 'end' }">
    <UButton
      color="neutral"
      variant="ghost"
      :size="size"
      icon="i-lucide-alarm-clock"
      :label="iconOnly ? undefined : t('Schedule')"
      :aria-label="t('Schedule Race')"
    />
    <template #content>
      <div class="w-72 space-y-4 p-4">
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            {{ t('Start the race in') }}
          </h3>
          <p class="mt-0.5 text-xs text-muted">
            {{ t('The race starts automatically after this delay. Pilots hear the countdown.') }}
          </p>
        </div>
        <div class="grid grid-cols-4 gap-2">
          <UButton
            v-for="p in presets"
            :key="p"
            color="neutral"
            variant="soft"
            block
            :label="presetLabel(p)"
            @click="schedule(Math.floor(p / 60), p % 60)"
          />
        </div>
        <div class="flex items-end gap-2">
          <UFormField :label="t('Minutes')" class="flex-1">
            <UInputNumber v-model="minutes" :min="0" size="sm" class="w-full" />
          </UFormField>
          <UFormField :label="t('Seconds')" class="flex-1">
            <UInputNumber v-model="seconds" :min="0" :max="59" size="sm" class="w-full" />
          </UFormField>
        </div>
        <UButton block icon="i-lucide-alarm-clock" :label="t('Schedule Race')" :disabled="!minutes && !seconds" @click="schedule(minutes, seconds)" />
      </div>
    </template>
  </UPopover>
</template>
