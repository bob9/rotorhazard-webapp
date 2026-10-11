<script setup lang="ts">
/** Speaker button in page headers: race audio on/off and voice volume for this device. */
const { settings, save, unlock, test } = useAudio()
const { t } = useI18n()

const enabled = computed({
  get: () => !!settings.enabled,
  set: (v: boolean) => {
    settings.enabled = v
    save()
    if (v) {
      unlock()
      test()
    }
  }
})
// logarithmic, matching Settings › Audio and the classic interface (0.01–1 → 0–100)
const LOG_MIN = Math.log(0.01)
const volume = computed({
  get: () => Math.max(0, Math.min(100, Math.round((Math.log(Math.max(settings.voice_volume ?? 1, 0.01)) - LOG_MIN) / -LOG_MIN * 100))),
  set: (p: number) => {
    settings.voice_volume = Math.exp(LOG_MIN + (p / 100) * -LOG_MIN)
    save()
  }
})
function preview() {
  unlock()
  test()
}
</script>

<template>
  <UPopover :content="{ align: 'end' }">
    <UButton
      :icon="settings.enabled ? 'i-lucide-volume-2' : 'i-lucide-volume-x'"
      color="neutral"
      variant="ghost"
      :aria-label="t('Race audio')"
    />
    <template #content>
      <div class="w-72 space-y-4 p-4">
        <div class="flex items-center justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-medium text-highlighted">
              {{ t('Race audio') }}
            </div>
            <div class="text-xs text-muted">
              {{ t('Callouts and tones on this device') }}
            </div>
          </div>
          <USwitch v-model="enabled" :aria-label="t('Race audio')" />
        </div>
        <div class="space-y-2" :class="settings.enabled ? '' : 'opacity-50'">
          <div class="flex items-center justify-between text-xs text-muted">
            <span>{{ t('Voice Volume') }}</span>
            <span class="tabular">{{ volume }}%</span>
          </div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-volume-1" class="size-4 shrink-0 text-dimmed" />
            <USlider v-model="volume" :min="0" :max="100" :step="5" :disabled="!settings.enabled" size="sm" @change="preview" />
            <UIcon name="i-lucide-volume-2" class="size-4 shrink-0 text-dimmed" />
          </div>
        </div>
        <div class="border-t border-default pt-3">
          <UButton
            to="/settings/audio"
            color="neutral"
            variant="ghost"
            size="sm"
            block
            trailing-icon="i-lucide-chevron-right"
            :label="t('Audio settings…')"
            class="justify-between"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
