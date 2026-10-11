<script setup lang="ts">
// Plugins manager: installed plugins, upload, community plugin directory and plugin settings.
const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Plugins')) })
const toast = useToast()
const route = useRoute()
const router = useRouter()

interface InstalledPlugin {
  id: string
  /** deleted since the server started (still loaded until a restart) */
  removed?: boolean
  name: string | null
  author: string | null
  author_uri: string | null
  description: string | null
  documentation_uri: string | null
  info_uri: string | null
  license: string | null
  license_uri: string | null
  version: string | null
  required_rhapi_version: string | null
  update_status: number | null
  enabled: boolean
  loaded: boolean
  load_issue: string | null
}

interface RemotePlugin {
  manifest: {
    domain: string
    name: string
    description?: string | null
    required_rhapi_version?: string | null
    version?: string | null
    author?: string | null
    author_uri?: string | null
    documentation_uri?: string | null
    info_uri?: string | null
    license?: string | null
    license_uri?: string | null
  }
  releases?: { tag_name: string, published_at: string, prerelease: boolean }[]
  repository?: string
  last_version?: string | null
  last_prerelease?: string | null
  update_status: number
  rh_version_supported: boolean
}

// update_status values (util/plugin_installation.py _PluginStatus)
const PRE_RELEASE_UPDATE = 3
const RELEASE_UPDATE = 4
const NO_UPDATE = 5
const hasUpdate = (s: number | null | undefined) => s === PRE_RELEASE_UPDATE || s === RELEASE_UPDATE

rh.load(['plugin_list', { type: 'config', value: { PLUGINS: ['UPDATE_BEHAVIOR', 'SHOW_RELEASES'] } }])

/* ---------------------------------------------------------------- tabs -- */

const tab = computed({
  get: () => (route.query.tab === 'discover' ? 'discover' : 'installed'),
  set: v => router.replace({ query: { ...route.query, tab: v === 'installed' ? undefined : v } })
})

// the community directory is fetched from the internet by the timer: only ask when it is wanted
watch(tab, (v) => {
  if (v === 'discover') rh.load(['plugin_repo'])
}, { immediate: true })

/* ----------------------------------------------------------- installed -- */

// plugins switched off on purpose (folder name starting with '_') aren't errors
const isDeactivated = (p: InstalledPlugin) => !p.loaded && /leading underscore|disabled/i.test(p.load_issue || '')
const installed = computed<InstalledPlugin[]>(() => [...(rh.state.plugin_list?.plugins || [])]
  .sort((a: InstalledPlugin, b: InstalledPlugin) => Number(isDeactivated(a)) - Number(isDeactivated(b))
    || (a.name || a.id).localeCompare(b.name || b.id, undefined, { sensitivity: 'base' })))
// the installed list can be long (dozens of plugins): filter by name, description or author
const installedQuery = ref('')
const shownInstalled = computed(() => {
  const q = installedQuery.value.trim().toLowerCase()
  if (!q) return installed.value
  return installed.value.filter(p => [p.name, p.id, p.description, p.author].some(v => (v || '').toLowerCase().includes(q)))
})
// "/" jumps to the search box of the open tab
const installedSearch = useTemplateRef<any>('installedSearch')
const discoverSearch = useTemplateRef<any>('discoverSearch')
defineShortcuts({
  '/': () => (tab.value === 'installed' ? installedSearch.value : discoverSearch.value)?.inputRef?.focus()
})
// deleted since the server started: the server's plugin list says so, or (from the web app
// plugin on a stock server) /app-info does
const isRemoved = (p: InstalledPlugin) => !!p.removed || !!serverInfoState.value?.removed_plugins?.includes(p.id)
const removedIds = computed(() => new Set(installed.value.filter(isRemoved).map(p => p.id)))
const installedIds = computed(() => new Set(installed.value.filter(p => !isRemoved(p)).map(p => p.id)))
const updatesAvailable = computed(() => installed.value.filter(p => hasUpdate(p.update_status)).length)

const tabs = computed(() => [
  { label: t('Installed'), value: 'installed', icon: 'i-lucide-package-check', badge: updatesAvailable.value
    ? { label: String(updatesAvailable.value), color: 'primary' as const, variant: 'solid' as const }
    : installed.value.length ? { label: String(installed.value.length), color: 'neutral' as const, variant: 'subtle' as const } : undefined },
  { label: t('Discover'), value: 'discover', icon: 'i-lucide-compass' }
])

/* ----------------------------------------------- install/delete tracking -- */

// Server replies only with a priority message (and a plugin_repo broadcast after a successful install).
const pending = ref<{ kind: 'install' | 'delete' | 'upload', domain: string } | null>(null)
const changed = reactive<Record<string, 'installed' | 'deleted'>>({})
// installed plugin descriptions are clamped to two lines until expanded; 'More' is offered
// when a description is actually cut short (measured, so it follows the screen width)
const expanded = reactive<Record<string, boolean>>({})
const clamped = reactive<Record<string, boolean>>({})
const descIds = new WeakMap<Element, string>()
function measureDesc(el: Element) {
  const id = descIds.get(el)
  if (id && !expanded[id]) clamped[id] = el.scrollHeight > el.clientHeight + 1
}
const descRO = import.meta.client && typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(entries => entries.forEach(e => measureDesc(e.target)))
  : undefined
