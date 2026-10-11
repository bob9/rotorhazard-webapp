<script setup lang="ts">
/** Navbar button for timer and plugin messages, with the unread count; shown once there are any. */
const { messages, unread } = useMessages()
const open = useState('rh.messagesOpen', () => false)
const { t } = useI18n()
</script>

<template>
  <UChip v-if="messages.length || unread" :text="unread > 99 ? '99+' : unread" :show="unread > 0" color="error" size="3xl" inset>
    <UButton
      icon="i-lucide-bell"
      color="neutral"
      variant="ghost"
      :aria-label="unread ? `${t('Messages')} (${unread})` : t('Messages')"
      @click="open = true"
    />
  </UChip>
</template>
