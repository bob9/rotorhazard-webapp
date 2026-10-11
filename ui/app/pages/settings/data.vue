<script setup lang="ts">
/**
 * Settings › Data & Backups: the event database (backup, archive / new event,
 * archived events, import, export) and the server settings file (backup,
 * download, restore, rename, delete, load, reset to defaults).
 */
const rh = useRH()
const { t } = useI18n()
const dataTools = useTools().tools(['database'])
const { info } = useServerInfo()
const toast = useToast()

rh.load(['backups_list', 'upd_cfg_files_list', 'importer_list', 'exporter_list'])

// ---------------------------------------------------------------- confirm dialog
interface ConfirmOptions {
  title: string
  description?: string
  label: string
  color?: 'error' | 'primary' | 'warning'
  icon?: string
  action: () => void
}
const confirm = reactive({ open: false, title: '', description: '', label: '', color: 'error' as ConfirmOptions['color'], icon: '', action: (() => {}) as () => void })
function ask(o: ConfirmOptions) {
  Object.assign(confirm, { description: '', color: 'error', icon: '', ...o, open: true })
}
function confirmed() {
  confirm.open = false
  confirm.action()
}

// progress overlay (restore / import); cleared by a failure message or page reload
const progress = ref<string | null>(null)
let progressTimer: ReturnType<typeof setTimeout> | undefined
function showProgress(text: string) {
  progress.value = text
  clearTimeout(progressTimer)
  progressTimer = setTimeout(() => { progress.value = null }, 120000)
}
rh.on('priority_message', () => {
  progress.value = null
  importing.value = false
})
onBeforeUnmount(() => clearTimeout(progressTimer))

// ---------------------------------------------------------------- event database
const backingUp = ref(false)
function backupDatabase() {
  backingUp.value = true
  rh.emit('backup_database')
  setTimeout(() => { backingUp.value = false }, 8000)
}
rh.on('database_bkp_done', (d: any) => {
  backingUp.value = false
  if (!d?.file_data) return
  saveBase64File(d.file_name, d.file_data)
  toast.add({ title: t('Database saved'), description: d.file_name, icon: 'i-lucide-check-circle', color: 'success' })
})

interface Backup { file: string, title: string, date: Date | null, auto: boolean }
const backups = computed<Backup[]>(() => (rh.state.backups_list?.backup_files || []).map((file: string) => {
  const auto = file.startsWith('autoBkp_')
  const p = parseBackupName(auto ? file.slice(8) : file)
  const generic = auto || p.name === 'database' || p.name === ''
  return { file, auto, date: p.date, title: generic ? (auto ? t('Automatic backup') : t('Manual backup')) : p.name }
}).sort((a: Backup, b: Backup) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || a.file.localeCompare(b.file)))
const archives = computed(() => backups.value.filter(b => !b.auto))
const autoBackups = computed(() => backups.value.filter(b => b.auto))
const showAuto = ref(false)
const showAllArchives = ref(false)
const visibleArchives = computed(() => showAllArchives.value ? archives.value : archives.value.slice(0, 6))

const dateFmt = computed(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }))
const formatDate = (d: Date | null) => d ? dateFmt.value.format(d) : ''

