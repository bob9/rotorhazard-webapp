<script setup lang="ts">
const rh = useRH()
const cfg = useConfig()
const { t } = useI18n()
const toast = useToast()
const colorMode = useColorMode()

rh.load(['language'])
cfg.load({ UI: ['timerName', 'timerLogo', 'timeFormat', 'timeFormatPhonetic', 'pilotSort', 'classicInterface'], SECRETS: ['ADMIN_USERNAME'] })

const ready = computed(() => cfg.has('UI', 'timerName'))

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]!))
}

// sample lap of 1:23.456, formatted as the server does (RHUtils.format_*_time_to_str)
function sample(format: string, phonetic: boolean) {
  const f = format || (phonetic ? '{m} {s}.{d}' : '{m}:{s}.{d}')
  const parts = phonetic ? { m: '1', s: '23', d: '4' } : { m: '1', s: '23', d: '456' }
  return f.replace(/\{([msd])\}/g, (_, k: 'm' | 's' | 'd') => parts[k])
}

// ---- timer
const timerName = computed(() => ({ name: 'timerName', label: 'Timer Name', value: cfg.get('UI', 'timerName', '') }))
const timerLogo = computed(() => ({
  name: 'timerLogo',
  label: 'Timer Logo',
  value: cfg.get('UI', 'timerLogo', ''),
  placeholder: 'group-logo.png',
  desc: escapeHtml(t('File path relative to <data>/shared/'))
}))
const logoUrl = computed(() => {
  const f = cfg.get<string>('UI', 'timerLogo', '')
  return f ? '/shared/' + f.replace(/^\/+/, '') : ''
})
const logoFailed = ref(false)
watch(logoUrl, () => { logoFailed.value = false })

// ---- language and formats
const NONE = '__en__'
const languageItems = computed(() => [
  { label: 'English', value: NONE },
  ...(rh.state.language?.languages || []).map((l: any) => ({ label: l.name, value: l.id }))
])
const language = computed({
  get: () => rh.state.language?.language || NONE,
  set: (v: string) => {
    rh.emit('set_language', { language: v === NONE ? '' : v })
    // translations are applied on load, as in the classic interface
    setTimeout(() => window.location.reload(), 300)
  }
})

const timeFormat = computed(() => ({
  name: 'timeFormat',
  label: 'Time Format',
  value: cfg.get('UI', 'timeFormat', ''),
  placeholder: '{m}:{s}.{d}',
  desc: `${escapeHtml(t('Example'))}: <span class="tabular font-medium text-default">${escapeHtml(sample(cfg.get('UI', 'timeFormat', ''), false))}</span>`
}))
const phoneticFormat = computed(() => ({
  name: 'timeFormatPhonetic',
  label: 'Phonetic Time Format',
  value: cfg.get('UI', 'timeFormatPhonetic', ''),
  placeholder: '{m} {s}.{d}',
  desc: `${escapeHtml(t('Example'))}: <span class="tabular font-medium text-default">${escapeHtml(sample(cfg.get('UI', 'timeFormatPhonetic', ''), true))}</span>`
}))

const pilotSortItems = computed(() => [
  { label: t('Name'), value: 'name' },
  { label: t('Callsign'), value: 'callsign' },
  { label: t('ID'), value: 'id' }
])
const pilotSort = computed({
  get: () => cfg.get('UI', 'pilotSort', 'name') || 'name',
  set: (v: string) => cfg.set('UI', 'pilotSort', v)
})

// ---- appearance
const appearances = computed(() => [
  { value: 'system', label: t('Automatic'), icon: 'i-lucide-monitor-smartphone' },
  { value: 'light', label: t('Light'), icon: 'i-lucide-sun' },
  { value: 'dark', label: t('Dark'), icon: 'i-lucide-moon' }
])

// ---- admin login
const username = computed(() => ({ name: 'ADMIN_USERNAME', label: 'Username', value: cfg.get('SECRETS', 'ADMIN_USERNAME', '') }))
const passwordField = computed(() => ({
  name: 'ADMIN_PASSWORD',
  label: 'Password',
  field_type: 'password',
  value: '',
  placeholder: t('Enter a new password'),
  desc: escapeHtml(`${t('Default')}: rotorhazard`)
}))
const passwordKey = ref(0)

// Admin events are authorised on the socket handshake, which is replayed after
// a reconnect: keep the stored credentials (and the socket) in step.
let reconnectTimer: ReturnType<typeof setTimeout> | undefined
function storeCredentials(patch: { username?: string, password?: string }) {
  const current = readCredentials()
  writeCredentials({
    username: patch.username ?? current?.username ?? cfg.get('SECRETS', 'ADMIN_USERNAME', ''),
    password: patch.password ?? current?.password ?? ''
  })
  clearTimeout(reconnectTimer)
  reconnectTimer = setTimeout(() => rh.reconnect(), 600)
}

function setUsername(v: string) {
  const value = String(v ?? '').trim()
  if (value === cfg.get('SECRETS', 'ADMIN_USERNAME', '')) return
  cfg.set('SECRETS', 'ADMIN_USERNAME', value)
  storeCredentials({ username: value })
  toast.add({ title: t('Username changed'), icon: 'i-lucide-check-circle', color: 'success' })
}

