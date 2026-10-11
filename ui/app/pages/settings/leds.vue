<script setup lang="ts">
/**
 * LED Events: the LED effect shown for each race event (config LED.ledEffects).
 * The `led_effect_setup` load type is answered with `led_effect_setup_data`.
 */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()

interface LedEvent { event: string, label: string, selected: string, effects: { name: string, label: string }[] }
const events = ref<LedEvent[] | null>(null)

rh.on('led_effect_setup_data', (d: any) => { events.value = d?.events || [] })
rh.load(['led_effect_setup'])

const enabled = computed(() => !!(info.value?.led_enabled || info.value?.led_events_enabled))

function items(e: LedEvent) {
  return e.effects
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label))
    .map(x => ({ label: t(x.label), value: x.name }))
}
function selected(e: LedEvent) {
  return e.effects.some(x => x.name === e.selected) ? e.selected : undefined
}
function choose(e: LedEvent, effect: string) {
  e.selected = effect
  rh.emit('set_led_event_effect', { event: e.event, effect })
}
</script>

<template>
  <div class="space-y-8">
    <UEmpty
      v-if="info && !enabled"
      icon="i-lucide-lightbulb-off"
      :title="t('LEDs are not enabled')"
      :description="t('Configure LED hardware in the server settings to use LED effects.')"
    />

    <template v-else>
      <RhGroup>
        <RhRow
          :label="t('LED Control')"
          :description="t('Turn LEDs off, show a color or run an effect from the Race page.')"
          icon="i-lucide-sliders-horizontal"
          to="/"
        />
      </RhGroup>

      <div v-if="events === null" class="space-y-2">
        <USkeleton class="h-5 w-32" />
        <USkeleton class="h-80 w-full rounded-2xl" />
      </div>

      <RhGroup
        v-else-if="events.length"
        :title="t('LED Events')"
        :footer="t('Effects marked with * are recommended for that event.')"
      >
        <RhRow v-for="e in events" :key="e.event" :label="t(e.label)">
          <USelectMenu
            :model-value="selected(e)"
            :items="items(e)"
            value-key="value"
            :placeholder="t('Choose an effect')"
            :search-input="{ placeholder: t('Search') }"
            class="w-full sm:w-72"
            @update:model-value="(v: any) => choose(e, v)"
          />
        </RhRow>
      </RhGroup>

      <UEmpty
        v-else
        icon="i-lucide-lightbulb"
        :title="t('No LED events')"
        :description="t('No LED effects are loaded on this timer.')"
      />
    </template>
  </div>
</template>
