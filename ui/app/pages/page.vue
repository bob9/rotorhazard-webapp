<script setup lang="ts">
// Plugin page viewer: shows a page added with rhapi.ui.blueprint_add() inside the app.
const { t } = useI18n()
const { info } = useServerInfo()
// the classic stylesheet follows prefers-color-scheme, which inside a frame comes from the
// frame element's color-scheme: pass the app's appearance through
const colorMode = useColorMode()
const route = useRoute()

// only same-origin paths ("/x", not "//host" or "/\host") may be framed
const url = computed(() => {
  const u = typeof route.query.url === 'string' ? route.query.url.trim() : ''
  return /^\/(?![/\\])/.test(u) ? u : null
})

// app routes open in the app itself (framing the app inside itself is never wanted)
const base = useRuntimeConfig().app.baseURL
watch(url, (u) => {
  if (u && (u + '/').startsWith(base)) navigateTo(u.slice(base.length - 1) || '/', { replace: true })
}, { immediate: true })

const entry = computed(() => info.value?.plugin_pages?.find(p => p.url === url.value))
const title = computed(() => {
  if (entry.value?.label) return t(entry.value.label)
  if (!url.value) return t('Plugin Page')
  const last = url.value.split(/[?#]/)[0]!.replace(/\/+$/, '').split('/').pop() || ''
  return last ? last.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : t('Plugin Page')
})
useHead({ title })

const frame = ref<HTMLIFrameElement | null>(null)
const loading = ref(true)
const nonce = ref(0)
// a plugin page that fails (missing template, crash) would show the server's raw
// traceback in the frame: check its status first and say so plainly instead
const failedStatus = ref<number | null>(null)
async function checkPage() {
  failedStatus.value = null
  if (!url.value) return
  try {
    const r = await fetch(url.value, { method: 'HEAD', credentials: 'same-origin' })
    if (r.status >= 500 || r.status === 404) failedStatus.value = r.status
  } catch {
    // network trouble: let the frame show what it can
  }
}
watch([url, nonce], () => { loading.value = true; checkPage() }, { immediate: true })

// Classic-layout plugin pages carry the classic header and footer; inside the app, which has
// its own navigation, hide them (same-origin frame). Applied as soon as the page's document
// exists, and again on load, so the header doesn't flash.
const EMBED_CSS = 'html.rh-embedded body > header, html.rh-embedded body > footer { display: none !important; }'
function embed() {
  try {
    const doc = frame.value?.contentDocument
    if (!doc || !doc.documentElement || doc.location.href === 'about:blank') return
    doc.documentElement.classList.add('rh-embedded')
    if (doc.getElementById('rh-app-embedded')) return
    const style = doc.createElement('style')
    style.id = 'rh-app-embedded'
    style.textContent = EMBED_CSS
    ;(doc.head || doc.documentElement).appendChild(style)
  } catch {
    // a cross-origin page (a plugin redirecting elsewhere): leave it as it is
  }
}
let embedTimer: ReturnType<typeof setInterval> | undefined
watch(loading, (on) => {
  clearInterval(embedTimer)
  if (on && import.meta.client) embedTimer = setInterval(embed, 50)
}, { immediate: true })
onBeforeUnmount(() => clearInterval(embedTimer))
function onFrameLoad() {
  embed()
  loading.value = false
}

function reload() {
  loading.value = true
  checkPage()
  try {
    frame.value?.contentWindow?.location.reload()
  } catch {
    nonce.value++
  }
}
</script>

<template>
  <UDashboardPanel id="plugin-page" :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden' }">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #right>
          <RhBell />
          <template v-if="url">
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-rotate-cw"
              :loading="loading"
              :aria-label="t('Reload')"
              @click="reload"
            />
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-external-link"
              :to="url"
              target="_blank"
              external
              :label="t('Open in new tab')"
              :ui="{ label: 'hidden sm:inline' }"
            />
          </template>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- plugin pages carry their own (usually light) styling: show them as an inset sheet -->
      <div v-if="url && failedStatus" class="flex flex-1 items-center justify-center p-6">
        <UEmpty
          icon="i-lucide-file-warning"
          :title="t('This plugin page failed to load')"
          :description="`${t('The timer answered with an error')} (${failedStatus}). ${t('Check the plugin, or its log entries in Settings › System.')}`"
          :actions="[
            { label: t('Open in new tab'), icon: 'i-lucide-external-link', to: url, target: '_blank', external: true, color: 'neutral', variant: 'subtle' },
            { label: t('Manage Plugins'), icon: 'i-lucide-puzzle', to: '/plugins', color: 'neutral', variant: 'subtle' }
          ]"
          variant="naked"
        />
      </div>
      <div v-else-if="url" class="relative min-h-0 flex-1 bg-elevated/40">
        <div v-if="loading" class="absolute inset-x-0 top-0 z-10">
          <UProgress size="2xs" animation="carousel" />
        </div>
        <iframe
          :key="`${url}#${nonce}`"
          ref="frame"
          :src="url"
          :title="title"
          class="absolute inset-2 h-[calc(100%-1rem)] w-[calc(100%-1rem)] rounded-xl border-0 bg-white shadow-sm ring-1 ring-default sm:inset-4 sm:h-[calc(100%-2rem)] sm:w-[calc(100%-2rem)] dark:ring-white/10"
          :style="{ colorScheme: colorMode.value === 'dark' ? 'dark' : 'light' }"
          @load="onFrameLoad"
        />
      </div>
      <div v-else class="flex flex-1 items-center justify-center p-6">
        <UEmpty
          icon="i-lucide-shield-alert"
          :title="t('This page cannot be shown')"
          :description="t('Only pages served by this timer can be opened here.')"
          :actions="[{ label: t('Plugins'), icon: 'i-lucide-puzzle', to: '/plugins', color: 'neutral', variant: 'subtle' }]"
          variant="naked"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