let lastPassword = { value: '', at: 0 }
function setPassword(v: string) {
  const value = String(v ?? '')
  passwordKey.value++
  // Enter and the following change event both commit the same value
  if (!value || (value === lastPassword.value && Date.now() - lastPassword.at < 2000)) return
  // a browser filling in the saved password is not a change
  if (value === readCredentials()?.password) return
  lastPassword = { value, at: Date.now() }
  cfg.set('SECRETS', 'ADMIN_PASSWORD', value)
  storeCredentials({ password: value })
  toast.add({ title: t('Password changed'), description: t('This device stays signed in.'), icon: 'i-lucide-check-circle', color: 'success' })
}

// blank credentials outside debug mode are reset to the defaults by the server
rh.on('admin_creds_defaulted', (d: any) => {
  cfg.values.SECRETS = { ...(cfg.values.SECRETS || {}), ADMIN_USERNAME: d.username }
  storeCredentials({ username: d.username, password: d.password })
})
</script>

<template>
  <div class="space-y-8">
    <template v-if="ready">
      <RhGroup :title="t('Timer')">
        <RhField :field="timerName" @commit="(v: any) => cfg.set('UI', 'timerName', v)" />
        <RhField :field="timerLogo" @commit="(v: any) => cfg.set('UI', 'timerLogo', v)" />
        <div v-if="logoUrl && !logoFailed" class="flex items-center gap-3 px-4 py-3">
          <div class="flex h-14 min-w-14 items-center justify-center rounded-xl bg-elevated/60 p-2 ring-1 ring-default">
            <img :src="logoUrl" alt="" class="max-h-10 max-w-40 object-contain" @error="logoFailed = true">
          </div>
          <span class="text-[13px] text-muted">{{ t('Logo preview') }}</span>
        </div>
        <RhRow :label="t('Default Interface')" :description="t('What opens at the timer\'s address on devices that have not chosen. Anyone can switch with \'Classic interface\' here or \'New Interface\' in the classic menu, and their device remembers it.')">
          <USelect
            :model-value="cfg.get<boolean>('UI', 'classicInterface', false) === true ? 'classic' : 'app'"
            :items="[{ label: t('New interface'), value: 'app' }, { label: t('Classic interface'), value: 'classic' }]"
            class="w-full sm:w-56"
            @update:model-value="(v: any) => cfg.set('UI', 'classicInterface', v === 'classic')"
          />
        </RhRow>
      </RhGroup>

      <RhGroup id="appearance" :title="t('Appearance')" :footer="t('Appearance applies to this device only.')">
        <div class="grid grid-cols-3 gap-3 p-4">
          <button
            v-for="a in appearances"
            :key="a.value"
            type="button"
            class="group flex flex-col items-center gap-2 rounded-xl p-2 outline-none focus-visible:ring-2 focus-visible:ring-primary"
            :aria-pressed="colorMode.preference === a.value"
            @click="colorMode.preference = a.value"
          >
            <span
              class="relative flex h-16 w-full max-w-28 overflow-hidden rounded-lg ring-1 transition"
              :class="colorMode.preference === a.value ? 'ring-2 ring-primary ring-offset-2 ring-offset-(--ui-bg)' : 'ring-default group-hover:ring-accented'"
            >
              <span v-if="a.value !== 'dark'" class="flex-1 bg-white p-2" :class="a.value === 'system' ? 'max-w-1/2' : ''">
                <span class="block h-1.5 w-3/4 rounded-full bg-zinc-300" />
                <span class="mt-1.5 block h-1.5 w-1/2 rounded-full bg-zinc-200" />
                <span class="mt-2.5 block h-2.5 w-6 rounded-full bg-rh-500" />
              </span>
              <span v-if="a.value !== 'light'" class="flex-1 bg-zinc-900 p-2">
                <span class="block h-1.5 w-3/4 rounded-full bg-zinc-600" />
                <span class="mt-1.5 block h-1.5 w-1/2 rounded-full bg-zinc-700" />
                <span class="mt-2.5 block h-2.5 w-6 rounded-full bg-rh-500" />
              </span>
            </span>
            <span class="flex items-center gap-1.5 text-[13px]" :class="colorMode.preference === a.value ? 'font-semibold text-highlighted' : 'text-muted'">
              <UIcon :name="a.icon" class="size-3.5" />
              {{ a.label }}
            </span>
          </button>
        </div>
      </RhGroup>

      <RhGroup :title="t('Language & Format')">
        <RhRow id="language" :label="t('Language')" :description="t('Changing the language reloads the page.')">
          <USelect v-model="language" :items="languageItems" class="w-full sm:w-64" />
        </RhRow>
        <RhField :field="timeFormat" @commit="(v: any) => cfg.set('UI', 'timeFormat', v)" />
        <RhField :field="phoneticFormat" @commit="(v: any) => cfg.set('UI', 'timeFormatPhonetic', v)" />
        <RhRow :label="t('Pilot Sort')">
          <USelect v-model="pilotSort" :items="pilotSortItems" class="w-full sm:w-64" />
        </RhRow>
        <template #footer>
          {{ t('Time formats use {m} for minutes, {s} for seconds and {d} for decimals.') }}
        </template>
      </RhGroup>

      <RhGroup id="admin-login" :title="t('Admin Login')" :footer="t('Used to sign in to race control and settings. This device is updated automatically when you change them.')">
        <RhField :field="username" @commit="setUsername" />
        <RhField :key="passwordKey" :field="passwordField" @commit="setPassword" />
      </RhGroup>
    </template>

    <div v-else class="space-y-8">
      <USkeleton v-for="i in 3" :key="i" class="h-40 w-full rounded-2xl" />
    </div>
  </div>
</template>
