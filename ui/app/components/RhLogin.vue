<script setup lang="ts">
const { t } = useI18n()
const { loginOpen, login } = useAuth()
const { refresh } = useServerInfo()
const username = ref('')
const password = ref('')
const error = ref('')
const busy = ref(false)

async function submit() {
  busy.value = true
  error.value = ''
  const ok = await login(username.value, password.value)
  busy.value = false
  if (ok) {
    loginOpen.value = false
    password.value = ''
    refresh()
  } else {
    error.value = t('Incorrect username or password.')
  }
}
</script>

<template>
  <UModal v-model:open="loginOpen" :ui="{ content: 'max-w-sm divide-y-0 overflow-hidden' }">
    <template #content>
      <div class="relative h-32 overflow-hidden rounded-t-[inherit] bg-neutral-950">
        <RhArt name="signin" class="absolute inset-0 size-full object-cover" />
        <div class="absolute inset-0 bg-gradient-to-t from-(--ui-bg) via-transparent to-transparent" />
      </div>
      <form class="-mt-8 relative space-y-5 p-6 pt-0" @submit.prevent="submit">
        <div class="flex flex-col items-center gap-3 text-center">
          <div class="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
            <UIcon name="i-lucide-lock-keyhole" class="size-7 text-primary" />
          </div>
          <div>
            <h2 class="font-display text-xl font-semibold">
              {{ t('Admin sign in') }}
            </h2>
            <p class="mt-1 text-sm text-muted">
              {{ t('Sign in to run races and change the event.') }}
            </p>
          </div>
        </div>
        <UFormField :label="t('Username')">
          <UInput v-model="username" autocomplete="username" class="w-full" size="lg" autofocus />
        </UFormField>
        <UFormField :label="t('Password')" :error="error || undefined">
          <UInput v-model="password" type="password" autocomplete="current-password" class="w-full" size="lg" />
        </UFormField>
        <UButton type="submit" block size="lg" :loading="busy" :label="t('Sign in')" />
      </form>
    </template>
  </UModal>
</template>
