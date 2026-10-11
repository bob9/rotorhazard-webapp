<script setup lang="ts">
/**
 * Settings › System: server facts, restart / reboot / shut down, logs, node
 * firmware and diagnostic tools, plus the classic "Advanced Settings" page
 * (server configuration items saved with `set_config`).
 */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()
const { restartRequired, restartServer } = useMessages()
const cfg = useConfig()
const toast = useToast()

// ---------------------------------------------------------------- advanced settings definitions
type FieldType = 'number' | 'text' | 'bool' | 'select'
interface Field {
  section: string
  key: string
  label: string
  type: FieldType
  desc?: string
  restart?: boolean
  options?: { label: string, value: string | number | boolean }[]
  min?: number
  max?: number
  step?: number
  placeholder?: string
}
interface FieldGroup { id: string, title: string, icon: string, description?: string, fields: Field[] }

const LOG_LEVELS = computed(() => [
  { label: t('None'), value: 'NONE' },
  { label: t('Error'), value: 'ERROR' },
  { label: t('Warning'), value: 'WARNING' },
  { label: t('Info'), value: 'INFO' },
  { label: t('Debug'), value: 'DEBUG' }
])

const groups = computed<FieldGroup[]>(() => [
  {
    id: 'timing',
    title: t('Timing'),
    icon: 'i-lucide-timer',
    fields: [
      { section: 'TIMING', key: 'calibrationMode', label: t('Calibration Mode'), type: 'select', options: [{ label: t('Manual'), value: 0 }, { label: t('Adaptive'), value: 1 }], desc: t('Adaptive adjusts EnterAt/ExitAt levels from saved races.') },
      { section: 'GENERAL', key: 'SYNC_LEADTIME_SECS', label: t('Sync Lead Time (seconds)'), type: 'number', min: 0.9, max: 99.9, step: 0.01, desc: t('Send time-critical signals in advance to facilitate device synchronization') }
    ]
  },
  {
    id: 'http',
    title: t('HTTP Server'),
    icon: 'i-lucide-globe',
    fields: [
      { section: 'GENERAL', key: 'HTTP_PORT', label: t('HTTP Port'), type: 'number', min: 0, restart: true },
      { section: 'GENERAL', key: 'CORS_ALLOWED_HOSTS', label: t('CORS Allowed Hosts'), type: 'text', restart: true, placeholder: '*' },
      { section: 'GENERAL', key: 'ADMIN_SOCKET_AUTH', label: t('Admin Socket Auth'), type: 'bool', desc: t('Require the admin login for race-control and settings actions sent over the live connection.') }
    ]
  },
  {
    id: 'logging',
    title: t('Logging'),
    icon: 'i-lucide-scroll-text',
    fields: [
      { section: 'LOGGING', key: 'FILELOG_LEVEL', label: t('Logfile Level'), type: 'select', options: LOG_LEVELS.value, restart: true },
      { section: 'LOGGING', key: 'FILELOG_NUM_KEEP', label: t('Logfile Retention (number)'), type: 'number', min: -1, restart: true },
      { section: 'LOGGING', key: 'CONSOLE_LEVEL', label: t('Console Log Level'), type: 'select', options: LOG_LEVELS.value, restart: true },
      { section: 'LOGGING', key: 'CONSOLE_STREAM', label: t('Console Stream'), type: 'text', restart: true, placeholder: 'stdout' },
      { section: 'LOGGING', key: 'SYSLOG_LEVEL', label: t('System Log Level'), type: 'select', options: LOG_LEVELS.value, restart: true },
      { section: 'GENERAL', key: 'LOG_SENSORS_DATA_RATE', label: t('Sensor Log Rate'), type: 'number', min: 1, desc: t('Seconds between environment sensor log entries') },
      { section: 'LOGGING', key: 'EVENTS', label: t('Event Log Verbosity (debug only)'), type: 'select', options: [{ label: t('None'), value: 0 }, { label: t('On/Off'), value: 1 }, { label: t('All'), value: 2 }] }
    ]
  },
  {
    id: 'hardware',
    title: t('Hardware'),
    icon: 'i-lucide-cpu',
    fields: [
      { section: 'HARDWARE', key: 'I2C_BUS', label: t('I2C Bus'), type: 'number', min: 0, restart: true },
      { section: 'GENERAL', key: 'FORCE_S32_BPILL_FLAG', label: t('Force STM32 BPill'), type: 'bool', restart: true },
      { section: 'GENERAL', key: 'SHUTDOWN_BUTTON_GPIOPIN', label: t('Shutdown Button GPIO Number'), type: 'number', min: 0, restart: true },
      { section: 'GENERAL', key: 'SHUTDOWN_BUTTON_DELAYMS', label: t('Shutdown Button Delay (ms)'), type: 'number', min: -1, restart: true },
      { section: 'GENERAL', key: 'DEF_NODE_FWUPDATE_URL', label: t('Node Update URL Override'), type: 'text' }
    ]
  },
  {
    id: 'led',
    title: t('LED Hardware'),
    icon: 'i-lucide-lightbulb',
    fields: [
      { section: 'LED', key: 'LED_COUNT', label: t('Count'), type: 'number', min: 0, restart: true, desc: t('Number of LED pixels (0 disables LEDs)') },
      { section: 'LED', key: 'LED_ROWS', label: t('Panel Rows'), type: 'number', min: 1, restart: true },
      { section: 'LED', key: 'PANEL_ROTATE', label: t('Panel Rotation'), type: 'select', options: [{ label: t('None'), value: 0 }, { label: t('90°'), value: 1 }, { label: t('180°'), value: 2 }, { label: t('270°'), value: 3 }] },
      { section: 'LED', key: 'INVERTED_PANEL_ROWS', label: t('Panel Row Ordering'), type: 'select', options: [{ label: t('All LTR (non-inverted)'), value: false }, { label: t('Even Rows RTL (inverted)'), value: true }] },
      { section: 'LED', key: 'LED_GPIO', label: t('GPIO Pin'), type: 'number', min: 0, restart: true },
      { section: 'LED', key: 'LED_FREQ_HZ', label: t('Frequency (Hz)'), type: 'number', min: 0, restart: true },
      { section: 'LED', key: 'LED_DMA', label: t('DMA'), type: 'number', min: 0, restart: true },
      { section: 'LED', key: 'LED_INVERT', label: t('Inverted Control Signal'), type: 'select', options: [{ label: t('Normal'), value: false }, { label: t('Inverted'), value: true }], restart: true },
      { section: 'LED', key: 'LED_CHANNEL', label: t('Channel'), type: 'number', min: 0, restart: true },
      { section: 'LED', key: 'LED_STRIP', label: t('Strip Type'), type: 'select', options: ['BGR', 'BRG', 'GBR', 'GRB', 'RBG', 'RGB', 'RGBW'].map(v => ({ label: v, value: v })), restart: true },
      { section: 'LED', key: 'SERIAL_CTRLR_PORT', label: t('Serial Controller Port'), type: 'text', restart: true },
      { section: 'LED', key: 'SERIAL_CTRLR_BAUD', label: t('Serial Controller BAUD'), type: 'number', min: 0, restart: true }
    ]
  },
  {
    id: 'misc',
    title: t('Miscellaneous'),
    icon: 'i-lucide-sliders-horizontal',
    fields: [
      { section: 'GENERAL', key: 'DEBUG', label: t('Server Debug Mode'), type: 'bool', desc: t('Shows developer tools and extra diagnostics.') },
      { section: 'GENERAL', key: 'DB_AUTOBKP_NUM_KEEP', label: t('Database Backup Retention (days)'), type: 'number', min: -1, restart: true },
      { section: 'GENERAL', key: 'MOCK_NODES', label: t('Mock Nodes (minimum)'), type: 'number', min: 0, restart: true },
      { section: 'GENERAL', key: 'MOCK_NODE_SIGNAL', label: t('Mock Node Signal'), type: 'select', options: [{ label: t('None'), value: 0 }, { label: `${t('Replay')} mock_data_[n].csv`, value: 1 }, { label: t('Simulated'), value: 2 }] }
    ]
  }
])

