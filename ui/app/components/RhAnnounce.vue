<script setup lang="ts">
/** Race page: play callouts with one tap (Ctrl+Alt+1–9) and send messages to every display. */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()
const S = rh.state
rh.load(['callouts'])

const callouts = ref<string[]>([])
watch(() => S.callouts, (c) => { if (Array.isArray(c)) callouts.value = [...c] }, { immediate: true })
const editing = ref(false)
function saveCallouts() {
  rh.emit('save_callouts', { callouts: callouts.value.filter(c => c.trim()) })
}
function removeCallout(i: number) {
  callouts.value.splice(i, 1)
  saveCallouts()
}
function doneEditing() {
  saveCallouts()
  callouts.value = callouts.value.filter(c => c.trim())
  editing.value = false
}
const play = (c: string) => rh.emit('play_callout_text', { callout: c })
const playable = computed(() => callouts.value.map((c, i) => ({ c, i })).filter(x => x.c.trim()))

const message = ref('')
const interrupt = ref(false)
function sendMessage() {
  if (!message.value.trim()) return
  rh.emit('broadcast_message', { message: message.value, interrupt: interrupt.value })
  message.value = ''
}

function onKey(e: KeyboardEvent) {
  if (e.ctrlKey && e.altKey && /^[1-9]$/.test(e.key)) {
    const c = callouts.value[Number(e.key) - 1]
    if (c?.trim()) play(c)
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <UCard :ui="{ header: 'py-3 sm:py-3', body: 'p-4 sm:p-5' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <h2 class="flex items-center gap-2 font-semibold text-highlighted">
          <UIcon name="i-lucide-megaphone" class="size-4 text-muted" />
          {{ t('Announce') }}
        </h2>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          :icon="editing ? 'i-lucide-check' : 'i-lucide-pencil'"
          :label="editing ? t('Done') : t('Edit Callouts')"
          @click="editing ? doneEditing() : (editing = true)"
        />
      </div>
    </template>

    <div class="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <!-- callouts -->
      <div class="min-w-0 space-y-2">
        <template v-if="editing">
          <div v-for="(c, i) in callouts" :key="i" class="flex items-center gap-2">
            <UInput v-model="callouts[i]" class="flex-1" :placeholder="t('Callout text')" @change="saveCallouts" @keydown.enter="play(callouts[i] || '')">
              <template v-if="i < 9" #trailing>
                <UKbd :value="`⌃⌥${i + 1}`" size="sm" />
              </template>
            </UInput>
            <UButton icon="i-lucide-play" color="neutral" variant="soft" :aria-label="t('Play')" @click="play(c)" />
            <UButton icon="i-lucide-trash-2" color="neutral" variant="ghost" :aria-label="t('Delete')" @click="removeCallout(i)" />
          </div>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :label="t('Add Callout')" @click="callouts.push('')" />
          <p class="text-xs text-muted">
            {{ t('Use %HEAT%, %PILOTS%, %LINEUP% and %FREQS% to insert details of the current heat.') }}
          </p>
        </template>
        <template v-else>
          <div v-if="playable.length" class="flex flex-wrap gap-2">
            <UButton
              v-for="x in playable"
              :key="x.i"
              color="neutral"
              variant="soft"
              icon="i-lucide-volume-2"
              class="max-w-full"
              :ui="{ label: 'truncate' }"
              :title="x.i < 9 ? `${x.c} (Ctrl+Alt+${x.i + 1})` : x.c"
              :label="x.c"
              @click="play(x.c)"
            />
          </div>
          <button
            v-else
            type="button"
            class="w-full rounded-xl border border-dashed border-default px-4 py-3 text-left text-sm text-muted hover:border-accented hover:text-highlighted"
            @click="editing = true; callouts.push('')"
          >
            {{ t('Add callouts to play them here with one tap.') }}
          </button>
        </template>
      </div>

      <!-- message to every display -->
      <form class="min-w-0 space-y-2" @submit.prevent="sendMessage">
        <UFieldGroup class="w-full">
          <UInput v-model="message" :maxlength="256" class="flex-1" :placeholder="t('Message to all displays')" :aria-label="t('Send Message')" />
          <UButton type="submit" icon="i-lucide-send" :label="t('Send')" :disabled="!message.trim()" />
        </UFieldGroup>
        <USwitch v-model="interrupt" size="sm" :label="info?.vrx_enabled ? t('Pop-up alert and send to VRx') : t('Pop-up alert')" />
      </form>
    </div>
  </UCard>
</template>
