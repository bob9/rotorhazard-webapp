<script setup lang="ts">
const rh = useRH()
const cfg = useConfig()
const { t } = useI18n()
const toast = useToast()
const { info } = useServerInfo()
const audio = useAudio()
const s = audio.settings

rh.load(['language'])
cfg.load({ UI: ['timerName'] })

const cluster = computed(() => !!info.value?.cluster_has_secondaries)

function persist() {
  audio.save()
}

// ---- voices (the list loads asynchronously in most browsers)
const voiceList = ref<SpeechSynthesisVoice[]>([])
const speechAvailable = ref(true)
function refreshVoices() {
  voiceList.value = audio.voices()
}
onMounted(() => {
  speechAvailable.value = typeof speechSynthesis !== 'undefined'
  refreshVoices()
  if (speechAvailable.value) speechSynthesis.addEventListener('voiceschanged', refreshVoices)
})
onBeforeUnmount(() => {
  if (speechAvailable.value) speechSynthesis.removeEventListener('voiceschanged', refreshVoices)
})

const voiceItems = computed(() => voiceList.value.map(v => ({ label: v.name, value: v.name, description: v.lang })))
const defaultVoice = computed(() => (voiceList.value.find(v => /english/i.test(v.name)) || voiceList.value[0])?.name)
const voice = computed({
  get: () => voiceList.value.some(v => v.name === s.voice_language) ? s.voice_language : defaultVoice.value,
  set: (v: string | undefined) => {
    s.voice_language = v || ''
    persist()
    preview()
  }
})

const ENGLISH = '__en__'
const voiceLanguageItems = computed(() => [
  { label: t('(Match Timer Language)'), value: 'match-timer' },
  { label: 'English', value: ENGLISH },
  ...(rh.state.language?.languages || []).map((l: any) => ({ label: l.name, value: l.id }))
])
const voiceLanguage = computed({
  get: () => s.voice_string_language === '' ? ENGLISH : (s.voice_string_language || 'match-timer'),
  set: (v: string) => {
    s.voice_string_language = v === ENGLISH ? '' : v
    persist()
  }
})

// ---- preview
const testText = ref('')
watch(() => cfg.get<string>('UI', 'timerName', ''), (v) => { if (!testText.value) testText.value = v || 'RotorHazard' }, { immediate: true })

/** speaks even while race audio is switched off, so settings can be tried out */
function say(text: string) {
  if (!text.trim()) return
  audio.unlock()
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  const enabled = s.enabled
  s.enabled = true
  audio.speak(text, true)
  s.enabled = enabled
}
function preview() {
  say(testText.value || 'RotorHazard')
}

// ---- volume sliders: logarithmic, as in the classic interface (0.01–1 → 0–100)
const LOG_MIN = Math.log(0.01)
const toPos = (v: number) => Math.max(0, Math.min(100, Math.round((Math.log(Math.max(v, 0.01)) - LOG_MIN) / -LOG_MIN * 100)))
const toVal = (p: number) => Math.exp(LOG_MIN + (p / 100) * -LOG_MIN)
type VolumeKey = 'voice_volume' | 'tone_volume' | 'indicator_beep_volume'
function volume(key: VolumeKey) {
  return computed({
    get: () => toPos(s[key]),
    set: (p: number) => { s[key] = toVal(p) }
  })
}
const voiceVolume = volume('voice_volume')
const toneVolume = volume('tone_volume')
const beepVolume = volume('indicator_beep_volume')

function previewTone() {
  persist()
  audio.unlock()
  audio.playTone(100, 440, s.tone_volume)
  setTimeout(() => audio.playTone(100, 440, s.tone_volume), 1000)
  setTimeout(() => audio.playTone(700, 880, s.tone_volume, 'triangle', 0.25), 2000)
}
function previewBeep() {
  persist()
  audio.unlock()
  audio.playTone(40, 523.25, s.indicator_beep_volume, 'square', 0.02)
}