// request every config item shown on this page
const spec: Record<string, string[]> = { GENERAL: ['SERIAL_PORTS'] }
for (const g of groups.value) {
  for (const f of g.fields) (spec[f.section] ||= []).push(f.key)
}
cfg.load(spec)
rh.load(['start_thresh_lower_amount', 'start_thresh_lower_duration'])
// keep values current even if the shared listener is not active
rh.on('config_update', (d: any) => {
  for (const [section, items] of Object.entries<Record<string, any>>(d?.config || {})) {
    cfg.values[section] = { ...(cfg.values[section] || {}), ...items }
  }
})

const ready = computed(() => Object.keys(spec).every(s => !!cfg.values[s]))
const keyOf = (f: Field) => `${f.section}.${f.key}`
const draft = reactive<Record<string, any>>({})
watch(() => groups.value.flatMap(g => g.fields).map(f => cfg.get(f.section, f.key)), () => {
  for (const g of groups.value) {
    for (const f of g.fields) {
      const v = cfg.get(f.section, f.key)
      draft[keyOf(f)] = f.type === 'select' ? String(v) : f.type === 'bool' ? !!v : (v ?? '')
    }
  }
}, { immediate: true })

function coerce(f: Field, raw: any) {
  if (f.type === 'bool') return !!raw
  if (f.type === 'number') {
    const n = Number(raw)
    return raw === '' || Number.isNaN(n) ? null : n
  }
  if (f.type === 'select') return f.options?.find(o => String(o.value) === String(raw))?.value ?? raw
  return f.key === 'SERIAL_CTRLR_PORT' && raw === '' ? null : raw
}
function commit(f: Field, raw = draft[keyOf(f)]) {
  const value = coerce(f, raw)
  if (f.type === 'number' && value === null) {
    draft[keyOf(f)] = cfg.get(f.section, f.key) ?? ''
    return
  }
  if (f.type === 'number' && f.min !== undefined && (value as number) < f.min) {
    toast.add({ title: t('Value too low'), description: `${f.label}: ${t('minimum')} ${f.min}`, color: 'warning', icon: 'i-lucide-triangle-alert' })
    draft[keyOf(f)] = cfg.get(f.section, f.key) ?? ''
    return
  }
  if (value === cfg.get(f.section, f.key)) return
  draft[keyOf(f)] = f.type === 'select' ? String(raw) : raw
  cfg.set(f.section, f.key, value)
  if (f.section === 'GENERAL' && f.key === 'DEBUG') setTimeout(() => useServerInfo().refresh(), 500)
  if (!f.restart) toast.add({ title: t('Setting saved'), description: f.label, icon: 'i-lucide-check', color: 'success', duration: 1500 })
}
const selectItems = (f: Field) => (f.options || []).map(o => ({ label: o.label, value: String(o.value) }))

