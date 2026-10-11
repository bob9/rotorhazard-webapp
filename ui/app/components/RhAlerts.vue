<script setup lang="ts">
const { t } = useI18n()
const { alerts } = useMessages()
const current = computed(() => alerts.value[0])
const open = computed({
  get: () => !!current.value,
  set: (v) => { if (!v) alerts.value.shift() }
})
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'max-w-md' }">
    <template #content>
      <div v-if="current" class="space-y-4 p-6 text-center">
        <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-warning/15">
          <UIcon name="i-lucide-triangle-alert" class="size-6 text-warning" />
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div class="rh-prose text-[15px]" v-html="current.message" />
        <UButton block :label="t('OK')" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