// ---- announcements
const usage = computed(() => [
  { label: t('Never'), value: 0 },
  { label: t('Individual races only'), value: 2 },
  { label: t('Always'), value: 1 }
])
const neverAlways = computed(() => [
  { label: t('Never'), value: 0 },
  { label: t('Always'), value: 1 }
])
type NumKey = 'voice_callsign' | 'voice_lap_count' | 'voice_lap_time' | 'voice_race_timer' | 'voice_team_lap_count'
  | 'voice_race_winner' | 'voice_if_node_finished' | 'voice_split_timer' | 'voice_race_leader'
const announcements = computed<{ key: NumKey, label: string, items: { label: string, value: number }[] }[]>(() => [
  { key: 'voice_callsign', label: t('Pilot Callsign'), items: usage.value },
  { key: 'voice_lap_count', label: t('Pilot Lap Number'), items: usage.value },
  { key: 'voice_lap_time', label: t('Pilot Lap Time'), items: usage.value },
  {
    key: 'voice_race_timer',
    label: t('Race Clock'),
    items: [{ label: t('Never'), value: 0 }, { label: t('Only on Fixed-time Races'), value: 2 }, { label: t('Always'), value: 1 }]
  },
  {
    key: 'voice_team_lap_count',
    label: t('Team/Co-op Lap Total'),
    items: [{ label: t('Never'), value: 0 }, { label: t('On Team/Co-op Races'), value: 1 }, { label: t('On Team/Co-op Races (short call)'), value: 2 }]
  },
  { key: 'voice_race_winner', label: t('Race Winner'), items: neverAlways.value },
  { key: 'voice_if_node_finished', label: t('Laps After Pilot Done'), items: neverAlways.value },
  ...(cluster.value
    ? [{
        key: 'voice_split_timer' as const,
        label: t('Secondary/Split Timer'),
        items: [
          { label: t('None'), value: 0 },
          { label: t('Pilot Name'), value: 1 },
          { label: t('Pilot Name, Split Value'), value: 5 },
          { label: t('Pilot Name, Split ID'), value: 3 },
          { label: t('Pilot Name, Split ID, Split Value'), value: 7 },
          { label: t('Split ID'), value: 2 },
          { label: t('Split Time'), value: 4 },
          { label: t('Split ID, Split Time'), value: 6 }
        ]
      }]
    : []),
  {
    key: 'voice_race_leader',
    label: t('Race Leader Pilot'),
    items: [
      { label: t('None'), value: 0 },
      { label: t('After 1 Second'), value: 1 },
      ...Array.from({ length: 18 }, (_, i) => ({ label: t(`After ${i + 2} Seconds`), value: i + 2 }))
    ]
  }
])
function setNum(key: NumKey, v: number) {
  s[key] = Number(v)
  persist()
}

// ---- indicator beeps
type BeepKey = 'beep_on_first_pass_button' | 'beep_crossing_entered' | 'beep_crossing_exited' | 'beep_manual_lap_button'
  | 'beep_race_leader_lap' | 'beep_race_winner_declared' | 'beep_cluster_connect'
const beeps = computed<{ key: BeepKey, label: string, disabled?: boolean, description?: string }[]>(() => [
  { key: 'beep_on_first_pass_button', label: t('On First Pass'), disabled: s.beep_crossing_exited, description: s.beep_crossing_exited ? t('Not used while Crossing Exited is on.') : undefined },
  { key: 'beep_crossing_entered', label: t('Crossing Entered') },
  { key: 'beep_crossing_exited', label: t('Crossing Exited') },
  { key: 'beep_manual_lap_button', label: t('Manual Lap Button') },
  { key: 'beep_race_leader_lap', label: t('Race Leader Lap') },
  { key: 'beep_race_winner_declared', label: t('Race Winner Declared') },
  ...(cluster.value ? [{ key: 'beep_cluster_connect' as const, label: t('Secondary Timer Connect / Disconnect') }] : [])
])
function setFlag(key: BeepKey | 'use_mp3_tones' | 'enabled', v: boolean) {
  s[key] = v
  persist()
  if (key === 'enabled' && v) audio.test()
}

