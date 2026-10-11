<script setup lang="ts">
/** Live tuning of one node: RSSI graph, EnterAt / ExitAt, capture, stats. */
const props = defineProps<{ node: number }>()
const rh = useRH()
const { t } = useI18n()
rh.load(['node_data', 'enter_and_exit_at_levels', 'frequency_data', 'current_heat'])

const S = rh.state
const enterAt = ref<number>(S.enter_and_exit_at_levels?.enter_at_levels?.[props.node] ?? 0)
const exitAt = ref<number>(S.enter_and_exit_at_levels?.exit_at_levels?.[props.node] ?? 0)
watch(() => S.enter_and_exit_at_levels, (d) => {
  if (!d) return
  enterAt.value = d.enter_at_levels?.[props.node] ?? enterAt.value
  exitAt.value = d.exit_at_levels?.[props.node] ?? exitAt.value
}, { deep: true })
rh.on('node_enter_at_level', (d: any) => { if (d.node_index === props.node) enterAt.value = d.level })
rh.on('node_exit_at_level', (d: any) => { if (d.node_index === props.node) exitAt.value = d.level })

const paused = ref(false)
const color = computed(() => colorHex(S.current_heat?.heatNodes?.[props.node]?.activeColor, '#fe5d11'))
const nd = computed(() => S.node_data || {})
const stat = (k: string) => nd.value[k]?.[props.node] ?? 0
const rssi = computed(() => S.heartbeat?.current_rssi?.[props.node] ?? 0)

function commit() {
  rh.emit('set_enter_at_level', { node: props.node, enter_at_level: Number(enterAt.value) })
  rh.emit('set_exit_at_level', { node: props.node, exit_at_level: Number(exitAt.value) })
}
function capture(which: 'enter' | 'exit') {
  rh.emit(which === 'enter' ? 'cap_enter_at_btn' : 'cap_exit_at_btn', { node_index: props.node })
}

const warnings = computed(() => {
  const w: string[] = []
  const peak = stat('node_peak_rssi')
  const nadir = stat('node_nadir_rssi')
  const passNadir = stat('pass_nadir_rssi')
  if (peak - nadir > 20 && enterAt.value > peak - 5) w.push(t('EnterAt is close to or above the highest signal seen; laps may be missed.'))
  if (nadir && exitAt.value <= nadir) w.push(t('ExitAt is at or below the lowest signal seen; passes may never end.'))
  if (enterAt.value < exitAt.value + 10) w.push(t('EnterAt should be at least 10 above ExitAt.'))
  if (passNadir && exitAt.value > passNadir - 5) w.push(t('ExitAt is close to the lowest signal during a pass.'))
  return w
})
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-center justify-between">
      <div>
        <div class="text-xs uppercase tracking-wider text-dimmed">
          {{ t('Signal') }}
        </div>
        <div class="font-display tabular text-3xl font-semibold">
          {{ rssi }}
        </div>
      </div>
      <UButton
        :icon="paused ? 'i-lucide-play' : 'i-lucide-pause'"
        color="neutral"
        variant="soft"
        :label="paused ? t('Resume') : t('Pause')"
        @click="paused = !paused"
      />
    </div>

    <RhRssiGraph
      v-model:enter-at="enterAt"
      v-model:exit-at="exitAt"
      :node="node"
      :color="color"
      :paused="paused"
      editable
      :height="240"
      @commit="commit"
    />
    <p class="text-xs text-muted">
      {{ t('Drag the lines on the graph, or set the values below. Passes start when the signal rises above EnterAt and end when it falls below ExitAt.') }}
    </p>

    <div class="grid grid-cols-2 gap-3">
      <UFormField :label="t('EnterAt')">
        <UFieldGroup class="w-full">
          <UInputNumber v-model="enterAt" :min="0" :max="255" class="flex-1" @change="commit" />
          <UButton color="neutral" variant="outline" icon="i-lucide-crosshair" :aria-label="t('Capture')" @click="capture('enter')" />
        </UFieldGroup>
      </UFormField>
      <UFormField :label="t('ExitAt')">
        <UFieldGroup class="w-full">
          <UInputNumber v-model="exitAt" :min="0" :max="255" class="flex-1" @change="commit" />
          <UButton color="neutral" variant="outline" icon="i-lucide-crosshair" :aria-label="t('Capture')" @click="capture('exit')" />
        </UFieldGroup>
      </UFormField>
    </div>

    <div v-if="warnings.length" class="space-y-2">
      <UAlert v-for="w in warnings" :key="w" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :description="w" />
    </div>

    <dl class="grid grid-cols-3 gap-px overflow-hidden rounded-xl bg-(--ui-border) ring-1 ring-default">
      <div v-for="[k, label] in [['node_peak_rssi', 'Peak'], ['node_nadir_rssi', 'Nadir'], ['debug_pass_count', 'Passes'], ['pass_peak_rssi', 'Pass Peak'], ['pass_nadir_rssi', 'Pass Nadir']]" :key="k" class="bg-default px-3 py-2">
        <dt class="text-[11px] uppercase tracking-wider text-dimmed">
          {{ t(label as string) }}
        </dt>
        <dd class="tabular text-lg font-semibold">
          {{ stat(k as string) }}
        </dd>
      </div>
    </dl>
  </div>
</template>