// serial ports (GENERAL.SERIAL_PORTS, a list of port names)
const serialPorts = computed<string[]>(() => cfg.get<string[]>('GENERAL', 'SERIAL_PORTS', []) || [])
const portDrafts = ref<string[]>([])
watch(serialPorts, (p) => { portDrafts.value = [...p] }, { immediate: true })
const newPort = ref('')
function savePorts(list: string[]) {
  const ports = list.map(p => p.trim()).filter(Boolean)
  cfg.set('GENERAL', 'SERIAL_PORTS', ports)
  cfg.load({ GENERAL: ['SERIAL_PORTS'] })
  rh.refresh([{ type: 'config', value: { GENERAL: ['SERIAL_PORTS'] } }])
}
function addPort() {
  if (!newPort.value.trim()) return
  savePorts([...serialPorts.value, newPort.value])
  newPort.value = ''
}
function removePort(i: number) {
  savePorts(serialPorts.value.filter((_, j) => j !== i))
}

// start-of-race threshold lowering (TIMING items with dedicated events)
const threshAmount = ref<number | null>(null)
const threshDuration = ref<number | null>(null)
watch(() => rh.state.start_thresh_lower_amount, (d) => { threshAmount.value = d?.start_thresh_lower_amount ?? null }, { immediate: true })
watch(() => rh.state.start_thresh_lower_duration, (d) => { threshDuration.value = d?.start_thresh_lower_duration ?? null }, { immediate: true })
function setThreshAmount() {
  const v = Math.max(0, Math.min(200, Math.round(Number(threshAmount.value) || 0)))
  threshAmount.value = v
  rh.emit('set_start_thresh_lower_amount', { start_thresh_lower_amount: v })
}
function setThreshDuration() {
  const v = Math.max(0, Math.min(999, Math.round(Number(threshDuration.value) || 0)))
  threshDuration.value = v
  rh.emit('set_start_thresh_lower_duration', { start_thresh_lower_duration: v })
}

