<script setup lang="ts">
/**
 * Settings › Secondary Timers: live cluster status, the GENERAL.SECONDARIES
 * list editor and timeout, plus environment sensors (status and the SENSORS
 * config section).
 */
const rh = useRH()
const { t } = useI18n()
const cfg = useConfig()
const toast = useToast()

cfg.load({ GENERAL: ['SECONDARIES', 'SECONDARY_TIMEOUT'], SENSORS: [] })
rh.load(['cluster_status', 'environmental_data'])

// config_update: SENSORS arrives as the whole section, so replace it rather than merge
const sensorsCfg = ref<Record<string, Record<string, any>> | null>(null)
rh.on('config_update', (d: any) => {
  const c = d?.config || {}
  if (c.GENERAL) cfg.values.GENERAL = { ...(cfg.values.GENERAL || {}), ...c.GENERAL }
  if ('SENSORS' in c) sensorsCfg.value = { ...(c.SENSORS || {}) }
})
watch(() => cfg.values.SENSORS, (v) => { if (v && sensorsCfg.value === null) sensorsCfg.value = { ...v } }, { immediate: true })

// ---------------------------------------------------------------- cluster status
interface StatusRow {
  address: string
  modeIndicator: string
  lastLatencyMs: number | null
  minLatencyMs: number | null
  avgLatencyMs: number | null
  maxLatencyMs: number | null
  numDisconnects: number
  numContacts: number
  timeDiffMs: number | null
  upTimeSecs: number
  downTimeSecs: number
  availability: number
  last_contact: string
}
const status = computed<StatusRow[]>(() => rh.state.cluster_status?.secondaries || [])
function contactInfo(s: StatusRow) {
  const raw = String(s.last_contact ?? '')
  const retry = raw.match(/data-secondary_id="(\d+)"/)
  const text = raw.replace(/<[^>]*>/g, '').trim()
  const connected = /^\d+s$/.test(text)
  return { text, connected, retryId: retry ? Number(retry[1]) : null }
}
const ms = (v: number | null | undefined) => (v === null || v === undefined ? '—' : String(v))
function duration(secs: number) {
  if (!secs) return '0s'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h ? `${h}h ${m}m` : m ? `${m}m ${s}s` : `${s}s`
}
function retry(id: number) {
  rh.emit('retry_secondary', { secondary_id: id })
  toast.add({ title: t('Retrying connection'), icon: 'i-lucide-refresh-cw', color: 'neutral', duration: 2000 })
}
const hrefFor = (addr: string) => (/^https?:\/\//.test(addr) ? addr : `http://${addr}`)

// ---------------------------------------------------------------- secondaries editor
type OptType = 'numeric' | 'boolean' | 'text' | 'password' | { value: string, label: string }[]
interface SecOption { key: string, label: string, type: OptType, def: any }
const OPTIONS = computed<SecOption[]>(() => ([
  { key: 'callout', label: t('Callout'), type: [{ value: 'time', label: t('Time') }, { value: 'speed', label: t('Speed') }, { value: 'both', label: t('Time & Speed') }, { value: 'nameOnly', label: t('Name') }, { value: 'none', label: t('None') }], def: 'none' },
  { key: 'distance', label: t('Distance'), type: 'numeric', def: 0 },
  { key: 'queryInterval', label: t('Query Interval'), type: 'numeric', def: 10 },
  { key: 'recEventsFlag', label: t('Receives Events'), type: 'boolean', def: false },
  { key: 'timeout', label: t('Timeout (seconds)'), type: 'numeric', def: 0 },
  { key: 'event', label: t('Event'), type: 'text', def: '' },
  { key: 'effect', label: t('Effect'), type: [{ value: 'speak', label: t('Speak') }, { value: 'message', label: t('Message') }, { value: 'alert', label: t('Alert') }], def: 'speak' },
  { key: 'text', label: t('Text'), type: 'text', def: '' },
  { key: 'toneDuration', label: t('Tone Duration'), type: 'numeric', def: 0 },
  { key: 'toneFrequency', label: t('Tone Frequency'), type: 'numeric', def: 0 },
  { key: 'toneVolume', label: t('Tone Volume'), type: 'numeric', def: 0 },
  { key: 'toneType', label: t('Tone Type'), type: [{ value: 'square', label: t('Square') }, { value: 'sine', label: t('Sine') }, { value: 'sawtooth', label: t('Sawtooth') }, { value: 'triangle', label: t('Triangle') }], def: 'square' },
  { key: 'minRepeatSecs', label: t('Minimum Repeat (secs)'), type: 'numeric', def: 10 },
  { key: 'username', label: t('Username'), type: 'text', def: '' },
  { key: 'password', label: t('Password'), type: 'password', def: '' }
] as SecOption[]).sort((a, b) => a.label.localeCompare(b.label)))
const optionFor = (k: string) => OPTIONS.value.find(o => o.key === k)
const MODES = computed(() => [
  { value: 'split', label: t('Split'), description: t('Times pilots at another gate on the course (split times).') },
  { value: 'mirror', label: t('Mirror'), description: t('Follows the races of this timer, e.g. to drive its own LEDs or displays.') },
  { value: 'action', label: t('Action'), description: t('Runs an effect (speak, message, alert) when an event occurs.') }
])
const MASK = '**********'

const configured = computed<any[]>(() => cfg.get<any[]>('GENERAL', 'SECONDARIES', []) || [])
const secs = ref<any[]>([])
watch(configured, (list) => { secs.value = list.map(s => ({ ...s })) }, { immediate: true, deep: true })
const loaded = computed(() => cfg.has('GENERAL', 'SECONDARIES'))

function save(list = secs.value) {
  const out = list.filter(s => s && String(s.address || '').trim()).map((s) => {
    const o: Record<string, any> = { ...s, address: String(s.address).trim() }
    if (!o.mode) o.mode = 'split'
    return o
  })
  cfg.set('GENERAL', 'SECONDARIES', out)
  rh.refresh([{ type: 'config', value: { GENERAL: ['SECONDARIES'] } }])
}
function extraKeys(s: any) {
  return Object.keys(s).filter(k => k !== 'address' && k !== 'mode')
}
function addKeyItems(s: any, i: number) {
  const used = new Set(extraKeys(s))
  return [OPTIONS.value.filter(o => !used.has(o.key)).map(o => ({ label: o.label, onSelect: () => addKey(i, o) }))]
}
function addKey(i: number, o: SecOption) {
  secs.value[i] = { ...secs.value[i], [o.key]: o.def }
  save()
}
function removeKey(i: number, k: string) {
  const s = { ...secs.value[i] }
  delete s[k]
  secs.value[i] = s
  save()
}
function setValue(i: number, k: string, raw: any) {
  const o = optionFor(k)
  let v = raw
  if (o?.type === 'numeric') v = raw === '' || raw === null ? 0 : Number(raw)
  else if (o?.type === 'boolean') v = !!raw
  secs.value[i] = { ...secs.value[i], [k]: v }
  save()
}
const newAddress = ref('')
function addSecondary() {
  const a = newAddress.value.trim()
  if (!a) return
  save([...secs.value, { address: a, mode: 'split' }])
  newAddress.value = ''
}
const removeTarget = ref<number | null>(null)
function removeSecondary() {
  if (removeTarget.value === null) return
  save(secs.value.filter((_, j) => j !== removeTarget.value))
  removeTarget.value = null
}

// passwords arrive masked; reveal fetches the stored one for this client only
const shownPw = reactive<Record<number, boolean>>({})
function togglePw(i: number) {
  if (shownPw[i]) {
    shownPw[i] = false
    return
  }
  const cur = secs.value[i]?.password
  if (cur && cur !== MASK) shownPw[i] = true
  else rh.emit('get_secondary_password', { index: i })
}
rh.on('secondary_password', (d: any) => {
  const i = d?.index
  if (typeof i !== 'number' || !secs.value[i]) return
  secs.value[i] = { ...secs.value[i], password: d.password }
  shownPw[i] = true
})

// timeout
const timeoutDraft = ref<any>('')
watch(() => cfg.get('GENERAL', 'SECONDARY_TIMEOUT'), (v) => { timeoutDraft.value = v ?? '' }, { immediate: true })
function saveTimeout() {
  const n = Number(timeoutDraft.value)
  if (timeoutDraft.value === '' || Number.isNaN(n) || n < 0) {
    timeoutDraft.value = cfg.get('GENERAL', 'SECONDARY_TIMEOUT') ?? ''
    return
  }
  if (n === cfg.get('GENERAL', 'SECONDARY_TIMEOUT')) return
  cfg.set('GENERAL', 'SECONDARY_TIMEOUT', n)
  toast.add({ title: t('Setting saved'), description: t('Secondary Timeout (seconds)'), icon: 'i-lucide-check', color: 'success', duration: 1500 })
}

// ---------------------------------------------------------------- environment sensors
const READING_ORDER = ['voltage', 'current', 'power', 'capacity', 'temperature', 'humidity', 'pressure']
const READING_LABEL: Record<string, string> = {
  voltage: 'Voltage', current: 'Current', power: 'Power', capacity: 'Capacity', temperature: 'Temperature', humidity: 'Humidity', pressure: 'Pressure'
}
const READING_DECIMALS: Record<string, number> = { voltage: 2, current: 0, power: 0, capacity: 0, temperature: 1, humidity: 1, pressure: 1 }
const environment = computed(() => (Array.isArray(rh.state.environmental_data) ? rh.state.environmental_data : []).map((entry: any) => {
  const name = Object.keys(entry || {})[0] || ''
  const data = entry?.[name] || {}
  const keys = [...READING_ORDER.filter(k => k in data), ...Object.keys(data).filter(k => !READING_ORDER.includes(k))]
  return {
    name,
    readings: keys.map(k => ({
      key: k,
      label: t(READING_LABEL[k] || k),
      value: READING_DECIMALS[k] !== undefined && data[k]?.value !== null && data[k]?.value !== undefined ? Number(data[k].value).toFixed(READING_DECIMALS[k]) : String(data[k]?.value ?? '—'),
      units: data[k]?.units || ''
    }))
  }
}))

// SENSORS section editor: { address: { key: value } }
interface SensorDraft { address: string, items: { key: string, value: string, orig: any }[] }
const sensorDrafts = ref<SensorDraft[]>([])
watch(sensorsCfg, (s) => {
  sensorDrafts.value = Object.entries(s || {}).map(([address, items]) => ({
    address,
    items: Object.entries(items || {}).map(([key, value]) => ({ key, value: value === null || value === undefined ? '' : String(value), orig: value }))
  }))
}, { immediate: true })
const newSensor = ref('')
const newSensorKey = reactive<Record<number, string>>({})

function typed(item: { value: string, orig: any }) {
  if (typeof item.orig === 'number' && item.value.trim() !== '' && !Number.isNaN(Number(item.value))) return Number(item.value)
  if (typeof item.orig === 'boolean') return /^(true|1|yes)$/i.test(item.value.trim())
  return item.value
}
function saveSensors(drafts = sensorDrafts.value) {
  const value: Record<string, Record<string, any>> = {}
  for (const d of drafts) {
    const addr = d.address.trim()
    if (!addr) continue
    const items: Record<string, any> = {}
    for (const it of d.items) {
      if (it.key.trim()) items[it.key.trim()] = typed(it)
    }
    value[addr] = items
  }
  rh.emit('set_config_section', { section: 'SENSORS', value })
  sensorsCfg.value = value
  rh.refresh([{ type: 'config', value: { SENSORS: [] } }])
}
function addSensor() {
  const a = newSensor.value.trim()
  if (!a) return
  saveSensors([...sensorDrafts.value, { address: a, items: [] }])
  newSensor.value = ''
}
function addSensorKey(i: number) {
  const k = (newSensorKey[i] || '').trim()
  if (!k) return
  sensorDrafts.value[i]!.items.push({ key: k, value: '', orig: '' })
  newSensorKey[i] = ''
  saveSensors()
}
function removeSensorKey(i: number, j: number) {
  sensorDrafts.value[i]!.items.splice(j, 1)
  saveSensors()
}
const removeSensorTarget = ref<number | null>(null)
function removeSensor() {
  if (removeSensorTarget.value === null) return
  saveSensors(sensorDrafts.value.filter((_, j) => j !== removeSensorTarget.value))
  removeSensorTarget.value = null
}
</script>

<template>
  <div class="space-y-10">
    <!-- Cluster status -->
    <RhGroup :title="t('Cluster Status')">
      <div v-if="!status.length" class="flex items-center gap-3 px-4 py-6 text-sm text-muted">
        <UIcon name="i-lucide-network" class="size-5 text-dimmed" />
        {{ secs.length ? t('No cluster status available. Restart the server to connect new secondary timers.') : t('No secondary timers are set up.') }}
      </div>
      <div v-for="(s, i) in status" :key="`${s.address}-${i}`" class="space-y-3 px-4 py-4">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span class="relative flex size-2.5">
            <span v-if="contactInfo(s).connected" class="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-50" />
            <span class="relative inline-flex size-2.5 rounded-full" :class="contactInfo(s).connected ? 'bg-success' : 'bg-error'" />
          </span>
          <a :href="hrefFor(s.address)" target="_blank" rel="noopener" class="truncate font-medium text-highlighted hover:underline">{{ s.address }}</a>
          <UBadge :label="s.modeIndicator" color="neutral" variant="subtle" size="sm" />
          <div class="flex-1" />
          <UButton
            v-if="contactInfo(s).retryId !== null"
            :label="contactInfo(s).text"
            icon="i-lucide-refresh-cw"
            size="xs"
            color="warning"
            variant="soft"
            @click="retry(contactInfo(s).retryId!)"
          />
          <span v-else class="text-sm" :class="contactInfo(s).connected ? 'text-muted' : 'text-error'">
            {{ contactInfo(s).connected ? `${t('Last Contact')}: ${contactInfo(s).text}` : contactInfo(s).text }}
          </span>
        </div>
        <dl class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div class="rounded-xl bg-elevated/60 px-3 py-2">
            <dt class="text-[11px] text-muted">
              {{ t('Latency') }} · {{ t('last') }} / {{ t('avg') }}
            </dt>
            <dd class="tabular text-sm font-medium">
              {{ ms(s.lastLatencyMs) }} / {{ ms(s.avgLatencyMs) }} <span class="text-muted">{{ t('ms') }}</span>
            </dd>
            <dd class="tabular text-[11px] text-dimmed">
              {{ t('min') }} {{ ms(s.minLatencyMs) }} · {{ t('max') }} {{ ms(s.maxLatencyMs) }}
            </dd>
          </div>
          <div class="rounded-xl bg-elevated/60 px-3 py-2">
            <dt class="text-[11px] text-muted">
              {{ t('Availability') }}
            </dt>
            <dd class="tabular text-sm font-medium">
              {{ s.availability }}%
            </dd>
            <dd class="tabular text-[11px] text-dimmed">
              {{ t('Up') }} {{ duration(s.upTimeSecs) }} · {{ t('Down') }} {{ duration(s.downTimeSecs) }}
            </dd>
          </div>
          <div class="rounded-xl bg-elevated/60 px-3 py-2">
            <dt class="text-[11px] text-muted">
              {{ t('Contacts') }} / {{ t('Disconnects') }}
            </dt>
            <dd class="tabular text-sm font-medium">
              {{ s.numContacts }} / <span :class="s.numDisconnects ? 'text-warning' : ''">{{ s.numDisconnects }}</span>
            </dd>
          </div>
          <div class="rounded-xl bg-elevated/60 px-3 py-2">
            <dt class="text-[11px] text-muted">
              {{ t('Time Diff') }}
            </dt>
            <dd class="tabular text-sm font-medium">
              {{ ms(s.timeDiffMs) }} <span class="text-muted">{{ t('ms') }}</span>
            </dd>
          </div>
        </dl>
      </div>
    </RhGroup>

    <!-- Secondary timers -->
    <div class="space-y-6">
      <div class="px-1">
        <h2 class="font-display text-xl font-semibold text-highlighted">
          {{ t('Secondary Timers') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('Other RotorHazard timers on the network that this timer controls. Changes take effect after a restart.') }}
        </p>
      </div>

      <div v-if="!loaded" class="space-y-3">
        <USkeleton class="h-32 w-full rounded-2xl" />
      </div>

      <RhGroup v-for="(s, i) in secs" :key="i" :title="`${t('Secondary')} ${i + 1}`">
        <template #actions>
          <UButton icon="i-lucide-trash-2" :label="t('Remove')" size="xs" color="error" variant="ghost" @click="removeTarget = i" />
        </template>
        <RhRow :label="t('Address')">
          <UInput
            :model-value="s.address"
            placeholder="192.168.1.20:5000"
            class="w-full sm:w-64"
            @change="(e: Event) => setValue(i, 'address', (e.target as HTMLInputElement).value)"
          />
        </RhRow>
        <RhRow :label="t('Mode')" :description="MODES.find(m => m.value === (s.mode || 'split'))?.description">
          <USelect :model-value="s.mode || 'split'" :items="MODES" class="w-full sm:w-64" @update:model-value="(v: any) => setValue(i, 'mode', v)" />
        </RhRow>
        <RhRow v-for="k in extraKeys(s)" :key="k" :label="optionFor(k)?.label || k">
          <template v-if="optionFor(k)?.type === 'boolean'">
            <USwitch :model-value="!!s[k]" :aria-label="optionFor(k)?.label" @update:model-value="(v: boolean) => setValue(i, k, v)" />
          </template>
          <USelect
            v-else-if="Array.isArray(optionFor(k)?.type)"
            :model-value="s[k]"
            :items="(optionFor(k)!.type as any[])"
            class="w-full sm:w-64"
            @update:model-value="(v: any) => setValue(i, k, v)"
          />
          <UInput
            v-else
            :model-value="s[k] ?? ''"
            :type="optionFor(k)?.type === 'numeric' ? 'number' : optionFor(k)?.type === 'password' && !shownPw[i] ? 'password' : 'text'"
            step="any"
            class="w-full sm:w-64"
            :ui="optionFor(k)?.type === 'password' ? { trailing: 'pe-1' } : undefined"
            @change="(e: Event) => setValue(i, k, (e.target as HTMLInputElement).value)"
          >
            <template v-if="optionFor(k)?.type === 'password'" #trailing>
              <UButton
                color="neutral"
                variant="link"
                size="sm"
                :icon="shownPw[i] ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                :aria-label="shownPw[i] ? t('Hide password') : t('Show password')"
                @mousedown.prevent
                @click="togglePw(i)"
              />
            </template>
          </UInput>
          <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" :aria-label="t('Remove')" @click="removeKey(i, k)" />
        </RhRow>
        <div class="px-4 py-2">
          <UDropdownMenu :items="addKeyItems(s, i)" :content="{ align: 'start' }" :ui="{ content: 'max-h-80' }">
            <UButton :label="t('Add Setting')" icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" class="-ml-2" />
          </UDropdownMenu>
        </div>
      </RhGroup>

      <RhGroup :title="t('New Secondary')">
        <RhRow :label="t('Address')" :description="t('Host name or IP address, with the port if not 80')">
          <div class="flex w-full gap-2 sm:w-auto">
            <UInput v-model="newAddress" placeholder="192.168.1.20:5000" class="flex-1 sm:w-56" @keydown.enter="addSecondary" />
            <UButton icon="i-lucide-plus" :label="t('Add')" :disabled="!newAddress.trim()" @click="addSecondary" />
          </div>
        </RhRow>
      </RhGroup>

      <RhGroup>
        <RhRow :label="t('Secondary Timeout (seconds)')" :description="t('How long to keep trying to reach a secondary timer that cannot be found.')">
          <UInput v-model="timeoutDraft" type="number" min="0" class="w-full sm:w-40" @change="saveTimeout" @keydown.enter="saveTimeout" />
        </RhRow>
      </RhGroup>
    </div>

    <!-- Environment sensors -->
    <div class="space-y-6">
      <div class="px-1">
        <h2 class="font-display text-xl font-semibold text-highlighted">
          {{ t('Environment Sensors') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('Voltage, current and temperature sensors attached to the timer.') }}
        </p>
      </div>

      <RhGroup :title="t('Environment Status')">
        <div v-if="!environment.length" class="flex items-center gap-3 px-4 py-6 text-sm text-muted">
          <UIcon name="i-lucide-thermometer" class="size-5 text-dimmed" />
          {{ t('No environment status available.') }}
        </div>
        <RhRow v-for="e in environment" :key="e.name" :label="t(e.name)" icon="i-lucide-gauge">
          <div class="flex flex-wrap justify-end gap-2">
            <span v-for="r in e.readings" :key="r.key" class="rounded-lg bg-elevated/70 px-2.5 py-1 text-sm">
              <span class="text-muted">{{ r.label }}</span>
              <span class="tabular ml-1.5 font-medium text-highlighted">{{ r.value }}{{ r.units }}</span>
            </span>
          </div>
        </RhRow>
      </RhGroup>

      <RhGroup v-for="(sd, i) in sensorDrafts" :key="i" :title="`${t('Sensor')} ${i + 1}`">
        <template #actions>
          <UButton icon="i-lucide-trash-2" :label="t('Remove')" size="xs" color="error" variant="ghost" @click="removeSensorTarget = i" />
        </template>
        <RhRow :label="t('Address')">
          <UInput v-model="sd.address" class="w-full sm:w-64" @change="saveSensors()" @keydown.enter="saveSensors()" />
        </RhRow>
        <div v-for="(it, j) in sd.items" :key="j" class="flex items-center gap-2 px-4 py-2.5">
          <UInput v-model="it.key" :placeholder="t('key')" class="w-1/3 sm:w-48" variant="soft" @change="saveSensors()" />
          <UInput v-model="it.value" :placeholder="t('value')" class="flex-1" @change="saveSensors()" @keydown.enter="saveSensors()" />
          <UButton icon="i-lucide-x" size="sm" color="neutral" variant="ghost" :aria-label="t('Remove')" @click="removeSensorKey(i, j)" />
        </div>
        <div class="flex items-center gap-2 px-4 py-2.5">
          <UInput v-model="newSensorKey[i]" :placeholder="t('New Key')" class="w-1/3 sm:w-48" @keydown.enter="addSensorKey(i)" />
          <UButton icon="i-lucide-plus" size="sm" color="neutral" variant="ghost" :label="t('Add')" :disabled="!(newSensorKey[i] || '').trim()" @click="addSensorKey(i)" />
        </div>
      </RhGroup>

      <RhGroup :title="t('New Sensor')" :footer="t('Changes to sensor settings take effect after a restart.')">
        <RhRow :label="t('Address')" :description="t('I2C address, e.g. 0x40')">
          <div class="flex w-full gap-2 sm:w-auto">
            <UInput v-model="newSensor" placeholder="0x40" class="flex-1 sm:w-56" @keydown.enter="addSensor" />
            <UButton icon="i-lucide-plus" :label="t('Add')" :disabled="!newSensor.trim()" @click="addSensor" />
          </div>
        </RhRow>
      </RhGroup>
    </div>

    <UModal
      :open="removeTarget !== null"
      :title="t('Remove secondary timer?')"
      :description="removeTarget !== null ? `${secs[removeTarget]?.address || ''} ${t('will no longer be controlled by this timer after a restart.')}` : ''"
      @update:open="(o: boolean) => { if (!o) removeTarget = null }"
    >
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" icon="i-lucide-trash-2" :label="t('Remove')" @click="removeSecondary" />
        </div>
      </template>
    </UModal>

    <UModal
      :open="removeSensorTarget !== null"
      :title="t('Remove sensor?')"
      :description="removeSensorTarget !== null ? `${sensorDrafts[removeSensorTarget]?.address || ''}` : ''"
      @update:open="(o: boolean) => { if (!o) removeSensorTarget = null }"
    >
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" icon="i-lucide-trash-2" :label="t('Remove')" @click="removeSensor" />
        </div>
      </template>
    </UModal>
  </div>
</template>
