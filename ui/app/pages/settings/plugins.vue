<script setup lang="ts">
/**
 * Plugin settings panels (rhapi.ui.register_panel, page 'settings'), panels
 * for page keys that have no page of their own, and stream overlays (page
 * 'streams' panels plus links to the classic overlay pages for OBS etc.).
 */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()
const { pages, panelsFor } = usePluginUI()
const toast = useToast()

rh.load(['heat_data', 'class_data'])

const HOMED = ['run', 'marshal', 'results', 'format', 'settings', 'streams']
const otherPages = computed(() => Object.keys(pages).filter(k => !HOMED.includes(k) && pages[k]?.length))
const settingsPanels = computed(() => panelsFor('settings'))
const loadedSettings = computed(() => 'settings' in pages)

function prettyKey(k: string) {
  return k.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ---- stream overlays
const numNodes = computed(() => info.value?.num_nodes ?? 0)
const heats = computed<any[]>(() => rh.state.heat_data?.heats || [])
const classes = computed<any[]>(() => rh.state.class_data?.classes || [])

const nodeItems = computed(() => Array.from({ length: numNodes.value }, (_, i) => ({ label: `${t('Node overlay')} ${i + 1}`, value: i + 1 })))
const heatItems = computed(() => [{ label: t('Current Heat'), value: 0 }, ...heats.value.map(h => ({ label: h.displayname || `${t('Heat')} ${h.id}`, value: h.id }))])
const classItems = computed(() => [{ label: t('Current Class'), value: 0 }, ...classes.value.map(c => ({ label: c.displayname || `${t('Class')} ${c.id}`, value: c.id }))])

const node = ref(1)
const heat = ref(0)
const cls = ref(0)

const overlays = computed(() => [
  { key: 'index', label: t('All Streams'), description: t('Index of every overlay page'), icon: 'i-lucide-layout-grid', path: '/streams' },
  { key: 'results', label: t('Current Race Results'), description: t('Live leaderboard of the race in progress'), icon: 'i-lucide-trophy', path: '/stream/results' },
  { key: 'node', label: t('Node overlay'), description: t('Lap times for one seat'), icon: 'i-lucide-user-round', path: `/stream/node/${node.value}`, select: 'node' as const },
  { key: 'heat', label: t('Heat'), description: t('Results for one heat'), icon: 'i-lucide-layers', path: `/stream/heat/${heat.value}`, select: 'heat' as const },
  { key: 'class', label: t('Class'), description: t('Results for one class'), icon: 'i-lucide-shapes', path: `/stream/class/${cls.value}`, select: 'class' as const }
])

function absolute(path: string) {
  return window.location.origin + path
}
async function copy(path: string) {
  try {
    await navigator.clipboard.writeText(absolute(path))
    toast.add({ title: t('Link copied'), description: absolute(path), icon: 'i-lucide-link', color: 'success' })
  } catch {
    toast.add({ title: t('Could not copy the link'), description: absolute(path), icon: 'i-lucide-circle-alert', color: 'error' })
  }
}
</script>

<template>
  <div class="space-y-10">
    <!-- plugin settings -->
    <section class="space-y-4">
      <div class="flex items-end justify-between gap-3 px-1">
        <h2 class="font-display text-xl font-semibold text-highlighted">
          {{ t('Plugin Settings') }}
        </h2>
        <UButton to="/plugins" color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-chevron-right" :label="t('Manage Plugins')" />
      </div>
      <RhPluginPanels page="settings" />
      <div v-if="!loadedSettings" class="space-y-2">
        <USkeleton class="h-5 w-40" />
        <USkeleton class="h-32 w-full rounded-2xl" />
      </div>
      <div
        v-else-if="!settingsPanels.length"
        class="flex items-center gap-4 rounded-2xl bg-default px-4 py-4 ring-1 ring-default"
      >
        <span class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-elevated text-muted">
          <UIcon name="i-lucide-puzzle" class="size-5" />
        </span>
        <div class="min-w-0 text-sm">
          <div class="font-medium text-highlighted">
            {{ t('No plugin settings') }}
          </div>
          <div class="text-muted">
            {{ t('Settings added by plugins appear here.') }}
          </div>
        </div>
      </div>
    </section>

    <!-- panels for pages without a home of their own -->
    <section v-for="k in otherPages" :key="k" class="space-y-4">
      <h2 class="px-1 font-display text-xl font-semibold text-highlighted">
        {{ t(prettyKey(k)) }}
      </h2>
      <RhPluginPanels :page="k" />
    </section>

    <!-- streams -->
    <section class="space-y-4">
      <div class="px-1">
        <h2 class="font-display text-xl font-semibold text-highlighted">
          {{ t('Streams') }}
        </h2>
        <p class="mt-1 text-sm text-muted">
          {{ t('Overlay pages for live video production. Add them to OBS or another streaming app as a browser source.') }}
        </p>
      </div>

      <RhGroup>
        <div v-for="o in overlays" :key="o.key" class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <UIcon :name="o.icon" class="size-5 shrink-0 text-muted" />
            <div class="min-w-0">
              <div class="text-[15px] font-medium text-highlighted">
                {{ o.label }}
              </div>
              <div class="truncate text-[13px] text-muted">
                {{ o.description }}
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <USelect v-if="o.select === 'node'" v-model="node" :items="nodeItems" class="min-w-0 flex-1 sm:w-48 sm:flex-none" :disabled="!nodeItems.length" />
            <USelect v-else-if="o.select === 'heat'" v-model="heat" :items="heatItems" class="min-w-0 flex-1 sm:w-48 sm:flex-none" />
            <USelect v-else-if="o.select === 'class'" v-model="cls" :items="classItems" class="min-w-0 flex-1 sm:w-48 sm:flex-none" />
            <UTooltip :text="t('Copy link')">
              <UButton icon="i-lucide-link" color="neutral" variant="ghost" :aria-label="t('Copy link')" @click="copy(o.path)" />
            </UTooltip>
            <UButton
              :to="o.path"
              target="_blank"
              external
              icon="i-lucide-external-link"
              color="neutral"
              variant="soft"
              :label="t('Open')"
            />
          </div>
        </div>
      </RhGroup>

      <RhPluginPanels page="streams" />
    </section>
  </div>
</template>
