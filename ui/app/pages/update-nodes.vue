<script setup lang="ts">
/**
 * Node firmware update (the classic /updatenodes page) for the RotorHazard
 * S32_BPill board. The timer checks the file, flashes it and then needs a restart.
 */
const { t } = useI18n()
const rh = useRH()
const { restartServer } = useMessages()
useHead({ title: computed(() => t('Update Nodes')) })

const src = ref('')
const info = ref('')
const checking = ref(false)
const canUpdate = ref(false)
const updating = ref(false)
const log = ref('')
const finished = ref(false)
const confirmOpen = ref(false)

// what the server found in the file (newer servers send it as data as well as text)
const facts = ref<any>(null)
const unknown = () => t('Unknown')
const factRows = computed(() => {
  const f = facts.value
  if (!f) return []
  const build = (v: string | null, p: string | null) => [p, v].filter(Boolean).join(' · ') || null
  return [
    { label: t('File size'), value: f.size != null ? `${Math.round(f.size / 102.4) / 10} KB` : null },
    { label: t('New version'), value: f.version || unknown() },
    { label: t('New build'), value: build(f.build, f.proctype) || unknown() },
    ...(f.updatable === false
      ? []
      : [{ label: t('Installed version'), value: f.current_version || unknown() },
          { label: t('Installed build'), value: build(f.current_build, f.current_proctype) || unknown() }])
  ]
})
rh.on('upd_file_info', (d: any) => { facts.value = d })

function check() {
  canUpdate.value = false
  checking.value = true
  facts.value = null
  info.value = ''
  rh.emit('check_bpillfw_file', { src_file_str: src.value })
}
const { admin } = useAuth()
onMounted(async () => {
  // admin-only: nothing is asked of the timer until sign-in is confirmed
  if (admin.value !== true) return
  try {
    const r = await $fetch<{ src: string }>('/app-node-firmware', { baseURL: '/', headers: rh.authHeader() })
    src.value = r.src || ''
  } catch { /* leave it for the user to enter */ }
  check()
})

rh.on('upd_set_info_text', (m: any) => {
  checking.value = false
  info.value = String(m ?? '')
})
rh.on('upd_enable_update_button', () => { canUpdate.value = true })
rh.on('upd_messages_init', (m: any) => {
  log.value = String(m ?? '') + '\n'
})
rh.on('upd_messages_append', (m: any) => {
  log.value += String(m ?? '') + '\n'
  nextTick(() => logEl.value?.scrollTo({ top: logEl.value.scrollHeight }))
})
rh.on('upd_messages_finish', () => {
  updating.value = false
  finished.value = true
})
const logEl = ref<HTMLElement>()

function update() {
  confirmOpen.value = false
  updating.value = true
  canUpdate.value = false
  finished.value = false
  log.value = ''
  rh.emit('do_bpillfw_update', { src_file_str: src.value })
}
</script>

<template>
  <UDashboardPanel id="update-nodes">
    <template #header>
      <UDashboardNavbar :title="t('Update Nodes')">
        <template #leading>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" to="/timer" :aria-label="t('Timer')" />
        </template>
        <template #right>
          <RhBell />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <p class="text-sm text-muted">
          {{ t('The processor on the RotorHazard S32_BPill board will be flash-updated using the firmware file below') }}.
        </p>

        <RhGroup :title="t('Firmware file')" :footer="t('A file path on the timer, or a web address.')">
          <RhRow stacked>
            <div class="flex w-full flex-col gap-3 sm:flex-row">
              <UInput v-model="src" class="flex-1" :disabled="updating" :aria-label="t('Firmware file')" @change="check" @keydown.enter="check" />
              <UButton color="neutral" variant="outline" icon="i-lucide-file-check" :label="t('Check')" :loading="checking" :disabled="updating || !src" class="justify-center" @click="check" />
            </div>
          </RhRow>
          <RhRow v-if="checking || info" stacked>
            <USkeleton v-if="checking" class="h-12 w-full" />
            <div v-else-if="facts" class="w-full space-y-3">
              <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
                <template v-for="r in factRows" :key="r.label">
                  <dt class="text-muted">{{ r.label }}</dt>
                  <dd class="tabular min-w-0 break-words text-highlighted">{{ r.value }}</dd>
                </template>
              </dl>
              <UAlert v-if="facts.warning" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="facts.warning" />
              <p v-if="facts.updatable === false" class="text-sm text-muted">{{ t('No updatable interfaces are available on this device') }}</p>
            </div>
            <!-- older servers (or a file error): the server's own description -->
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-else class="rh-desc text-sm" v-html="info.replace(/\(\((.*?)\)\)/g, '($1)').replace(/(<br\s*\/?>\s*)+$/i, '')" />
          </RhRow>
        </RhGroup>

        <div class="flex flex-wrap items-center justify-end gap-3">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" to="/timer" :disabled="updating" />
          <UButton color="warning" icon="i-lucide-cpu" :label="t('Update')" :loading="updating" :disabled="!canUpdate || updating" @click="confirmOpen = true" />
        </div>

        <section v-if="log" class="space-y-3">
          <h2 class="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            {{ t('Progress') }}
          </h2>
          <pre ref="logEl" class="max-h-96 overflow-auto rounded-2xl bg-elevated p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap">{{ log }}</pre>
          <UAlert
            v-if="finished"
            icon="i-lucide-rotate-cw"
            color="warning"
            variant="subtle"
            :title="t('Restart the server to finish')"
            :actions="[{ label: t('Close and Restart'), color: 'warning', onClick: restartServer }]"
          />
        </section>
      </div>

      <UModal v-model:open="confirmOpen" :title="t('Update node firmware?')" :description="t('Do not power off the timer while the nodes are being flashed.')">
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="confirmOpen = false" />
            <UButton color="warning" :label="t('Update')" @click="update" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
