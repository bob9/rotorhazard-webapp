<script setup lang="ts">
/** Less-used race settings below the live view: timing, LEDs, sensors and secondary timers. */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()
const S = rh.state

rh.load(['min_lap', 'node_tuning', 'environmental_data', 'cluster_status', 'vrx_list'])
if (info.value?.led_enabled) rh.load(['led_effects'])
watch(() => info.value?.led_enabled, (on) => { if (on) rh.load(['led_effects']) })

const items = computed(() => [
  { label: t('Timing'), icon: 'i-lucide-gauge', slot: 'timing' as const, value: 'timing' },
  ...(info.value?.led_enabled ? [{ label: t('LEDs'), icon: 'i-lucide-lightbulb', slot: 'leds' as const, value: 'leds' }] : []),
  { label: t('Status'), icon: 'i-lucide-activity', slot: 'status' as const, value: 'status' }
])
const tab = ref('timing')
const card = useTemplateRef('card')

// timing
const minLap = computed(() => S.min_lap || {})
const minLapBehaviors = computed(() => [
  { label: t('Highlight short laps'), value: 0 },
  { label: t('Discard new short laps'), value: 1 }
])
const profiles = computed(() => (S.node_tuning?.profile_ids || []).map((id: number, i: number) => ({ value: id, label: S.node_tuning.profile_names[i] })))

// leds
const ledSwatches = ['#ffffff', '#ff0000', '#ff8000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff']
const ledEffect = ref<string>()
const ledColor = ref('#ff8000')
const ledBrightness = ref(128)
function solid(hex: string) {
  const n = parseInt(hex.slice(1), 16)
  rh.emit('LED_solid', { red: (n >> 16) & 255, green: (n >> 8) & 255, blue: n & 255 })
}

// status
const sensors = computed(() => (Array.isArray(S.environmental_data) ? S.environmental_data : []).flatMap((o: any) => Object.entries(o)))
</script>

<template>
  <UCard ref="card" :ui="{ body: 'p-0 sm:p-0' }">
    <!-- phones show icons, with the label visible on the active tab only (sr-only on the rest) -->
    <UTabs v-model="tab" :items="items" variant="link" :unmount-on-hide="false" @update:model-value="revealAfterTabChange(card)" :ui="{ list: 'px-4 border-b border-default overflow-x-auto', trigger: 'flex-none', label: 'max-sm:sr-only max-sm:group-data-[state=active]:not-sr-only', content: 'p-4 sm:p-6' }">
      <template #timing>
        <div class="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          <UFormField id="min-lap" :label="t('Minimum Lap Time')" :hint="t('seconds')">
            <UInputNumber :model-value="minLap.min_lap" :min="0" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_lap', { min_lap: v })" />
          </UFormField>
          <UFormField :label="t('Minimum Lap Behavior')">
            <USelect :model-value="minLap.min_lap_behavior" :items="minLapBehaviors" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_lap_behavior', { min_lap_behavior: v })" />
          </UFormField>
          <UFormField v-if="hasServerFeature('min_first_crossing')" :label="t('Ignore Crossings Before')" :hint="t('seconds')">
            <UInputNumber :model-value="minLap.min_first_crossing" :min="0" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_first_crossing', { min_first_crossing: v })" />
          </UFormField>
          <UFormField :label="t('Tuning Profile')">
            <USelect :model-value="S.node_tuning?.current_profile" :items="profiles" class="w-full" @update:model-value="(v: any) => rh.emit('set_profile', { profile: v })" />
          </UFormField>
        </div>
      </template>

      <template #leds>
        <div class="space-y-5">
          <div class="flex flex-wrap items-center gap-2">
            <UButton color="neutral" variant="soft" icon="i-lucide-power" :label="t('Turn Off')" @click="rh.emit('LED_solid', { off: true })" />
            <button
              v-for="c in ledSwatches"
              :key="c"
              type="button"
              class="size-8 rounded-full ring-1 ring-default transition-transform hover:scale-110"
              :style="{ background: c }"
              :aria-label="c"
              @click="solid(c)"
            />
          </div>
          <UFormField :label="t('Brightness')">
            <USlider v-model="ledBrightness" :min="5" :max="255" class="max-w-md" @update:model-value="(v: any) => rh.emit('LED_brightness', { brightness: v })" />
          </UFormField>
          <div class="flex flex-wrap items-end gap-2">
            <UFormField :label="t('Effect')">
              <USelect v-model="ledEffect" :items="(S.led_effects?.effects || []).map((e: any) => ({ label: e.label, value: e.name }))" class="w-64" />
            </UFormField>
            <UPopover>
              <UButton color="neutral" variant="outline" :label="ledColor">
                <template #leading>
                  <span class="size-4 rounded-full" :style="{ background: ledColor }" />
                </template>
              </UButton>
              <template #content>
                <UColorPicker v-model="ledColor" class="p-2" />
              </template>
            </UPopover>
            <UButton :disabled="!ledEffect" :label="t('Go')" @click="rh.emit('use_led_effect', { effect: ledEffect, color: ledColor })" />
          </div>
        </div>
      </template>

      <template #status>
        <div class="grid gap-6 lg:grid-cols-2">
          <RhGroup :title="t('Environment')">
            <RhRow v-for="[name, readings] in sensors" :key="name" :label="name">
              <div class="flex flex-wrap gap-3 text-sm tabular text-muted">
                <span v-for="(r, k) in (readings as any)" :key="k">{{ k }}: <b class="text-highlighted">{{ r.value }}{{ r.units }}</b></span>
              </div>
            </RhRow>
            <div v-if="!sensors.length" class="px-4 py-3 text-sm text-muted">
              {{ t('No sensors') }}
            </div>
          </RhGroup>
          <RhGroup :title="t('Secondary Timers')">
            <RhRow v-for="s in S.cluster_status?.secondaries || []" :key="s.address" :label="s.address" :description="`${s.modeIndicator} · ${t('latency')} ${s.avgLatencyMs} ms · ${s.availability}%`">
              <UButton size="xs" color="neutral" variant="soft" :label="t('Retry')" @click="rh.emit('retry_secondary', { secondary_id: (S.cluster_status.secondaries).indexOf(s) })" />
            </RhRow>
            <div v-if="!S.cluster_status?.secondaries?.length" class="px-4 py-3 text-sm text-muted">
              {{ t('No secondary timers') }}
            </div>
          </RhGroup>
        </div>
      </template>
    </UTabs>
  </UCard>
</template>