// show advanced settings (remembered on this device)
const showAdvanced = ref(false)
onMounted(() => {
  try {
    showAdvanced.value = localStorage.getItem('rh.settings.showAdvanced') === '1'
  } catch { /* storage unavailable */ }
})
watch(showAdvanced, (v) => {
  try {
    localStorage.setItem('rh.settings.showAdvanced', v ? '1' : '0')
  } catch { /* storage unavailable */ }
})

// ---------------------------------------------------------------- server facts
const server = computed(() => info.value?.server || {})
const startedAt = computed(() => {
  const ms = Number(server.value.prog_start_epoch)
  return ms ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)) : server.value.prog_start_time
})
const nodeApi = computed(() => {
  const levels: any[] = (server.value.node_api_levels || []).filter((v: any) => v !== null && v !== undefined)
  return levels.length ? [...new Set(levels)].join(', ') : '—'
})
const nodeUpdateAvailable = computed(() => {
  const levels: number[] = (server.value.node_api_levels || []).filter((v: any) => typeof v === 'number')
  return levels.length > 0 && levels.some(l => l < server.value.node_api_best)
})
const facts = computed(() => [
  { label: t('Server API'), value: server.value.server_api ?? '—' },
  { label: t('Node API'), value: nodeApi.value },
  { label: t('Nodes'), value: info.value?.num_nodes ?? '—' },
  { label: t('Started'), value: startedAt.value || '—' }
])
const aboutOpen = ref(false)

// ---------------------------------------------------------------- power
interface ConfirmOptions { title: string, description: string, label: string, icon: string, action: () => void }
const confirm = reactive({ open: false, title: '', description: '', label: '', icon: '', action: (() => {}) as () => void })
function ask(o: ConfirmOptions) {
  Object.assign(confirm, o, { open: true })
}
function confirmed() {
  confirm.open = false
  confirm.action()
}
const askRestart = () => ask({ title: t('Restart'), description: t('Restart RotorHazard server process?'), label: t('Restart'), icon: 'i-lucide-rotate-cw', action: restartServer })
const askReboot = () => ask({ title: t('Reboot'), description: t('Reboot server hardware?'), label: t('Reboot'), icon: 'i-lucide-refresh-ccw', action: () => rh.emit('reboot_pi') })
const askShutdown = () => ask({ title: t('Shut Down'), description: t('Shut down server hardware?'), label: t('Shut Down'), icon: 'i-lucide-power', action: () => rh.emit('shutdown_pi') })
const askKill = () => ask({ title: t('Kill Server'), description: t('Terminate RotorHazard server?'), label: t('Kill Server'), icon: 'i-lucide-octagon-x', action: () => rh.emit('kill_server') })

// ---------------------------------------------------------------- logs
const LOGS_EVENT = 'app_save_logs'
const downloadingLogs = ref(false)
function audioSettingsStr() {
  let out = `# RotorHazard Audio Settings ${new Date().toLocaleString('en-US')}\n`
  for (const k of Object.keys(AUDIO_DEFAULTS)) {
    let v: any = (AUDIO_DEFAULTS as any)[k]
    try {
      const raw = localStorage.getItem('rotorhazard.' + k)
      if (raw !== null) v = JSON.parse(raw)
    } catch { /* ignore */ }
    out += `${k}=${JSON.stringify(v)}\n`
  }
  return out
}
function downloadLogs() {
  downloadingLogs.value = true
  rh.emit('download_logs', { emit_fn_name: LOGS_EVENT, audioSettingsData: audioSettingsStr(), audioSettingsFName: 'rhAudioSettings.cfg' })
  setTimeout(() => { downloadingLogs.value = false }, 30000)
}
rh.on(LOGS_EVENT, (d: any) => {
  if (!downloadingLogs.value || !d?.file_data) return // broadcast: only save the one this page asked for
  downloadingLogs.value = false
  saveBase64File(d.file_name, d.file_data, 'application/zip')
  toast.add({ title: t('Logs downloaded'), description: d.file_name, icon: 'i-lucide-check-circle', color: 'success' })
})