function descRef(r: any, id: string) {
  const el: Element | undefined = r?.$el ?? r
  if (!(el instanceof Element) || descIds.get(el) === id) return
  descIds.set(el, id)
  descRO?.observe(el)
}
onBeforeUnmount(() => descRO?.disconnect())
const uploadDone = ref(false)
let pendingTimer: ReturnType<typeof setTimeout> | undefined

function startPending(kind: 'install' | 'delete' | 'upload', domain: string) {
  pending.value = { kind, domain }
  clearTimeout(pendingTimer)
  // downloads can be slow, but never leave a spinner forever
  pendingTimer = setTimeout(() => { pending.value = null }, 120000)
}

function finishPending(ok: boolean) {
  const p = pending.value
  if (!p) return
  pending.value = null
  clearTimeout(pendingTimer)
  if (!ok) return
  if (p.kind === 'upload') {
    uploadDone.value = true
    uploadFile.value = null
  } else {
    changed[p.domain] = p.kind === 'delete' ? 'deleted' : 'installed'
  }
}

rh.on('plugin_repo', () => {
  if (pending.value && pending.value.kind !== 'delete') finishPending(true)
})
rh.on('priority_message', (d: any) => {
  if (!pending.value) return
  const msg = String(d?.message || '')
  const failed = [t('Plugin install failed'), t('Plugin deletion failed')].some(f => msg.startsWith(f))
  // a successful install has already been settled by plugin_repo
  if (failed || pending.value.kind === 'delete') finishPending(!failed)
})
onBeforeUnmount(() => clearTimeout(pendingTimer))

function install(domain: string, tag?: string) {
  if (pending.value) return
  startPending('install', domain)
  rh.emit('plugin_install', tag ? { method: 'domain', domain, tag } : { method: 'domain', domain })
}

const deleteTarget = ref<InstalledPlugin | null>(null)
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (v) => { if (!v) deleteTarget.value = null }
})
function confirmDelete() {
  const p = deleteTarget.value
  deleteTarget.value = null
  if (!p || pending.value) return
  startPending('delete', p.id)
  rh.emit('plugin_delete', { domain: p.id })
}

const isBusy = (domain: string) => pending.value?.domain === domain

function installedMenu(p: InstalledPlugin) {
  return [
    [
      ...(p.update_status === NO_UPDATE || hasUpdate(p.update_status)
        ? [{ label: t('Reinstall'), icon: 'i-lucide-refresh-cw', disabled: !!pending.value, onSelect: () => install(p.id) }]
        : []),
      ...(p.documentation_uri ? [{ label: t('Documentation'), icon: 'i-lucide-book-open', to: p.documentation_uri, target: '_blank' }] : []),
      ...(p.info_uri ? [{ label: t('Website'), icon: 'i-lucide-globe', to: p.info_uri, target: '_blank' }] : []),
      ...(p.license_uri ? [{ label: t('License'), icon: 'i-lucide-scale', to: p.license_uri, target: '_blank' }] : [])
    ],
    [{ label: t('Delete'), icon: 'i-lucide-trash-2', color: 'error' as const, disabled: !!pending.value, onSelect: () => { deleteTarget.value = p } }]
  ].filter(g => g.length)
}

// main button of an installed plugin row (Update, or progress while busy)
function rowAction(p: InstalledPlugin) {
  if (hasUpdate(p.update_status)) {
    return { label: t('Update'), color: 'primary' as const, loading: isBusy(p.id), disabled: !!pending.value && !isBusy(p.id), onClick: () => install(p.id) }
  }
  if (isBusy(p.id)) {
    return { label: pending.value?.kind === 'delete' ? t('Deleting…') : t('Installing…'), color: 'neutral' as const, variant: 'soft' as const, loading: true }
  }
  return null
}

/* -------------------------------------------------------------- upload -- */

const uploadFile = ref<File | null>(null)
const MAX_UPLOAD = 50 * 1024 * 1024
const uploadTooLarge = computed(() => (uploadFile.value?.size || 0) > MAX_UPLOAD)

async function uploadPlugin() {
  const f = uploadFile.value
  if (!f || uploadTooLarge.value || pending.value) return
  uploadDone.value = false
  startPending('upload', '')
  try {
    rh.emit('plugin_install', { method: 'upload', source_data: await f.arrayBuffer() })
  } catch {
    finishPending(false)
    toast.add({ title: t('Plugin install failed'), color: 'error', icon: 'i-lucide-circle-alert' })
  }
}

/* ------------------------------------------------------------ settings -- */

