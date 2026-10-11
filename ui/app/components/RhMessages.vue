<script setup lang="ts">
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const { messages, unread } = useMessages()
watch(open, (o) => { if (o) unread.value = 0 })
function dismiss(id: number) {
  messages.value = messages.value.filter(m => m.id !== id)
}
</script>

<template>
  <USlideover v-model:open="open" :title="t('Messages')">
    <template #body>
      <UEmpty v-if="!messages.length" icon="i-lucide-bell-off" :title="t('No messages')" :description="t('Notices from the timer and plugins appear here.')" />
      <TransitionGroup v-else tag="ul" name="rh" class="space-y-2">
        <li v-for="m in messages" :key="m.id" class="group flex gap-3 rounded-xl bg-elevated/60 p-3">
          <UIcon :name="m.interrupt ? 'i-lucide-triangle-alert' : 'i-lucide-bell'" class="mt-0.5 size-4 shrink-0" :class="m.interrupt ? 'text-warning' : 'text-muted'" />
          <div class="min-w-0 flex-1">
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div class="rh-prose text-sm" v-html="m.message" />
            <div class="mt-1 text-xs text-dimmed">
              {{ m.time.toLocaleTimeString() }}
            </div>
          </div>
          <UButton icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="t('Dismiss')" @click="dismiss(m.id)" />
        </li>
      </TransitionGroup>
    </template>
    <template v-if="messages.length" #footer>
      <UButton block color="neutral" variant="soft" :label="t('Dismiss All')" @click="messages = []" />
    </template>
  </USlideover>
</template>
