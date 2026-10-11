<script setup lang="ts">
/** Secondary race-control tools below the live view. */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()
const { panelsFor } = usePluginUI()
const S = rh.state

rh.load(['min_lap', 'node_tuning', 'callouts', 'environmental_data', 'cluster_status', 'vrx_list', { type: 'ui', value: 'run' }])
if (info.value?.led_enabled) rh.load(['led_effects'])
watch(() => info.value?.led_enabled, (on) => { if (on) rh.load(['led_effects']) })

const items = computed(() => [
  { label: t('Timing'), icon: 'i-lucide-gauge', slot: 'timing' as const, value: 'timing' },
  { label: t('Schedule'), icon: 'i-lucide-alarm-clock', slot: 'schedule' as const, value: 'schedule' },
  { label: t('Announce'), icon: 'i-lucide-megaphone', slot: 'announce' as const, value: 'announce' },
  ...(info.value?.led_enabled ? [{ label: t('LEDs'), icon: 'i-lucide-lightbulb', slot: 'leds' as const, value: 'leds' }] : []),
  ...(panelsFor('run').length ? [{ label: t('Plugins'), icon: 'i-lucide-puzzle', slot: 'plugins' as const, value: 'plugins' }] : []),
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

// schedule
const schedM = ref(0)
const schedS = ref(10)
try {
  schedM.value = JSON.parse(localStorage.getItem('rotorhazard.schedule_m') || '0')
  schedS.value = JSON.parse(localStorage.getItem('rotorhazard.schedule_s') || '10')
} catch { /* ignore */ }
const scheduled = ref(false)
rh.on('race_scheduled', (d: any) => { scheduled.value = !!d?.scheduled })
function schedule() {
  try {
    localStorage.setItem('rotorhazard.schedule_m', JSON.stringify(schedM.value))
    localStorage.setItem('rotorhazard.schedule_s', JSON.stringify(schedS.value))
  } catch { /* ignore */ }
  if (schedM.value || schedS.value) rh.emit('schedule_race', { m: Number(schedM.value), s: Number(schedS.value) })
}

// callouts & messages
const callouts = ref<string[]>([])
watch(() => S.callouts, (c) => { if (Array.isArray(c)) callouts.value = [...c] }, { immediate: true })
function saveCallouts() {
  rh.emit('save_callouts', { callouts: callouts.value.filter(c => c.trim()) })
}
function removeCallout(i: number) {
  callouts.value.splice(i, 1)
  saveCallouts()
}
const message = ref('')
const interrupt = ref(false)
function sendMessage() {
  if (!message.value.trim()) return
  rh.emit('broadcast_message', { message: message.value, interrupt: interrupt.value })
  message.value = ''
}
function onKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.altKey && /^[1-9]$/.test(e.key)) {
    const c = callouts.value[Number(e.key) - 1]
    if (c) rh.emit('play_callout_text', { callout: c })
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

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
    <!-- tabs stay mounted so plugin panels (and the scripts some of them load) run without opening their tab -->
    <UTabs v-model="tab" :items="items" variant="link" :unmount-on-hide="false" @update:model-value="revealAfterTabChange(card)" :ui="{ list: 'px-4 border-b border-default overflow-x-auto', trigger: 'flex-none', label: 'max-sm:sr-only max-sm:group-data-[state=active]:not-sr-only', content: 'p-4 sm:p-6' }">
      <template #timing>
        <div class="grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
          <UFormField id="min-lap" :label="t('Minimum Lap Time')" :hint="t('seconds')">
            <UInputNumber :model-value="minLap.min_lap" :min="0" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_lap', { min_lap: v })" />
          </UFormField>
          <UFormField :label="t('Minimum Lap Behavior')">
            <USelect :model-value="minLap.min_lap_behavior" :items="minLapBehaviors" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_lap_behavior', { min_lap_behavior: v })" />
          </UFormField>
          <UFormField :label="t('Ignore Crossings Before')" :hint="t('seconds')">
            <UInputNumber :model-value="minLap.min_first_crossing" :min="0" class="w-full" @update:model-value="(v: any) => rh.emit('set_min_first_crossing', { min_first_crossing: v })" />
          </UFormField>
          <UFormField :label="t('Tuning Profile')">
            <USelect :model-value="S.node_tuning?.current_profile" :items="profiles" class="w-full" @update:model-value="(v: any) => rh.emit('set_profile', { profile: v })" />
          </UFormField>
        </div>
      </template>

      <template #schedule>
        <div class="flex flex-wrap items-end gap-3">
          <UFormField :label="t('Minutes')">
            <UInputNumber v-model="schedM" :min="0" class="w-28" />
          </UFormField>
          <UFormField :label="t('Seconds')">
            <UInputNumber v-model="schedS" :min="0" :max="59" class="w-28" />
          </UFormField>
          <UButton icon="i-lucide-alarm-clock" :label="t('Schedule Race')" @click="schedule" />
          <UButton v-if="scheduled" color="neutral" variant="soft" :label="t('Cancel')" @click="rh.emit('cancel_schedule_race')" />
        </div>
        <p class="mt-3 text-sm text-muted">
          {{ t('The race starts automatically after this delay. Pilots hear the countdown.') }}
        </p>
      </template>

      <template #announce>
        <div class="grid gap-8 lg:grid-cols-2">
          <div class="space-y-3">
            <div class="flex items-center justify-between">
              <h3 class="font-medium">
                {{ t('Callouts') }}
              </h3>
              <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-plus" :label="t('Add Callout')" @click="callouts.push('')" />
            </div>
            <div v-for="(c, i) in callouts" :key="i" class="flex items-center gap-2">
              <UInput v-model="callouts[i]" class="flex-1" :placeholder="t('Callout text')" @change="saveCallouts" @keydown.enter="rh.emit('play_callout_text', { callout: callouts[i] })">
                <template v-if="i < 9" #trailing>
                  <UKbd :value="`⌃⌥${i + 1}`" size="sm" />
                </template>
              </UInput>
              <UButton icon="i-lucide-play" color="neutral" variant="soft" :aria-label="t('Play')" @click="rh.emit('play_callout_text', { callout: c })" />
              <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="t('Delete')" @click="removeCallout(i)" />
            </div>
            <p class="text-xs text-muted">
              {{ t('Use %HEAT%, %PILOTS%, %LINEUP% and %FREQS% to insert details of the current heat.') }}
            </p>
          </div>
          <div class="space-y-3">
            <h3 class="font-medium">
              {{ t('Send Message') }}
            </h3>
            <UTextarea v-model="message" :maxlength="256" :rows="3" class="w-full" :placeholder="t('Message to all displays')" />
            <div class="flex items-center justify-between">
              <USwitch v-model="interrupt" :label="info?.vrx_enabled ? t('Pop-up alert and send to VRx') : t('Pop-up alert')" />
              <UButton icon="i-lucide-send" :label="t('Send')" :disabled="!message.trim()" @click="sendMessage" />
            </div>
          </div>
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

      <template #plugins>
        <RhPluginPanels page="run" />
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