// live log viewer
const logOpen = ref(false)
const logLevel = ref('INFO')
const logLines = ref<string[]>([])
const logPaused = ref(false)
const logLoading = ref(false)
const logEl = ref<HTMLElement | null>(null)
const MAX_LOG_LINES = 3000
const logLevelItems = computed(() => [
  { label: t('All'), value: 'NOTSET' },
  { label: t('Info'), value: 'INFO' },
  { label: t('Warning'), value: 'WARNING' },
  { label: t('Error'), value: 'ERROR' }
])
function requestLog() {
  logLoading.value = true
  rh.emit('set_log_level', { log_level_str: logLevel.value })
}
watch(logOpen, (o) => { if (o) requestLog() })
// ?log=ERROR (from the "An error has occurred" notice) opens the viewer at that level
const route = useRoute()
watch(() => route.query.log, (lvl) => {
  if (typeof lvl !== 'string' || !lvl) return
  if (logLevelItems.value.some(i => i.value === lvl)) logLevel.value = lvl
  logOpen.value = true
}, { immediate: true })
watch(logLevel, () => { if (logOpen.value) requestLog() })
function scrollLog() {
  nextTick(() => {
    if (logEl.value && !logPaused.value) logEl.value.scrollTop = logEl.value.scrollHeight
  })
}
rh.on('hardware_log_init', (text: string) => {
  if (!logOpen.value) return
  logLoading.value = false
  logLines.value = String(text || '').split('\n').slice(-MAX_LOG_LINES)
  scrollLog()
})
rh.on('hardware_log', (line: string) => {
  if (!logOpen.value || logPaused.value) return
  logLines.value.push(String(line))
  if (logLines.value.length > MAX_LOG_LINES) logLines.value.splice(0, logLines.value.length - MAX_LOG_LINES)
  scrollLog()
})
function lineClass(line: string) {
  if (/\bERROR\b|\bCRITICAL\b|Traceback/.test(line)) return 'text-error'
  if (/\bWARNING\b/.test(line)) return 'text-warning'
  if (/\bDEBUG\b/.test(line)) return 'text-dimmed'
  return ''
}
async function copyLog() {
  try {
    await navigator.clipboard.writeText(logLines.value.join('\n'))
    toast.add({ title: t('Copied'), icon: 'i-lucide-clipboard-check', color: 'success', duration: 1500 })
  } catch { /* clipboard unavailable */ }
}

// ---------------------------------------------------------------- tools
const tools = useTools().tools()
</script>