function backupMenu(b: Backup) {
  return [[
    { label: t('Download Event Database'), icon: 'i-lucide-download', onSelect: () => rh.emit('download_database', { event_file: b.file }) }
  ], [
    { label: t('Delete Event'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => ask({
      title: t('Delete Event'),
      description: `${b.file} — ${t('Deleted event database files are not recoverable. Are you sure?')}`,
      label: t('Delete Event'),
      icon: 'i-lucide-trash-2',
      action: () => rh.emit('delete_database', { backup_file: b.file })
    }) }
  ]]
}
function restoreBackup(b: Backup) {
  ask({
    title: t('Restore Event'),
    description: `${b.file} — ${t('Restoring overwrites all current data. Are you sure?')}`,
    label: t('Restore Event'),
    icon: 'i-lucide-history',
    action: () => {
      showProgress(t('Data restore in progress. Please wait...'))
      rh.emit('restore_database', { backup_file: b.file })
    }
  })
}
rh.on('database_delete_done', (d: any) => {
  toast.add({ title: t('Event deleted'), description: d?.file_name, icon: 'i-lucide-trash-2', color: 'neutral' })
})

// archive / new event
const resetOpen = ref(false)
const resetType = ref('all')
const resetTypes = computed(() => [
  { value: 'races', label: t('Races'), description: t('Keep pilots, heats, classes and formats') },
  { value: 'heats', label: t('Races and Heats'), description: t('Keep pilots, classes and formats') },
  { value: 'classes', label: t('Races, Heats, and Classes'), description: t('Keep pilots and formats') },
  { value: 'pilots', label: t('Races, Heats, and Pilots'), description: t('Keep classes and formats') },
  { value: 'all', label: t('Races, Heats, Classes, and Pilots'), description: t('Start over with only race formats') },
  { value: 'formats', label: t('Races and Race Formats'), description: t('Keep pilots, heats and classes') }
])
const resetConfirmClear = ref(false)
function doReset(withArchive: boolean) {
  rh.emit('reset_database', { with_archive: withArchive, reset_type: resetType.value })
  resetOpen.value = false
  resetConfirmClear.value = false
  if (withArchive) toast.add({ title: t('Event archived'), description: t('A new event has been started.'), icon: 'i-lucide-archive', color: 'success' })
}
watch(resetOpen, (o) => { if (!o) resetConfirmClear.value = false })
rh.on('reset_confirm', () => {
  toast.add({ title: t('Data Cleared'), icon: 'i-lucide-eraser', color: 'neutral' })
})

// ---------------------------------------------------------------- import
const importers = computed<any[]>(() => rh.state.importer_list?.importers || [])
const importer = ref<string | undefined>()
watch(importers, (list) => {
  if (!list.some(i => i.name === importer.value)) importer.value = list[0]?.name
}, { immediate: true })
const importerItems = computed(() => importers.value.map(i => ({ label: t(i.label), value: i.name })))
const selectedImporter = computed(() => importers.value.find(i => i.name === importer.value))
const importParams = ref<Record<string, any>>({})
watch(selectedImporter, (imp) => {
  const p: Record<string, any> = {}
  for (const f of imp?.settings || []) p[f.name] = f.value
  importParams.value = p
}, { immediate: true })
const importFile = ref<File | null>(null)
const importing = ref(false)
const MAX_IMPORT = 50 * 1024 * 1024
const importTooLarge = computed(() => (importFile.value?.size || 0) > MAX_IMPORT)

function startImport() {
  if (!selectedImporter.value || !importFile.value) return
  ask({
    title: t('Import Data'),
    description: `${t(selectedImporter.value.label)} · ${importFile.value.name} — ${t('Importing can overwrite current event data. Are you sure?')}`,
    label: t('Import Data'),
    icon: 'i-lucide-file-input',
    action: runImport
  })
}
async function runImport() {
  if (!selectedImporter.value || !importFile.value) return
  importing.value = true
  try {
    const buffer = await importFile.value.arrayBuffer()
    showProgress(t('Data import in progress. Please wait...'))
    rh.emit('import_data', { importer: selectedImporter.value.name, params: { ...importParams.value }, source_data: buffer })
  } catch {
    importing.value = false
    toast.add({ title: t('Data import failed.'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

// ---------------------------------------------------------------- export
const exporters = computed<any[]>(() => rh.state.exporter_list?.exporters || [])
const exporter = ref<string | undefined>()
watch(exporters, (list) => {
  if (!list.some(e => e.name === exporter.value)) exporter.value = list[0]?.name
}, { immediate: true })
const exporterItems = computed(() => exporters.value.map(e => ({ label: t(e.label), value: e.name })))
const exporting = ref(false)
function runExport() {
  if (!exporter.value) return
  exporting.value = true
  rh.emit('export_database', { exporter: exporter.value })
  setTimeout(() => { exporting.value = false }, 15000)
}
rh.on('exported_data', (d: any) => {
  exporting.value = false
  if (!d) return
  saveBlob(new Blob([d.data], { type: d.encoding || 'application/octet-stream' }), d.filename)
  toast.add({ title: t('Export complete'), description: d.filename, icon: 'i-lucide-check-circle', color: 'success' })
})
rh.on('priority_message', () => { exporting.value = false })

// ---------------------------------------------------------------- server settings file
const cfgFiles = computed<string[]>(() => [...(rh.state.upd_cfg_files_list?.cfg_files || [])].sort().reverse())
const cfgSelected = computed<string | null>(() => rh.state.upd_cfg_files_list?.select_file || null)
const cfgLimit = ref(true)
const visibleCfgFiles = computed(() => cfgLimit.value ? cfgFiles.value.slice(0, 6) : cfgFiles.value)
function cfgDate(f: string) {
  return parseBackupName(f.replace(/_bkp_/, '_')).date
}

function backupSettings() {
  rh.emit('backup_settings')
}
function downloadSettings() {
  rh.emit('download_settings')
}
rh.on('send_config_file', (d: any) => {
  if (!d?.file_data) return
  saveBase64File(d.file_name, d.file_data, 'application/json')
  toast.add({ title: t('Settings downloaded'), description: d.file_name, icon: 'i-lucide-check-circle', color: 'success' })
})

function restoreCfg(f: string) {
  ask({
    title: t('Restore Settings File'),
    description: `${f} — ${t('All settings will be overwritten and the server will restart. Are you sure?')}`,
    label: t('Restore Settings'),
    icon: 'i-lucide-history',
    action: () => rh.emit('restore_cfg_file', { cfg_file: f })
  })
}
function deleteCfg(f: string) {
  ask({
    title: t('Delete Settings File'),
    description: `${f} — ${t('Deleted settings files are not recoverable. Are you sure?')}`,
    label: t('Delete File'),
    icon: 'i-lucide-trash-2',
    action: () => rh.emit('delete_cfg_file', { cfg_file: f })
  })
}
const rename = reactive({ open: false, file: '', name: '' })
function openRename(f: string) {
  Object.assign(rename, { open: true, file: f, name: f })
}
function doRename() {
  const name = rename.name.trim()
  if (name && name !== rename.file) rh.emit('rename_cfg_file', { cfg_file: rename.file, new_name: name })
  rename.open = false
}
function cfgMenu(f: string) {
  return [[
    { label: t('Rename Settings File'), icon: 'i-lucide-pencil', onSelect: () => openRename(f) }
  ], [
    { label: t('Delete Settings File'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => deleteCfg(f) }
  ]]
}

const cfgUpload = ref<File | null>(null)
const cfgInput = ref<HTMLInputElement | null>(null)
function onCfgPicked(e: Event) {
  cfgUpload.value = (e.target as HTMLInputElement).files?.[0] || null
}
function clearCfgUpload() {
  cfgUpload.value = null
  if (cfgInput.value) cfgInput.value.value = ''
}
function loadCfgFile() {
  const file = cfgUpload.value
  if (!file) return
  ask({
    title: t('Load Settings'),
    description: `${file.name} — ${t('All settings will be overwritten and the server will restart. Are you sure?')}`,
    label: t('Load Settings'),
    icon: 'i-lucide-upload',
    action: async () => {
      const text = await file.text()
      try {
        JSON.parse(text)
      } catch {
        toast.add({ title: t('Error loading settings file: '), description: t('The file is not valid JSON.'), color: 'error', icon: 'i-lucide-circle-alert' })
        return
      }
      rh.emit('load_cfg_file', { file_name: file.name, file_data: text })
      clearCfgUpload()
    }
  })
}
function resetSettings() {
  ask({
    title: t('Reset All Settings to Defaults'),
    description: t('All settings will be reset to default values and the server will restart. Are you sure?'),
    label: t('Reset Settings to Defaults'),
    icon: 'i-lucide-rotate-ccw',
    action: () => rh.emit('reset_settings_to_defaults')
  })
}
</script>

<template>
  <div class="space-y-10">
    <!-- Event database -->
    <div class="space-y-6">
      <RhGroup :title="t('Event Database')">
        <RhRow
          icon="i-lucide-archive"
          :label="t('Archive/New Event')"
          :description="t('Archiving saves all current data and creates a new event.')"
        >
          <UButton :label="t('New Event…')" icon="i-lucide-sparkles" color="neutral" variant="outline" @click="resetOpen = true" />
        </RhRow>
        <RhRow
          icon="i-lucide-hard-drive-download"
          :label="t('Backup/Download Database')"
          :description="t('Saves a copy of the event database on the timer and downloads it.')"
        >
          <UButton :label="t('Back Up Now')" icon="i-lucide-download" :loading="backingUp" @click="backupDatabase" />
        </RhRow>
        <RhRow v-for="tool in dataTools" :key="tool.key" :to="tool.to" :icon="tool.icon" :label="tool.label" :description="tool.description" />
      </RhGroup>

      <RhGroup :title="t('Archived Events')" :description="t('Earlier events and manual backups saved on the timer.')">
        <div v-if="!rh.state.backups_list" class="space-y-2 p-4">
          <USkeleton class="h-5 w-1/2" />
          <USkeleton class="h-5 w-1/3" />
        </div>
        <div v-else-if="!archives.length" class="flex items-center gap-3 px-4 py-6 text-sm text-muted">
          <UIcon name="i-lucide-archive" class="size-5 text-dimmed" />
          {{ t('No Saved Databases') }}
        </div>
        <template v-else>
          <RhRow v-for="b in visibleArchives" :key="b.file" icon="i-lucide-database">
            <template #label>
              <span class="block truncate">{{ b.title }}</span>
              <span class="mt-0.5 block truncate text-[13px] font-normal text-muted">
                <template v-if="b.date">{{ formatDate(b.date) }} · </template><span class="font-mono text-xs">{{ b.file }}</span>
              </span>
            </template>
            <UButton :label="t('Restore')" icon="i-lucide-history" size="sm" color="neutral" variant="soft" @click="restoreBackup(b)" />
            <UDropdownMenu :items="backupMenu(b)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" size="sm" color="neutral" variant="ghost" :aria-label="t('More')" />
            </UDropdownMenu>
          </RhRow>
          <button
            v-if="archives.length > 6"
            type="button"
            class="w-full px-4 py-3 text-left text-sm font-medium text-primary hover:bg-elevated/60"
            @click="showAllArchives = !showAllArchives"
          >
            {{ showAllArchives ? t('Show fewer') : `${t('Show all')} (${archives.length})` }}
          </button>
        </template>
      </RhGroup>

      <RhGroup v-if="autoBackups.length" :title="t('Automatic Backups')" :description="t('Created each time the server starts.')">
        <RhRow icon="i-lucide-clock" :label="`${autoBackups.length} ${autoBackups.length === 1 ? t('backup') : t('backups')}`" :description="autoBackups[0] ? `${t('Latest')}: ${formatDate(autoBackups[0].date)}` : undefined">
          <UButton :label="showAuto ? t('Hide') : t('Show')" :trailing-icon="showAuto ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" size="sm" color="neutral" variant="ghost" @click="showAuto = !showAuto" />
        </RhRow>
        <template v-if="showAuto">
          <RhRow v-for="b in autoBackups" :key="b.file">
            <template #label>
              <span class="block truncate pl-8 text-sm">{{ formatDate(b.date) || b.file }}</span>
              <span class="block truncate pl-8 font-mono text-xs font-normal text-muted">{{ b.file }}</span>
            </template>
            <UButton :label="t('Restore')" icon="i-lucide-history" size="sm" color="neutral" variant="soft" @click="restoreBackup(b)" />
            <UDropdownMenu :items="backupMenu(b)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" size="sm" color="neutral" variant="ghost" :aria-label="t('More')" />
            </UDropdownMenu>
          </RhRow>
        </template>
      </RhGroup>
    </div>

    <!-- Import / export -->
    <div class="space-y-6">
      <RhGroup :title="t('Import')" :description="t('Bring in pilots, heats, classes, formats or a whole event.')">
        <RhRow :label="t('Importer')">
          <USelect v-model="importer" :items="importerItems" :placeholder="t('No Importers')" :disabled="!importerItems.length" class="w-full sm:w-64" />
        </RhRow>
        <RhField
          v-for="f in selectedImporter?.settings || []"
          :key="`${importer}-${f.name}`"
          :field="f"
          :model-value="importParams[f.name]"
          @update:model-value="(v: any) => importParams[f.name] = v"
        />
        <div class="px-4 py-3">
          <UFileUpload
            v-model="importFile"
            :label="t('Data Source')"
            :description="t('Drop a file here or click to browse (50 MB max)')"
            icon="i-lucide-file-up"
            layout="list"
            class="w-full"
            :ui="{ base: 'min-h-28' }"
          />
          <p v-if="importTooLarge" class="mt-2 text-sm text-error">
            {{ t('File is too large (50 MB max).') }}
          </p>
        </div>
        <div class="flex justify-end px-4 py-3">
          <UButton
            :label="t('Import Data')"
            icon="i-lucide-file-input"
            color="error"
            variant="soft"
            :disabled="!importFile || !selectedImporter || importTooLarge"
            :loading="importing"
            @click="startImport"
          />
        </div>
      </RhGroup>

      <RhGroup :title="t('Export')" :description="t('Download event data for spreadsheets, websites or another timer.')">
        <RhRow :label="t('Exporter')">
          <USelect v-model="exporter" :items="exporterItems" :placeholder="t('No Exporters')" :disabled="!exporterItems.length" class="w-full sm:w-64" />
        </RhRow>
        <div class="flex justify-end px-4 py-3">
          <UButton :label="t('Export Data')" icon="i-lucide-file-output" :disabled="!exporter" :loading="exporting" @click="runExport" />
        </div>
      </RhGroup>
    </div>

    <!-- Server settings file -->
    <div class="space-y-6">
      <RhGroup :title="t('Backup/Restore Settings')" :description="t('The server settings file (config.json): hardware, interface and secondary timer settings. It does not contain event data.')">
        <RhRow icon="i-lucide-save" :label="t('Backup Settings')" :description="t('Save a copy of the current settings on the timer.')">
          <UButton :label="t('Backup Settings')" color="neutral" variant="outline" @click="backupSettings" />
        </RhRow>
        <RhRow icon="i-lucide-download" :label="t('Download Settings')" :description="t('Save a copy and download it to this device.')">
          <UButton :label="t('Download')" icon="i-lucide-download" color="neutral" variant="outline" @click="downloadSettings" />
        </RhRow>
        <RhRow icon="i-lucide-upload" :label="t('Import File')" :description="t('Select Settings File to Load')" stacked>
          <div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <input ref="cfgInput" type="file" accept=".json,application/json" class="hidden" @change="onCfgPicked">
            <div class="flex min-w-0 flex-1 items-center gap-3">
              <UButton :label="t('Choose File…')" icon="i-lucide-file-json" color="neutral" variant="outline" @click="cfgInput?.click()" />
              <span class="truncate text-sm" :class="cfgUpload ? 'text-highlighted' : 'text-muted'">{{ cfgUpload?.name || t('No file selected') }}</span>
              <UButton v-if="cfgUpload" icon="i-lucide-x" size="xs" color="neutral" variant="ghost" :aria-label="t('Remove')" @click="clearCfgUpload" />
            </div>
            <UButton :label="t('Load Settings')" color="error" variant="soft" :disabled="!cfgUpload" class="self-end sm:self-auto" @click="loadCfgFile" />
          </div>
        </RhRow>
        <RhRow icon="i-lucide-rotate-ccw" :label="t('Reset All Settings to Defaults')" :description="t('Backs up the current settings, then restarts the server with default settings.')">
          <UButton :label="t('Reset…')" color="error" variant="soft" @click="resetSettings" />
        </RhRow>
      </RhGroup>

      <RhGroup :title="t('Saved Settings Files')">
        <div v-if="!cfgFiles.length" class="flex items-center gap-3 px-4 py-6 text-sm text-muted">
          <UIcon name="i-lucide-file-cog" class="size-5 text-dimmed" />
          {{ t('No Saved Settings Files') }}
        </div>
        <template v-else>
          <RhRow v-for="f in visibleCfgFiles" :key="f" icon="i-lucide-file-cog">
            <template #label>
              <span class="flex items-center gap-2">
                <span class="truncate font-mono text-sm">{{ f }}</span>
                <UBadge v-if="f === cfgSelected" :label="t('New')" size="sm" color="success" variant="subtle" />
              </span>
              <span v-if="cfgDate(f)" class="mt-0.5 block text-[13px] font-normal text-muted">{{ formatDate(cfgDate(f)) }}</span>
            </template>
            <UButton :label="t('Restore')" icon="i-lucide-history" size="sm" color="neutral" variant="soft" @click="restoreCfg(f)" />
            <UDropdownMenu :items="cfgMenu(f)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis" size="sm" color="neutral" variant="ghost" :aria-label="t('More')" />
            </UDropdownMenu>
          </RhRow>
          <button
            v-if="cfgFiles.length > 6"
            type="button"
            class="w-full px-4 py-3 text-left text-sm font-medium text-primary hover:bg-elevated/60"
            @click="cfgLimit = !cfgLimit"
          >
            {{ cfgLimit ? `${t('Show all')} (${cfgFiles.length})` : t('Show fewer') }}
          </button>
        </template>
      </RhGroup>
    </div>

    <!-- Archive / new event -->
    <UModal v-model:open="resetOpen" :title="t('Archive/New Event')" :description="t('Archiving saves all current data and creates a new event.')" :ui="{ content: 'sm:max-w-lg' }">
      <template #body>
        <div class="space-y-4">
          <div class="text-[13px] font-semibold uppercase tracking-wide text-muted">
            {{ t('Items to Clear') }}
          </div>
          <URadioGroup v-model="resetType" :items="resetTypes" variant="table" />
          <UAlert
            v-if="resetConfirmClear"
            color="error"
            variant="subtle"
            icon="i-lucide-triangle-alert"
            :title="t('Clearing data without archiving is not recoverable.')"
            :description="t('Press Clear Data Only again to continue.')"
          />
        </div>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" class="justify-center" @click="close" />
          <div class="flex-1" />
          <UButton
            color="error"
            :variant="resetConfirmClear ? 'solid' : 'soft'"
            :label="t('Clear Data Only')"
            class="justify-center"
            @click="resetConfirmClear ? doReset(false) : (resetConfirmClear = true)"
          />
          <UButton :label="t('Archive Event')" icon="i-lucide-archive" class="justify-center" @click="doReset(true)" />
        </div>
      </template>
    </UModal>

    <!-- Rename settings file -->
    <UModal v-model:open="rename.open" :title="t('Rename Settings File')">
      <template #body>
        <UFormField :label="t('Enter New File Name:')">
          <UInput v-model="rename.name" class="w-full" autofocus @keydown.enter="doRename" />
        </UFormField>
      </template>
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton :label="t('Rename File')" :disabled="!rename.name.trim() || rename.name.trim() === rename.file" @click="doRename" />
        </div>
      </template>
    </UModal>

    <!-- Generic confirmation -->
    <UModal v-model:open="confirm.open" :title="confirm.title" :description="confirm.description">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton :color="confirm.color" :icon="confirm.icon || undefined" :label="confirm.label" @click="confirmed" />
        </div>
      </template>
    </UModal>

    <!-- Progress -->
    <UModal :open="!!progress" :dismissible="false" :close="false" :title="t('Please wait')" :ui="{ content: 'sm:max-w-sm' }">
      <template #body>
        <div class="flex items-center gap-3">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin text-primary" />
          <span class="text-sm">{{ progress }}</span>
        </div>
      </template>
    </UModal>
  </div>
</template>
