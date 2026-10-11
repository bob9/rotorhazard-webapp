<script setup lang="ts">
defineProps<{ collapsed?: boolean }>()
const rh = useRH()
const { t } = useI18n()
const label = computed(() => rh.status.connected ? t('Connected') : rh.status.everConnected ? t('Reconnecting…') : t('Connecting…'))
</script>

<template>
  <UTooltip :text="label" :disabled="!collapsed">
    <div class="flex items-center gap-2 px-2.5 py-1.5 text-xs text-muted">
      <span class="relative flex size-2">
        <span v-if="rh.status.connected" class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40" style="animation-duration: 2.5s" />
        <span class="relative inline-flex size-2 rounded-full" :class="rh.status.connected ? 'bg-success' : 'bg-warning'" />
      </span>
      <span v-if="!collapsed">{{ label }}</span>
    </div>
  </UTooltip>
</template>