const updateBehavior = ref<string>('check')
const showReleases = ref(false)
rh.on('config_update', (d: any) => {
  const c = d?.config?.PLUGINS
  if (!c) return
  if ('UPDATE_BEHAVIOR' in c) updateBehavior.value = c.UPDATE_BEHAVIOR || 'check'
  if ('SHOW_RELEASES' in c) showReleases.value = !!c.SHOW_RELEASES
})
function setConfig(key: string, value: any) {
  rh.emit('set_config', { section: 'PLUGINS', key, value })
}
const updateBehaviorItems = computed(() => [
  { label: t('Check for updates at startup'), value: 'check' },
  { label: t('Never check for updates'), value: 'none' }
])
const showReleasesItems = computed(() => [
  { label: t('Default'), value: false },
  { label: t('Select from list'), value: true }
])

/* ------------------------------------------------------------ discover -- */

const repo = computed(() => rh.state.plugin_repo as { remote_categories?: Record<string, string[]>, remote_data?: Record<string, RemotePlugin> } | undefined)
const remote = computed<RemotePlugin[]>(() => Object.values(repo.value?.remote_data || {}))
const repoLoading = computed(() => !repo.value)
const repoRefreshing = ref(false)
watch(repo, () => { repoRefreshing.value = false })
function reloadRepo() {
  repoRefreshing.value = true
  rh.refresh(['plugin_repo'])
}

const categories = computed(() => {
  const byRepo = new Map(remote.value.map(p => [p.repository, p]))
  const used = new Set<string>()
  const out: { title: string, plugins: RemotePlugin[] }[] = []
  for (const [title, repos] of Object.entries(repo.value?.remote_categories || {})) {
    const plugins = repos.map(r => byRepo.get(r)).filter((p): p is RemotePlugin => !!p)
    plugins.forEach(p => used.add(p.manifest.domain))
    if (plugins.length) out.push({ title: t(title), plugins })
  }
  const rest = remote.value.filter(p => !used.has(p.manifest.domain))
  if (rest.length) out.push({ title: t('Uncategorized'), plugins: rest })
  return out
})

const search = ref('')
const category = ref<string>('all')
const categoryItems = computed(() => [
  { label: t('All'), value: 'all' },
  ...categories.value.map(c => ({ label: c.title, value: c.title }))
])

function matches(p: RemotePlugin, q: string) {
  const m = p.manifest
  return [m.name, m.author, m.description, m.domain, p.repository].some(s => s?.toLowerCase().includes(q))
}
const visibleCategories = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (q) {
    const seen = new Set<string>()
    const hits = remote.value.filter(p => matches(p, q) && !seen.has(p.manifest.domain) && seen.add(p.manifest.domain))
    return hits.length ? [{ title: t('Results'), plugins: hits }] : []
  }
  return category.value === 'all' ? categories.value : categories.value.filter(c => c.title === category.value)
})

// chosen release tag per plugin (when "Install Version" is "Select from list")
const tags = reactive<Record<string, string>>({})
function releaseItems(p: RemotePlugin) {
  return (p.releases || []).map(r => ({ label: r.prerelease ? `${r.tag_name} (${t('pre-release')})` : r.tag_name, value: r.tag_name }))
}
function tagFor(p: RemotePlugin) {
  return tags[p.manifest.domain] || p.releases?.[0]?.tag_name
}

function remoteAction(p: RemotePlugin) {
  const d = p.manifest.domain
  if (changed[d] === 'installed') return { label: t('Installed'), icon: 'i-lucide-check', disabled: true, installed: false }
  if (removedIds.value.has(d)) return { label: t('Install'), icon: undefined, disabled: false, installed: false }
  if (hasUpdate(p.update_status)) return { label: t('Update'), icon: undefined, disabled: false, installed: false }
  // up to date: the card says so, and offers Reinstall in its menu rather than as the main action
  if (p.update_status === NO_UPDATE || installedIds.value.has(d)) return { label: t('Installed'), icon: 'i-lucide-check', disabled: false, installed: true }
  return { label: t('Install'), icon: undefined, disabled: false, installed: false }
}
function reinstallItems(p: RemotePlugin) {
  return [[{
    label: showReleases.value && tagFor(p) ? `${t('Install')} ${tagFor(p)}` : t('Reinstall'),
    icon: 'i-lucide-refresh-cw',
    disabled: !!pending.value,
    onSelect: () => installRemote(p)
  }]]
}
function installRemote(p: RemotePlugin) {
  install(p.manifest.domain, showReleases.value ? tagFor(p) : undefined)
}

const detail = ref<RemotePlugin | null>(null)
const detailOpen = computed({
  get: () => !!detail.value,
  set: (v) => { if (!v) detail.value = null }
})