// ---- export / import / defaults (classic file format: rotorhazard.<key>=<JSON> lines)
const AUDIO_KEYS = Object.keys(AUDIO_DEFAULTS) as (keyof typeof AUDIO_DEFAULTS)[]
const pad = (n: number) => String(n).padStart(2, '0')

function exportSettings() {
  const now = new Date()
  const stamp = now.toLocaleTimeString('en-us', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const lines = [`# RotorHazard Audio Settings ${stamp}`, ...AUDIO_KEYS.map(k => `rotorhazard.${k}=${JSON.stringify(s[k])}`)]
  const name = `rhAudioSettings_${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.cfg`
  const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/plain' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileInput = ref<HTMLInputElement | null>(null)
async function importSettings(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  let applied = 0
  try {
    const text = await file.text()
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const eq = line.indexOf('=')
      if (eq < 1) continue
      const key = line.slice(0, eq).replace(/^rotorhazard\./, '') as keyof typeof AUDIO_DEFAULTS
      if (!AUDIO_KEYS.includes(key)) {
        console.error('Error importing audio settings; invalid key: ' + line.slice(0, eq))
        continue
      }
      try {
        ;(s as any)[key] = JSON.parse(line.slice(eq + 1))
        applied++
      } catch {
        console.error('Error importing audio settings; invalid value for ' + key)
      }
    }
  } catch { /* unreadable file */ }
  if (applied) {
    persist()
    toast.add({ title: t('Audio settings imported'), icon: 'i-lucide-check-circle', color: 'success' })
  } else {
    toast.add({ title: t('No audio settings found in this file'), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}

const resetOpen = ref(false)
function resetDefaults() {
  audio.reset()
  resetOpen.value = false
  toast.add({ title: t('Audio settings set to defaults'), icon: 'i-lucide-check-circle', color: 'success' })
}
</script>

<template>
  <div class="space-y-8">
    <RhGroup>
      <RhRow :label="t('Race Audio')" inline :description="t('Play voice callouts and tones on this device.')" icon="i-lucide-volume-2">
        <USwitch :model-value="s.enabled" :aria-label="t('Race Audio')" @update:model-value="(v: boolean) => setFlag('enabled', v)" />
      </RhRow>
    </RhGroup>

    <RhGroup :title="t('Voice')">
      <RhRow :label="t('Voice Select')" :description="speechAvailable && !voiceItems.length ? t('No voices are available in this browser.') : undefined">
        <USelectMenu
          v-model="voice"
          :items="voiceItems"
          value-key="value"
          :disabled="!voiceItems.length"
          :placeholder="t('Default')"
          :search-input="{ placeholder: t('Search') }"
          class="w-full sm:w-64"
        />
      </RhRow>
      <RhRow :label="t('Voice Language')" :description="t('Language of spoken phrases.')">
        <USelect v-model="voiceLanguage" :items="voiceLanguageItems" class="w-full sm:w-64" />
      </RhRow>
      <RhRow :label="t('Voice Volume')">
        <div class="flex w-full items-center gap-3 sm:w-72">
          <UIcon name="i-lucide-volume" class="size-4 shrink-0 text-dimmed" />
          <USlider v-model="voiceVolume" :min="0" :max="100" class="flex-1" @change="() => { persist(); preview() }" />
          <span class="tabular w-11 text-right text-sm text-muted">{{ voiceVolume }}%</span>
        </div>
      </RhRow>
      <RhRow :label="t('Voice Rate')">
        <div class="flex w-full items-center gap-3 sm:w-72">
          <UIcon name="i-lucide-gauge" class="size-4 shrink-0 text-dimmed" />
          <USlider v-model="s.voice_rate" :min="0" :max="2" :step="0.01" class="flex-1" @change="() => { persist(); preview() }" />
          <span class="tabular w-11 text-right text-sm text-muted">{{ s.voice_rate.toFixed(2) }}×</span>
        </div>
      </RhRow>
      <RhRow :label="t('Voice Pitch')">
        <div class="flex w-full items-center gap-3 sm:w-72">
          <UIcon name="i-lucide-audio-lines" class="size-4 shrink-0 text-dimmed" />
          <USlider v-model="s.voice_pitch" :min="0" :max="2" :step="0.01" class="flex-1" @change="() => { persist(); preview() }" />
          <span class="tabular w-11 text-right text-sm text-muted">{{ s.voice_pitch.toFixed(2) }}×</span>
        </div>
      </RhRow>
      <RhRow :label="t('Voice Test')">
        <UInput v-model="testText" class="w-full sm:w-72" :ui="{ trailing: 'pe-1' }" @keydown.enter="preview">
          <template #trailing>
            <UButton icon="i-lucide-play" color="primary" variant="soft" size="xs" :aria-label="t('Play')" @click="preview" />
          </template>
        </UInput>
      </RhRow>
    </RhGroup>

    <RhGroup :title="t('Announcements')">
      <RhRow v-for="a in announcements" :key="a.key" :label="a.label">
        <USelect :model-value="s[a.key]" :items="a.items" class="w-full sm:w-72" @update:model-value="(v: any) => setNum(a.key, v)" />
      </RhRow>
    </RhGroup>

    <RhGroup :title="t('Tones')">
      <RhRow :label="t('Tone Volume')" :description="t('Staging, start and end tones.')">
        <div class="flex w-full items-center gap-3 sm:w-72">
          <UIcon name="i-lucide-bell" class="size-4 shrink-0 text-dimmed" />
          <USlider v-model="toneVolume" :min="0" :max="100" class="flex-1" @change="previewTone" />
          <span class="tabular w-11 text-right text-sm text-muted">{{ toneVolume }}%</span>
        </div>
      </RhRow>
      <RhRow :label="t('Indicator Beeps Volume')">
        <div class="flex w-full items-center gap-3 sm:w-72">
          <UIcon name="i-lucide-bell-ring" class="size-4 shrink-0 text-dimmed" />
          <USlider v-model="beepVolume" :min="0" :max="100" class="flex-1" @change="previewBeep" />
          <span class="tabular w-11 text-right text-sm text-muted">{{ beepVolume }}%</span>
        </div>
      </RhRow>
      <RhRow :label="t('Use MP3 Tones instead of synthetic tones')" inline>
        <USwitch :model-value="s.use_mp3_tones" :aria-label="t('Use MP3 Tones instead of synthetic tones')" @update:model-value="(v: boolean) => setFlag('use_mp3_tones', v)" />
      </RhRow>
    </RhGroup>

    <RhGroup :title="t('Indicator Beeps')">
      <RhRow v-for="b in beeps" inline :key="b.key" :label="b.label" :description="b.description">
        <USwitch :model-value="s[b.key]" :disabled="b.disabled" :aria-label="b.label" @update:model-value="(v: boolean) => setFlag(b.key, v)" />
      </RhRow>
    </RhGroup>

    <RhGroup :title="t('Audio Settings')" :footer="t('Export these settings to copy them to another device.')">
      <div class="flex flex-wrap gap-2 px-4 py-3">
        <UButton color="neutral" variant="soft" icon="i-lucide-download" :label="t('Export Audio Settings')" @click="exportSettings" />
        <UButton color="neutral" variant="soft" icon="i-lucide-upload" :label="t('Import Audio Settings')" @click="fileInput?.click()" />
        <UButton color="error" variant="ghost" icon="i-lucide-rotate-ccw" :label="t('Set Audio Settings to Defaults')" class="sm:ms-auto" @click="resetOpen = true" />
        <input ref="fileInput" type="file" accept=".cfg,text/plain" class="hidden" @change="importSettings">
      </div>
    </RhGroup>

    <UModal v-model:open="resetOpen" :title="t('Set audio settings to defaults?')" :description="t('This will overwrite all audio settings. Are you sure?')">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" :label="t('Set Defaults')" @click="resetDefaults" />
        </div>
      </template>
    </UModal>
  </div>
</template>
