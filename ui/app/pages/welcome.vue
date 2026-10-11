<script setup lang="ts">
/** First-run setup: language, timer name and the admin login. */
definePageMeta({ layout: false })

const rh = useRH()
const { t } = useI18n()
// before the timer has a name: the greeting alone, without the usual '· timer name'
useHead({ title: computed(() => t('Welcome to RotorHazard')), titleTemplate: null })
const { refresh: refreshAuth } = useAuth()
const { refresh: refreshInfo, info } = useServerInfo()
rh.load(['language', 'all_languages'])

// only for a timer that hasn't been set up: afterwards (for admins and guests alike) this
// screen would offer defaults that overwrite the real name and login, so it opens the app instead
const show = ref(false)
watch(info, (i) => {
  if (!i || show.value) return
  if (i.first_run) show.value = true
  else navigateTo('/', { replace: true })
}, { immediate: true })

const step = ref(0)
const language = ref<string>('')
watch(() => rh.state.language?.language, (l) => { if (l !== undefined) language.value = l || 'en' }, { immediate: true })
const languages = computed(() => [{ label: 'English', value: 'en' }, ...(rh.state.language?.languages || []).map((l: any) => ({ label: l.name, value: l.id }))])
function setLanguage(v: string) {
  language.value = v
  rh.emit('set_language', { language: v === 'en' ? '' : v })
  // the server's language tables are already loaded; apply immediately
  if (rh.state.language) rh.state.language.language = v === 'en' ? '' : v
}

const timerName = ref('RotorHazard')
const username = ref('admin')
const password = ref('')
const confirm = ref('')
const error = ref('')
const busy = ref(false)

async function finish() {
  error.value = ''
  if (!username.value.trim()) return (error.value = t('Enter a username.'))
  if (password.value.length < 4) return (error.value = t('Use a password with at least 4 characters.'))
  if (password.value !== confirm.value) return (error.value = t('The passwords do not match.'))
  busy.value = true
  rh.emit('set_config', { section: 'UI', key: 'timerName', value: timerName.value || 'RotorHazard' })
  rh.emit('set_config', { section: 'SECRETS', key: 'ADMIN_USERNAME', value: username.value.trim() })
  rh.emit('set_config', { section: 'SECRETS', key: 'ADMIN_PASSWORD', value: password.value })
  await new Promise(r => setTimeout(r, 600))
  writeCredentials({ username: username.value.trim(), password: password.value })
  const creds = btoa(unescape(encodeURIComponent(`${username.value.trim()}:${password.value}`)))
  await fetch('/app-first-run-done', { method: 'POST', headers: { Authorization: `Basic ${creds}` } }).catch(() => {})
  rh.reconnect()
  await Promise.all([refreshAuth(), refreshInfo()])
  busy.value = false
  step.value = 2
}

const logoUrl = useRuntimeConfig().app.baseURL + 'rh-icon.svg'
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 grid overflow-y-auto bg-default lg:grid-cols-[1.15fr_1fr]">
    <div class="relative h-56 overflow-hidden bg-neutral-950 sm:h-72 lg:sticky lg:top-0 lg:h-dvh">
      <!-- shown until (or instead of) the generated artwork -->
      <div class="rh-glow absolute inset-0" />
      <img :src="logoUrl" alt="" class="absolute left-1/2 top-1/2 size-28 -translate-x-1/2 -translate-y-1/2 opacity-90 drop-shadow-[0_20px_50px_rgba(254,93,17,0.45)] sm:size-36 lg:size-48">
      <RhArt name="welcome" class="absolute inset-0 size-full object-cover" />
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent lg:bg-gradient-to-r lg:from-transparent lg:via-transparent lg:to-black/20" />
      <div class="absolute bottom-6 left-6 right-6 text-white lg:bottom-10 lg:left-10">
        <div class="font-display text-2xl font-semibold tracking-tight drop-shadow sm:text-3xl">
          RotorHazard
        </div>
        <div class="text-sm text-white/75">
          {{ t('Race timing for FPV drone racing') }}
        </div>
      </div>
    </div>
    <div class="flex items-center justify-center px-4 py-12 sm:px-8">
      <div class="w-full max-w-md">
        <Transition name="rh" mode="out-in">
          <div v-if="step === 0" key="0" class="space-y-8 text-center">
            <img :src="logoUrl" alt="" class="mx-auto size-20 drop-shadow-xl">
            <div class="space-y-3">
              <h1 class="font-display text-4xl font-semibold tracking-tight text-highlighted">
                {{ t('Welcome to RotorHazard') }}
              </h1>
              <p class="text-lg text-muted">
                {{ t('Let\'s set up your timer. It takes less than a minute.') }}
              </p>
            </div>
            <UFormField :label="t('Language')" class="text-left">
              <USelect :model-value="language" :items="languages" size="xl" class="w-full" @update:model-value="setLanguage" />
            </UFormField>
            <UButton size="xl" block :label="t('Continue')" trailing-icon="i-lucide-arrow-right" @click="step = 1" />
          </div>

          <form v-else-if="step === 1" key="1" class="space-y-6" @submit.prevent="finish">
            <div class="space-y-2 text-center">
              <div class="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <UIcon name="i-lucide-shield-check" class="size-7 text-primary" />
              </div>
              <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted">
                {{ t('Secure your timer') }}
              </h1>
              <p class="text-muted">
                {{ t('Spectators can view results without signing in. Running races and changing settings needs this login.') }}
              </p>
            </div>
            <div class="space-y-4 rounded-2xl bg-default p-5 ring-1 ring-default">
              <UFormField :label="t('Timer Name')">
                <UInput v-model="timerName" size="lg" class="w-full" />
              </UFormField>
              <UFormField :label="t('Username')">
                <UInput v-model="username" size="lg" class="w-full" autocomplete="username" />
              </UFormField>
              <UFormField :label="t('Password')">
                <UInput v-model="password" type="password" size="lg" class="w-full" autocomplete="new-password" />
              </UFormField>
              <UFormField :label="t('Confirm Password')" :error="error || undefined">
                <UInput v-model="confirm" type="password" size="lg" class="w-full" autocomplete="new-password" />
              </UFormField>
            </div>
            <div class="flex gap-2">
              <UButton size="xl" color="neutral" variant="ghost" icon="i-lucide-arrow-left" :aria-label="t('Back')" @click="step = 0" />
              <UButton type="submit" size="xl" block :loading="busy" :label="t('Finish Setup')" />
            </div>
          </form>

          <div v-else key="2" class="space-y-8 text-center">
            <div class="mx-auto flex size-20 items-center justify-center rounded-full bg-success/15">
              <UIcon name="i-lucide-check" class="size-10 text-success" />
            </div>
            <div class="space-y-2">
              <h1 class="font-display text-3xl font-semibold tracking-tight text-highlighted">
                {{ t('You\'re all set') }}
              </h1>
              <p class="text-muted">
                {{ info?.timer_name || timerName }} {{ t('is ready. Next, add your pilots and set up heats.') }}
              </p>
            </div>
            <div class="grid gap-2">
              <UButton size="xl" block to="/pilots" icon="i-lucide-users" :label="t('Add Pilots')" />
              <UButton size="xl" block color="neutral" variant="soft" to="/timer" icon="i-lucide-radio-tower" :label="t('Check Frequencies')" />
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>