function remoteLinks(p: RemotePlugin) {
  const m = p.manifest
  return [
    p.repository ? { label: t('plugin repository'), icon: 'i-lucide-github', to: `https://github.com/${p.repository}` } : null,
    m.documentation_uri ? { label: t('documentation'), icon: 'i-lucide-book-open', to: m.documentation_uri } : null,
    m.info_uri ? { label: t('website'), icon: 'i-lucide-globe', to: m.info_uri } : null,
    m.license_uri ? { label: m.license || t('license'), icon: 'i-lucide-scale', to: m.license_uri } : null
  ].filter((l): l is { label: string, icon: string, to: string } => !!l)
}

/* --------------------------------------------------------------- icons -- */

// App-icon style tile: a stable gradient per plugin with its initial
const TILES = [
  'from-sky-400 to-blue-600', 'from-violet-400 to-purple-600', 'from-pink-400 to-rose-600',
  'from-orange-400 to-red-500', 'from-amber-300 to-orange-500', 'from-lime-400 to-green-600',
  'from-emerald-400 to-teal-600', 'from-cyan-400 to-sky-600', 'from-indigo-400 to-indigo-700',
  'from-fuchsia-400 to-pink-600', 'from-slate-400 to-slate-700'
]
function tileClass(key: string) {
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return TILES[h % TILES.length]
}
function initials(name: string) {
  const words = name.replace(/^(rh|rotorhazard)[\s_-]+/i, '').split(/[\s_-]+/).filter(Boolean)
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || '?'
}

/* ------------------------------------------------------------- restart -- */

</script>

