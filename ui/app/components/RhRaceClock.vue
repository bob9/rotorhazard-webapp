<script setup lang="ts">
/** `sm` is a single-line clock for compact bars (phone action bar). `hold` keeps showing the
 * clock as it was when the hold began (the Race page while a finished race is being saved). */
const props = defineProps<{ size?: 'xl' | 'lg' | 'md' | 'sm', hold?: boolean }>()
const { clock: liveClock } = useRaceClock()
const held = ref<{ phase: string, display: string } | null>(null)
watch(() => props.hold, (h) => { held.value = h ? { phase: liveClock.phase, display: liveClock.display } : null }, { immediate: true })
const clock = computed(() => held.value ?? liveClock)
const { t } = useI18n()

const label = computed(() => ({
  idle: t('Ready'),
  scheduled: t('Starts in'),
  prestage: t('Get ready'),
  staging: t('Staging'),
  racing: t('Racing'),
  overtime: t('Overtime'),
  finished: t('Finished')
} as Record<string, string>)[clock.value.phase])

const tone = computed(() => ({
  idle: 'text-highlighted',
  scheduled: 'text-info',
  prestage: 'text-warning',
  staging: 'text-warning',
  racing: 'text-highlighted',
  overtime: 'text-error',
  finished: 'text-muted'
} as Record<string, string>)[clock.value.phase])
</script>

<template>
  <div v-if="size === 'sm'" class="flex min-w-0 flex-col">
    <div class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em]" :class="tone">
      <span
        class="size-1.5 rounded-full"
        :class="{
          'bg-success animate-pulse': clock.phase === 'racing',
          'bg-warning animate-pulse': clock.phase === 'staging' || clock.phase === 'prestage',
          'bg-error animate-pulse': clock.phase === 'overtime',
          'bg-info': clock.phase === 'scheduled',
          'bg-(--ui-text-dimmed)': clock.phase === 'idle' || clock.phase === 'finished'
        }"
      />
      {{ label }}
    </div>
    <div class="font-display tabular text-2xl font-semibold leading-tight tracking-tight" :class="tone">
      {{ clock.display || '—' }}
    </div>
  </div>
  <div v-else class="flex flex-col items-center">
    <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]" :class="tone">
      <span
        class="size-2 rounded-full"
        :class="{
          'bg-success animate-pulse': clock.phase === 'racing',
          'bg-warning animate-pulse': clock.phase === 'staging' || clock.phase === 'prestage',
          'bg-error animate-pulse': clock.phase === 'overtime',
          'bg-info': clock.phase === 'scheduled',
          'bg-(--ui-text-dimmed)': clock.phase === 'idle' || clock.phase === 'finished'
        }"
      />
      {{ label }}
    </div>
    <div
      class="font-display tabular font-semibold leading-none tracking-tight transition-colors"
      :class="[tone, size === 'md' ? 'text-5xl mt-2' : size === 'lg' ? 'text-6xl mt-2' : 'text-7xl sm:text-8xl mt-3']"
    >
      <template v-if="clock.display">
        {{ clock.display }}
      </template>
      <span v-else class="animate-pulse">{{ t('Ready') }}…</span>
    </div>
  </div>
</template>