<template>
  <div class="space-y-10">
    <!-- About this timer -->
    <section class="relative overflow-hidden rounded-3xl bg-default p-6 ring-1 ring-default shadow-xs sm:p-8">
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.07] via-transparent to-transparent" />
      <div class="relative flex flex-col gap-6 sm:flex-row sm:items-center">
        <div class="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <UIcon name="i-lucide-server" class="size-8" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="font-display text-2xl font-semibold text-highlighted sm:text-3xl">
            RotorHazard
          </h2>
          <p class="mt-1 text-muted">
            {{ t('Version') }} <span class="tabular font-medium text-default">{{ server.release_version || '…' }}</span>
          </p>
        </div>
        <UBadge v-if="nodeUpdateAvailable" :label="t('Node Update Available')" color="warning" variant="subtle" icon="i-lucide-circle-arrow-up" class="self-start sm:self-center" />
      </div>
      <dl class="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div v-for="f in facts" :key="f.label" class="rounded-2xl bg-elevated/60 px-4 py-3">
          <dt class="text-xs text-muted">
            {{ f.label }}
          </dt>
          <dd class="tabular mt-0.5 truncate font-medium text-highlighted">
            {{ f.value }}
          </dd>
        </div>
      </dl>
      <div v-if="server.about_html" class="relative mt-4">
        <UButton :label="aboutOpen ? t('Hide details') : t('Show details')" :trailing-icon="aboutOpen ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" color="neutral" variant="link" class="px-0" @click="aboutOpen = !aboutOpen" />
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="aboutOpen" class="rh-about mt-2 text-sm text-muted" v-html="server.about_html" />
      </div>
    </section>

    <!-- Power -->
    <RhGroup :title="t('System')">
      <RhRow
        icon="i-lucide-rotate-cw"
        :label="t('Restart')"
        :description="restartRequired ? t('System settings modified. Restart to apply and avoid unexpected behavior.') : t('Restart the RotorHazard server process. Races in progress are stopped.')"
      >
        <UButton :label="t('Restart')" :color="restartRequired ? 'warning' : 'neutral'" :variant="restartRequired ? 'solid' : 'outline'" @click="askRestart" />
      </RhRow>
      <template v-if="info?.is_raspberry_pi">
        <RhRow icon="i-lucide-refresh-ccw" :label="t('Reboot')" :description="t('Reboot server hardware?')">
          <UButton :label="t('Reboot')" color="error" variant="soft" @click="askReboot" />
        </RhRow>
        <RhRow icon="i-lucide-power" :label="t('Shut Down')" :description="t('Turn the timer off safely before removing power.')">
          <UButton :label="t('Shut Down')" color="error" variant="soft" @click="askShutdown" />
        </RhRow>
      </template>
      <RhRow v-if="info?.debug" icon="i-lucide-octagon-x" :label="t('Kill Server')" :description="t('Terminate RotorHazard server?')">
        <UButton :label="t('Kill Server')" color="error" variant="soft" @click="askKill" />
      </RhRow>
    </RhGroup>

    <!-- Logs -->
    <RhGroup :title="t('Logs')">
      <RhRow icon="i-lucide-scroll-text" :label="t('Server Log')" :description="t('Follow the server log as it is written.')">
        <UButton :label="t('View')" icon="i-lucide-eye" color="neutral" variant="outline" @click="logOpen = true" />
      </RhRow>
      <RhRow icon="i-lucide-file-archive" :label="t('Download Logs')" :description="t('A .zip of the log files, settings and this device\'s audio settings, for support requests.')">
        <UButton :label="t('Download')" icon="i-lucide-download" color="neutral" variant="outline" :loading="downloadingLogs" @click="downloadLogs" />
      </RhRow>
    </RhGroup>

    <!-- Tools -->
    <RhGroup v-if="tools.length" :title="t('Tools')">
      <RhRow v-for="tool in tools" :key="tool.key" :to="tool.to" :icon="tool.icon" :label="tool.label" :description="tool.description" />
    </RhGroup>

    <!-- Advanced -->
    <div class="space-y-6">
      <RhGroup>
        <RhRow icon="i-lucide-wrench" :label="t('Advanced Settings')" :description="t('Server, hardware and logging options. Most take effect after a restart.')">
          <USwitch v-model="showAdvanced" :aria-label="t('Advanced Settings')" />
        </RhRow>
      </RhGroup>

      <template v-if="showAdvanced">
        <div v-if="!ready" class="space-y-3">
          <USkeleton class="h-6 w-40" />
          <USkeleton class="h-48 w-full rounded-2xl" />
        </div>
        <template v-else>
          <RhGroup v-for="g in groups" :key="g.id" :title="g.title">
            <RhRow v-for="f in g.fields" :key="keyOf(f)" :description="f.desc">
              <template #label>
                <span class="inline-flex flex-wrap items-center gap-2">
                  {{ f.label }}
                  <UTooltip v-if="f.restart" :text="t('Takes effect after a restart')">
                    <UBadge :label="t('Restart')" icon="i-lucide-rotate-cw" size="sm" color="neutral" variant="subtle" class="font-normal" />
                  </UTooltip>
                </span>
              </template>
              <USwitch
                v-if="f.type === 'bool'"
                :model-value="!!draft[keyOf(f)]"
                :aria-label="f.label"
                @update:model-value="(v: boolean) => commit(f, v)"
              />
              <USelect
                v-else-if="f.type === 'select'"
                :model-value="draft[keyOf(f)]"
                :items="selectItems(f)"
                class="w-full sm:w-56"
                @update:model-value="(v: any) => commit(f, v)"
              />
              <UInput
                v-else
                v-model="draft[keyOf(f)]"
                :type="f.type === 'number' ? 'number' : 'text'"
                :min="f.min"
                :max="f.max"
                :step="f.step ?? (f.type === 'number' ? 1 : undefined)"
                :placeholder="f.placeholder"
                class="w-full sm:w-56"
                @change="commit(f)"
                @keydown.enter="commit(f)"
              />
            </RhRow>

            <!-- timing: dedicated events -->
            <template v-if="g.id === 'timing'">
              <RhRow :label="t('Start of race EnterAt/ExitAt lowering amount (percent)')">
                <UInput v-model.number="threshAmount" type="number" :min="0" :max="200" class="w-full sm:w-56" @change="setThreshAmount" @keydown.enter="setThreshAmount" />
              </RhRow>
              <RhRow :label="t('Start of race EnterAt/ExitAt lowering duration (seconds)')">
                <UInput v-model.number="threshDuration" type="number" :min="0" :max="999" class="w-full sm:w-56" @change="setThreshDuration" @keydown.enter="setThreshDuration" />
              </RhRow>
            </template>

            <!-- hardware: serial ports list -->
            <template v-if="g.id === 'hardware'">
              <RhRow :description="t('Serial ports of timing nodes connected over USB')" stacked>
                <template #label>
                  <span class="inline-flex flex-wrap items-center gap-2">
                    {{ t('Serial Ports') }}
                    <UBadge :label="t('Restart')" icon="i-lucide-rotate-cw" size="sm" color="neutral" variant="subtle" class="font-normal" />
                  </span>
                </template>
                <div class="w-full space-y-2">
                  <div v-for="(_, i) in portDrafts" :key="i" class="flex items-center gap-2">
                    <span class="tabular w-14 shrink-0 text-sm text-muted">{{ t('Port') }} {{ i + 1 }}</span>
                    <UInput v-model="portDrafts[i]" class="flex-1" @change="savePorts(portDrafts)" @keydown.enter="savePorts(portDrafts)" />
                    <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" :aria-label="t('Remove')" @click="removePort(i)" />
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="w-14 shrink-0 text-sm text-muted">{{ t('New') }}</span>
                    <UInput v-model="newPort" :placeholder="t('New Port') + ' (/dev/ttyUSB0)'" class="flex-1" @keydown.enter="addPort" />
                    <UButton icon="i-lucide-plus" color="neutral" variant="soft" size="sm" :disabled="!newPort.trim()" :aria-label="t('Add')" @click="addPort" />
                  </div>
                </div>
              </RhRow>
            </template>
          </RhGroup>
        </template>
      </template>
    </div>

    <!-- Server log viewer -->
    <USlideover v-model:open="logOpen" :title="t('Server Log')" side="right" :ui="{ content: 'sm:max-w-3xl', body: 'p-0 sm:p-0 flex flex-col' }">
      <template #body>
        <div class="flex flex-wrap items-center gap-2 border-b border-default px-4 py-2">
          <USelect v-model="logLevel" :items="logLevelItems" size="sm" class="w-32" :aria-label="t('Log Level')" />
          <UButton
            :label="logPaused ? t('Resume Updates') : t('Pause Updates')"
            :icon="logPaused ? 'i-lucide-play' : 'i-lucide-pause'"
            size="sm"
            color="neutral"
            variant="ghost"
            @click="logPaused = !logPaused; if (!logPaused) requestLog()"
          />
          <div class="flex-1" />
          <UButton icon="i-lucide-copy" size="sm" color="neutral" variant="ghost" :aria-label="t('Copy')" @click="copyLog" />
          <UButton icon="i-lucide-download" size="sm" color="neutral" variant="ghost" :loading="downloadingLogs" :aria-label="t('Download Logs')" @click="downloadLogs" />
        </div>
        <div ref="logEl" class="min-h-0 flex-1 overflow-auto bg-muted/40">
          <div v-if="logLoading && !logLines.length" class="flex items-center gap-2 p-4 text-sm text-muted">
            <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> {{ t('Loading...') }}
          </div>
          <pre class="px-4 py-3 font-mono text-[11.5px] leading-relaxed whitespace-pre-wrap break-all"><span v-for="(line, i) in logLines" :key="i" :class="lineClass(line)">{{ line }}
</span></pre>
        </div>
      </template>
    </USlideover>

    <!-- Confirmation -->
    <UModal v-model:open="confirm.open" :title="confirm.title" :description="confirm.description">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" :icon="confirm.icon" :label="confirm.label" @click="confirmed" />
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.rh-about :deep(ul) { list-style: disc; padding-left: 1.25rem; }
.rh-about :deep(li) { margin: 0.125rem 0; }
.rh-about :deep(strong) { color: var(--ui-text-highlighted); }
</style>