<template>
  <UDashboardPanel id="plugins">
    <template #header>
      <UDashboardNavbar :title="t('Plugins')">
        <template #right>
          <RhBell />
          <UButton
            v-if="tab === 'discover'"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="repoRefreshing"
            :aria-label="t('Refresh')"
            @click="reloadRepo"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">

        <!-- a tool page like Pilots or Heats: the navbar names it, the tabs lead -->
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <UTabs v-model="tab" :items="tabs" :content="false" color="neutral" class="w-full sm:w-fit" :ui="{ list: 'w-full sm:w-fit' }" />
          <p v-if="tab === 'discover'" class="text-sm text-muted">
            {{ t('Open-source plugins from the community, free to use at any event.') }}
          </p>
        </div>

        <!-- ================================================= INSTALLED -->
        <div v-if="tab === 'installed'" class="space-y-8">
          <div v-if="!rh.state.plugin_list" class="space-y-2">
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-48 w-full rounded-2xl" />
          </div>

          <div v-else-if="installed.length" class="space-y-4">
            <UInput
              ref="installedSearch"
              v-model="installedQuery"
              icon="i-lucide-search"
              :placeholder="t('Filter installed plugins')"
              :aria-label="t('Filter installed plugins')"
              class="w-full sm:max-w-sm"
              :ui="{ base: 'rounded-full' }"
            >
              <template v-if="installedQuery" #trailing>
                <UButton color="neutral" variant="link" size="sm" icon="i-lucide-circle-x" :aria-label="t('Clear')" @click="installedQuery = ''" />
              </template>
              <template v-else #trailing>
                <UKbd value="/" class="hidden sm:inline-flex" />
              </template>
            </UInput>
            <UEmpty
              v-if="!shownInstalled.length"
              icon="i-lucide-search-x"
              :title="t('No plugins found')"
              :description="t('Try a different search.')"
              :actions="[{ label: t('Clear'), color: 'neutral', variant: 'subtle', onClick: () => { installedQuery = '' } }]"
              variant="naked"
            />
            <RhGroup v-else :title="installedQuery ? `${t('Installed')} · ${shownInstalled.length} / ${installed.length}` : t('Installed')">
              <div
                v-for="p in shownInstalled"
                :key="p.id"
                class="flex items-start gap-3 px-4 py-4"
                :class="changed[p.id] === 'deleted' ? 'opacity-60' : ''"
              >
                <div class="flex min-w-0 flex-1 gap-4">
                  <div
                    class="flex size-12 shrink-0 items-center justify-center rounded-[14px] bg-linear-to-br text-lg font-semibold text-white shadow-sm"
                    :class="tileClass(p.id)"
                    aria-hidden="true"
                  >
                    {{ initials(p.name || p.id) }}
                  </div>
                  <div class="min-w-0 flex-1 space-y-1.5">
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span class="text-[15px] font-semibold text-highlighted">{{ p.name || p.id }}</span>
                      <span v-if="p.version" class="tabular text-[13px] text-muted">{{ p.version }}</span>
                      <UBadge v-if="changed[p.id] === 'deleted' || (isRemoved(p) && changed[p.id] !== 'installed')" color="warning" variant="subtle" size="sm" :label="t('Removed · restart to finish')" />
                      <UBadge v-else-if="changed[p.id] === 'installed'" color="success" variant="subtle" size="sm" :label="t('Updated · restart to finish')" />
                      <UBadge v-else-if="isDeactivated(p)" color="neutral" variant="subtle" size="sm" :label="t('Disabled')" />
                      <UBadge v-else-if="!p.loaded" color="error" variant="subtle" size="sm" icon="i-lucide-circle-alert" :label="t('Not loaded')" />
                      <UBadge v-else-if="!p.enabled" color="neutral" variant="subtle" size="sm" :label="t('Disabled')" />
                      <UBadge v-if="hasUpdate(p.update_status) && !changed[p.id]" color="primary" variant="subtle" size="sm" :label="p.update_status === PRE_RELEASE_UPDATE ? t('Pre-release available') : t('Update available')" />
                    </div>
                    <div v-if="p.author" class="text-[13px] text-muted">
                      <ULink v-if="p.author_uri" :to="p.author_uri" target="_blank" class="text-muted hover:text-highlighted">
                        {{ p.author }}
                      </ULink>
                      <span v-else>{{ p.author }}</span>
                    </div>
                    <template v-if="p.description">
                      <RhMarkdown :ref="(r: any) => descRef(r, p.id)" :source="p.description" class="text-[13px] text-toned" :class="expanded[p.id] ? '' : 'line-clamp-2'" />
                      <button v-if="clamped[p.id] || expanded[p.id]" type="button" class="text-[13px] font-medium text-primary" @click="expanded[p.id] = !expanded[p.id]">
                        {{ expanded[p.id] ? t('Less') : t('More') }}
                      </button>
                    </template>
                    <p v-else class="text-[13px] italic text-dimmed">
                      ({{ t('not provided') }})
                    </p>
                    <p v-if="isDeactivated(p)" class="mt-1 text-[13px] text-muted">
                      {{ t('Deactivated: its folder name starts with "_". Remove the "_" and restart to turn it on.') }}
                    </p>
                    <UAlert
                      v-else-if="!p.loaded && p.load_issue"
                      color="error"
                      variant="soft"
                      icon="i-lucide-triangle-alert"
                      :title="t('Not loaded')"
                      :description="t(p.load_issue)"
                      class="mt-2"
                      :ui="{ root: 'rounded-xl py-2.5', title: 'text-[13px]', description: 'text-[13px]' }"
                    />
                    <div v-if="!changed[p.id] && rowAction(p)" class="pt-1.5 sm:hidden">
                      <UButton v-bind="rowAction(p)!" size="sm" class="rounded-full px-4" />
                    </div>
                    <div v-if="p.documentation_uri || p.info_uri || p.license_uri || p.license" class="flex flex-wrap gap-x-4 gap-y-1 pt-0.5 text-[13px]">
                      <ULink v-if="p.documentation_uri" :to="p.documentation_uri" target="_blank" class="inline-flex items-center gap-1 text-primary">
                        <UIcon name="i-lucide-book-open" class="size-3.5" />{{ t('documentation') }}
                      </ULink>
                      <ULink v-if="p.info_uri" :to="p.info_uri" target="_blank" class="inline-flex items-center gap-1 text-primary">
                        <UIcon name="i-lucide-globe" class="size-3.5" />{{ t('website') }}
                      </ULink>
                      <ULink v-if="p.license_uri" :to="p.license_uri" target="_blank" class="inline-flex items-center gap-1 text-primary">
                        <UIcon name="i-lucide-scale" class="size-3.5" />{{ p.license || t('license') }}
                      </ULink>
                      <span v-else-if="p.license" class="inline-flex items-center gap-1 text-muted">
                        <UIcon name="i-lucide-scale" class="size-3.5" />{{ p.license }}
                      </span>
                    </div>
                  </div>
                </div>

                <div v-if="!changed[p.id]" class="flex shrink-0 items-center gap-2">
                  <UButton v-if="rowAction(p)" v-bind="rowAction(p)!" size="sm" class="rounded-full px-4 max-sm:hidden" />
                  <UDropdownMenu :items="installedMenu(p)" :content="{ align: 'end' }">
                    <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" :aria-label="t('More')" />
                  </UDropdownMenu>
                </div>
              </div>
            </RhGroup>
          </div>

          <div v-else class="rounded-2xl bg-default ring-1 ring-default">
            <UEmpty
              icon="i-lucide-puzzle"
              :title="t('No external plugins loaded.')"
              :description="t('Browse community plugins or upload a plugin zip file to add features to your timer.')"
              :actions="[{ label: t('Browse Community Plugins'), icon: 'i-lucide-compass', onClick: () => { tab = 'discover' } }]"
              variant="naked"
            />
          </div>

          <RhGroup :title="t('Upload Plugin')" :footer="t('Plugin Zipfile') + ' · ' + t('Max 50MB')">
            <div class="space-y-3 p-4">
              <UFileUpload
                v-model="uploadFile"
                accept=".zip,application/zip,application/x-zip-compressed"
                icon="i-lucide-file-archive"
                file-icon="i-lucide-file-archive"
                :label="t('Drop a plugin .zip file here')"
                :description="t('or click to choose a file')"
                layout="list"
                class="w-full"
                :ui="{ base: 'min-h-32 rounded-xl' }"
              />
              <p v-if="uploadTooLarge" class="text-[13px] text-error">
                {{ t('Max 50MB') }}
              </p>
              <div v-if="uploadFile || pending?.kind === 'upload' || uploadDone" class="flex items-center justify-end gap-3">
                <span v-if="uploadDone && !uploadFile" class="inline-flex items-center gap-1.5 text-[13px] text-success">
                  <UIcon name="i-lucide-circle-check" class="size-4" />{{ t('Plugin installation succeeded. Please restart.') }}
                </span>
                <UButton
                  v-if="uploadFile || pending?.kind === 'upload'"
                  :label="t('Import Plugin')"
                  icon="i-lucide-upload"
                  class="rounded-full px-4"
                  :loading="pending?.kind === 'upload'"
                  :disabled="uploadTooLarge || (!!pending && pending.kind !== 'upload')"
                  @click="uploadPlugin"
                />
              </div>
            </div>
          </RhGroup>

          <RhGroup :title="t('Settings')">
            <RhRow :label="t('Plugin Updates')" :description="t('Whether the timer looks for new plugin versions when it starts (requires internet).')" icon="i-lucide-circle-arrow-up">
              <USelect
                v-model="updateBehavior"
                :items="updateBehaviorItems"
                class="w-full sm:w-64"
                @update:model-value="(v: any) => setConfig('UPDATE_BEHAVIOR', v)"
              />
            </RhRow>
            <RhRow :label="t('Install Version')" :description="t('Choose a specific release when installing community plugins.')" icon="i-lucide-tags">
              <USelect
                v-model="showReleases"
                :items="showReleasesItems"
                class="w-full sm:w-64"
                @update:model-value="(v: any) => setConfig('SHOW_RELEASES', !!v)"
              />
            </RhRow>
          </RhGroup>
        </div>

        <!-- ================================================== DISCOVER -->
        <div v-else class="space-y-6">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <UInput
              ref="discoverSearch"
              v-model="search"
              icon="i-lucide-search"
              :placeholder="t('Search plugins')"
              size="lg"
              class="w-full sm:max-w-sm"
              :ui="{ base: 'rounded-full' }"
            >
              <template v-if="search" #trailing>
                <UButton color="neutral" variant="link" size="sm" icon="i-lucide-circle-x" :aria-label="t('Clear')" @click="search = ''" />
              </template>
            </UInput>
            <ULink to="https://rotorhazard.github.io/community-plugins/" target="_blank" class="inline-flex items-center gap-1 text-sm text-muted hover:text-highlighted sm:ml-auto">
              {{ t('Community Plugins documentation') }}
              <UIcon name="i-lucide-arrow-up-right" class="size-3.5" />
            </ULink>
          </div>

          <div v-if="!search && categories.length > 1" class="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
            <div class="flex w-max gap-2 pb-1 sm:w-auto sm:flex-wrap">
              <UButton
                v-for="c in categoryItems"
                :key="c.value"
                :label="c.label"
                size="sm"
                color="neutral"
                :variant="category === c.value ? 'solid' : 'soft'"
                class="rounded-full px-3.5"
                @click="category = c.value"
              />
            </div>
          </div>

          <!-- loading -->
          <div v-if="repoLoading" class="space-y-4">
            <USkeleton class="h-6 w-48" />
            <div class="grid gap-4 sm:grid-cols-2">
              <div v-for="i in 4" :key="i" class="space-y-3 rounded-2xl p-5 ring-1 ring-default">
                <div class="flex gap-3">
                  <USkeleton class="size-14 rounded-[16px]" />
                  <div class="flex-1 space-y-2 pt-1">
                    <USkeleton class="h-4 w-2/3" />
                    <USkeleton class="h-3 w-1/3" />
                  </div>
                </div>
                <USkeleton class="h-3 w-full" />
                <USkeleton class="h-3 w-4/5" />
              </div>
            </div>
            <p class="text-center text-sm text-muted">
              {{ t('Loading community plugins…') }}
            </p>
          </div>

          <!-- offline / unavailable -->
          <div v-else-if="!remote.length" class="rounded-2xl bg-default ring-1 ring-default">
            <UEmpty
              icon="i-lucide-wifi-off"
              :title="t('Community plugins are unavailable')"
              :description="t('The timer could not reach the plugin directory. Connect the timer to the internet and try again, or upload a plugin zip file.')"
              :actions="[
                { label: t('Try again'), icon: 'i-lucide-refresh-cw', loading: repoRefreshing, onClick: reloadRepo },
                { label: t('Upload Plugin'), icon: 'i-lucide-upload', color: 'neutral', variant: 'subtle', onClick: () => { tab = 'installed' } }
              ]"
              variant="naked"
            />
          </div>

          <UEmpty
            v-else-if="!visibleCategories.length"
            icon="i-lucide-search-x"
            :title="t('No plugins found')"
            :description="t('Try a different search.')"
            variant="naked"
          />

          <template v-else>
            <section v-for="c in visibleCategories" :key="c.title" class="space-y-3">
              <h2 class="px-1 font-display text-xl font-semibold text-highlighted">
                {{ c.title }}
                <span class="ml-1 text-base font-normal text-dimmed tabular">{{ c.plugins.length }}</span>
              </h2>
              <div class="grid gap-4 sm:grid-cols-2">
                <article
                  v-for="p in c.plugins"
                  :key="p.manifest.domain"
                  class="group flex flex-col gap-3 rounded-2xl bg-default p-4 shadow-xs ring-1 ring-default transition hover:shadow-md hover:ring-accented sm:p-5"
                >
                  <div class="flex items-start gap-3.5">
                    <button
                      type="button"
                      class="flex size-14 shrink-0 items-center justify-center rounded-[16px] bg-linear-to-br text-xl font-semibold text-white shadow-sm"
                      :class="tileClass(p.manifest.domain)"
                      :aria-label="p.manifest.name"
                      @click="detail = p"
                    >
                      {{ initials(p.manifest.name) }}
                    </button>
                    <div class="min-w-0 flex-1">
                      <button type="button" class="block max-w-full truncate text-left text-[15px] font-semibold text-highlighted hover:underline" @click="detail = p">
                        {{ p.manifest.name }}
                      </button>
                      <div class="truncate text-[13px] text-muted">
                        {{ p.manifest.author || p.repository }}
                      </div>
                      <div class="mt-1 flex flex-wrap items-center gap-1.5">
                        <UBadge v-if="(installedIds.has(p.manifest.domain) || changed[p.manifest.domain] === 'installed') && !remoteAction(p).installed" color="success" variant="subtle" size="sm" icon="i-lucide-check" :label="t('Installed')" />
                        <UBadge v-if="hasUpdate(p.update_status)" color="primary" variant="subtle" size="sm" :label="t('Update available')" />
                        <UBadge v-if="!p.rh_version_supported" color="warning" variant="subtle" size="sm" icon="i-lucide-triangle-alert" :label="t('Not supported')" />
                      </div>
                    </div>
                  </div>

                  <RhMarkdown
                    v-if="p.manifest.description"
                    :source="p.manifest.description"
                    class="line-clamp-3 text-[13px] text-toned [&_h4]:text-[13px] [&_h5]:text-[13px] [&_h6]:text-[13px]"
                  />
                  <p v-else class="text-[13px] italic text-dimmed">
                    ({{ t('not provided') }})
                  </p>

                  <div class="mt-auto flex items-center gap-2 pt-1">
                    <UButton
                      color="neutral"
                      variant="link"
                      size="sm"
                      class="-ml-2.5 text-muted"
                      :label="t('Details')"
                      trailing-icon="i-lucide-chevron-right"
                      @click="detail = p"
                    />
                    <span v-if="!showReleases && (p.manifest.version || p.last_version)" class="tabular text-[13px] text-dimmed">
                      {{ p.manifest.version || p.last_version }}
                    </span>
                    <div class="ml-auto flex min-w-0 items-center gap-2">
                      <USelect
                        v-if="showReleases && p.releases?.length && !remoteAction(p).disabled"
                        :model-value="tagFor(p)"
                        :items="releaseItems(p)"
                        size="sm"
                        class="w-28 min-w-0"
                        :aria-label="t('Install Version')"
                        @update:model-value="(v: any) => { tags[p.manifest.domain] = v }"
                      />
                      <template v-if="remoteAction(p).installed && !isBusy(p.manifest.domain)">
                        <span class="inline-flex shrink-0 items-center gap-1 ps-1 text-sm font-semibold text-success-800 dark:text-success-300">
                          <UIcon name="i-lucide-check" class="size-4" />{{ t('Installed') }}
                        </span>
                        <UDropdownMenu :items="reinstallItems(p)" :content="{ align: 'end' }">
                          <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="`${t('More')}: ${p.manifest.name}`" />
                        </UDropdownMenu>
                      </template>
                      <UButton
                        v-else
                        :label="isBusy(p.manifest.domain) ? t('Installing…') : remoteAction(p).label"
                        :icon="remoteAction(p).icon"
                        :color="remoteAction(p).label === t('Update') ? 'primary' : 'neutral'"
                        :variant="remoteAction(p).label === t('Update') ? 'solid' : 'soft'"
                        size="sm"
                        class="shrink-0 rounded-full px-4 font-semibold"
                        :loading="isBusy(p.manifest.domain)"
                        :disabled="remoteAction(p).disabled || (!!pending && !isBusy(p.manifest.domain))"
                        @click="installRemote(p)"
                      />
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </template>
        </div>
      </div>

      <!-- plugin details -->
      <USlideover v-model:open="detailOpen" :title="detail?.manifest.name || ''" :ui="{ content: 'max-w-lg' }">
        <template #header>
          <div v-if="detail" class="flex w-full items-start gap-4">
            <div
              class="flex size-20 shrink-0 items-center justify-center rounded-[22px] bg-linear-to-br text-3xl font-semibold text-white shadow-md"
              :class="tileClass(detail.manifest.domain)"
              aria-hidden="true"
            >
              {{ initials(detail.manifest.name) }}
            </div>
            <div class="min-w-0 flex-1 space-y-1">
              <h2 class="font-display text-xl font-semibold text-highlighted">
                {{ detail.manifest.name }}
              </h2>
              <div class="text-sm text-muted">
                <ULink v-if="detail.manifest.author_uri" :to="detail.manifest.author_uri" target="_blank" class="text-muted hover:text-highlighted">
                  {{ detail.manifest.author }}
                </ULink>
                <span v-else>{{ detail.manifest.author || detail.repository }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-2 pt-2">
                <USelect
                  v-if="showReleases && detail.releases?.length && !remoteAction(detail).disabled"
                  :model-value="tagFor(detail)"
                  :items="releaseItems(detail)"
                  size="sm"
                  class="w-36"
                  :aria-label="t('Install Version')"
                  @update:model-value="(v: any) => { tags[detail!.manifest.domain] = v }"
                />
                <template v-if="remoteAction(detail).installed && !isBusy(detail.manifest.domain)">
                  <span class="inline-flex items-center gap-1 px-1 text-sm font-semibold text-success-800 dark:text-success-300">
                    <UIcon name="i-lucide-check" class="size-4" />{{ t('Installed') }}
                  </span>
                  <UDropdownMenu :items="reinstallItems(detail)" :content="{ align: 'start' }">
                    <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="t('More')" />
                  </UDropdownMenu>
                </template>
                <UButton
                  v-else
                  :label="isBusy(detail.manifest.domain) ? t('Installing…') : remoteAction(detail).label"
                  :icon="remoteAction(detail).icon"
                  size="sm"
                  class="rounded-full px-5 font-semibold"
                  :loading="isBusy(detail.manifest.domain)"
                  :disabled="remoteAction(detail).disabled || (!!pending && !isBusy(detail.manifest.domain))"
                  @click="installRemote(detail)"
                />
              </div>
            </div>
            <UButton color="neutral" variant="ghost" icon="i-lucide-x" :aria-label="t('Close')" class="-mr-2 -mt-1" @click="detail = null" />
          </div>
        </template>
        <template #body>
          <div v-if="detail" class="space-y-6">
            <UAlert
              v-if="!detail.rh_version_supported"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :title="t('Latest plugin release is not supported by this version of RotorHazard')"
              :ui="{ root: 'rounded-xl' }"
            />
            <RhMarkdown v-if="detail.manifest.description" :source="detail.manifest.description" class="text-[15px]" />
            <p v-else class="italic text-dimmed">
              ({{ t('not provided') }})
            </p>

            <RhGroup :title="t('Information')">
              <RhRow v-if="detail.manifest.version || detail.last_version" :label="t('Version')">
                <span class="tabular text-muted">{{ detail.manifest.version || detail.last_version }}</span>
              </RhRow>
              <RhRow v-if="detail.last_prerelease" :label="t('pre-release')">
                <span class="tabular text-muted">{{ detail.last_prerelease }}</span>
              </RhRow>
              <RhRow v-if="detail.manifest.required_rhapi_version" :label="t('Requires API version')">
                <span class="tabular text-muted">{{ detail.manifest.required_rhapi_version }}</span>
              </RhRow>
              <RhRow v-if="detail.manifest.license && !detail.manifest.license_uri" :label="t('license')">
                <span class="text-muted">{{ detail.manifest.license }}</span>
              </RhRow>
              <RhRow :label="t('Identifier')">
                <code class="text-[13px] text-muted">{{ detail.manifest.domain }}</code>
              </RhRow>
            </RhGroup>

            <RhGroup v-if="remoteLinks(detail).length" :title="t('Links')">
              <a
                v-for="l in remoteLinks(detail)"
                :key="l.to"
                :href="l.to"
                target="_blank"
                rel="noopener"
                class="flex min-h-12 items-center gap-3 px-4 py-3 text-[15px] text-primary transition-colors hover:bg-elevated/60"
              >
                <UIcon :name="l.icon" class="size-5 shrink-0" />
                <span class="flex-1 first-letter:uppercase">{{ l.label }}</span>
                <UIcon name="i-lucide-arrow-up-right" class="size-4 text-dimmed" />
              </a>
            </RhGroup>
          </div>
        </template>
      </USlideover>

      <!-- delete confirm -->
      <UModal v-model:open="deleteOpen" :title="t('Delete {0}?', deleteTarget?.name || deleteTarget?.id || '')" :description="t('There is no undo available for this action. Restart is required.')">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="error" icon="i-lucide-trash-2" :label="t('Delete')" @click="confirmDelete" />
          </div>
        </template>
      </UModal>

    </template>
  </UDashboardPanel>
</template>
