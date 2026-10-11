<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const rh = useRH()
const { t } = useI18n()
const { admin, loginOpen, logout, classicSession, hasCredentials } = useAuth()
// while saved credentials are being checked, the footer already takes the signed-in shape
const guestFooter = computed(() => admin.value === false || (admin.value === null && !hasCredentials()))
const { info, timerName } = useServerInfo()
const namedTimer = computed(() => !!timerName.value && timerName.value !== 'RotorHazard')
const { restartRequired, restarting } = useMessages()
const colorMode = useColorMode()
const route = useRoute()

rh.load(['all_languages', 'language', 'race_status', 'current_heat'])

const sidebarOpen = ref(false)
const searchOpen = ref(false)
// opened from the bell in each page's navbar (RhBell)
const messagesOpen = useState('rh.messagesOpen', () => false)
const aboutOpen = ref(false)

const raceLive = computed(() => [1, 3].includes(rh.state.race_status?.race_status))

// admin-only pages (utils/adminPages.ts): the route middleware sends guests to Live before
// the page renders; this says why, and also covers signing out while on such a page
const { refusedPath } = useAuth()
const toast = useToast()
function offerSignIn() {
  toast.add({
    id: 'sign-in-to-open',
    title: t('Sign in to open that page'),
    icon: 'i-lucide-lock-keyhole',
    color: 'neutral',
    actions: [{ label: t('Sign in'), color: 'neutral', variant: 'outline', onClick: () => { loginOpen.value = true } }]
  })
}
watch(refusedPath, (p) => {
  if (!p) return
  refusedPath.value = null
  offerSignIn()
}, { immediate: true })
watch(admin, (isAdmin) => {
  if (isAdmin !== false || !isAdminPage(route.path)) return
  navigateTo('/live', { replace: true })
  offerSignIn()
})

// a full URL: the router's links don't add the app's base path to a link opening a new tab
// it opens in presentation mode, for a projector or a second screen
const liveHref = `${useRuntimeConfig().app.baseURL}live?kiosk=1`
const kiosk = useKiosk()
// while saved credentials are being checked the menu already takes the admin shape, so the
// sections don't push each other down once the check returns
const navAdmin = computed(() => admin.value === true || (admin.value === null && hasCredentials()))
const raceItems = computed<NavigationMenuItem[]>(() => [
  ...(navAdmin.value
    ? [{ label: t('Race'), icon: 'i-lucide-flag', to: '/', badge: raceLive.value ? { label: t('Live'), color: 'error' as const, variant: 'solid' as const, size: 'sm' as const } : undefined },
        { label: t('Marshal'), icon: 'i-lucide-pencil-ruler', to: '/marshal' },
        // the spectator page, for a projector or second screen: its own tab, so race control stays open
        { label: t('Live view'), icon: 'i-lucide-monitor-play', to: liveHref, target: '_blank', external: true }]
    : [{ label: t('Live'), icon: 'i-lucide-radio', to: '/live' }]),
  { label: t('Results'), icon: 'i-lucide-trophy', to: '/results' },
  ...(navAdmin.value ? [] : [{ label: t('Event'), icon: 'i-lucide-calendar-days', to: '/event' }])
])

const eventItems = computed<NavigationMenuItem[]>(() => navAdmin.value
  ? [
      { label: t('Event'), icon: 'i-lucide-calendar-days', to: '/event' },
      { label: t('Pilots'), icon: 'i-lucide-users', to: '/pilots' },
      { label: t('Heats'), icon: 'i-lucide-layers', to: '/heats' },
      { label: t('Formats'), icon: 'i-lucide-timer', to: '/formats' }
    ]
  : [])

const systemItems = computed<NavigationMenuItem[]>(() => navAdmin.value
  ? [
      { label: t('Timer'), icon: 'i-lucide-radio-tower', to: '/timer' },
      { label: t('Settings'), icon: 'i-lucide-settings', to: '/settings', badge: restartRequired.value ? { label: t('Restart'), color: 'warning' as const, variant: 'subtle' as const, size: 'sm' as const } : undefined },
      { label: t('Plugins'), icon: 'i-lucide-puzzle', to: '/plugins' }
    ]
  : [])

const pluginItems = computed<NavigationMenuItem[]>(() => (info.value?.plugin_pages || []).map(p => ({
  label: p.label ? t(p.label) : prettyPath(p.url),
  icon: 'i-lucide-app-window',
  to: `/page?url=${encodeURIComponent(p.url)}`,
  active: route.path === '/page' && route.query.url === p.url
})))

function prettyPath(url: string) {
  const last = url.replace(/\/+$/, '').split('/').pop() || url
  return last.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// Search covers pages, settings (with everyday synonyms), and event data
const searchData = ref(false)
const tools = useTools().tools()
// where each page's plugin panels are shown in this app; other pages go to Plugins & Streams
const PANEL_ROUTES: Record<string, string> = { run: '/', format: '/event', results: '/results', marshal: '/marshal', settings: '/settings/plugins', streams: '/settings/plugins' }
const { pages: pluginPages } = usePluginUI()
watch(searchOpen, (o) => {
  if (o && !searchData.value) {
    searchData.value = true
    rh.load(['pilot_data', 'heat_data', 'class_data', 'format_data'])
    if (admin.value) rh.load(Object.keys(PANEL_ROUTES).map(value => ({ type: 'ui' as const, value })))
  }
})
// everyday words for the pages themselves ("start race" → Race)
const PAGE_KEYWORDS: Record<string, string> = {
  '/': 'start race stop race run race control clock',
  '/live': 'live view current race spectator projector big screen second screen display tv watch',
  '/marshal': 'marshal fix lap edit laps',
  '/results': 'results standings leaderboard',
  '/event': 'event overview',
  '/pilots': 'pilots add pilot',
  '/heats': 'heats classes schedule',
  '/formats': 'formats race format',
  '/timer': 'timer nodes',
  '/settings': 'settings preferences',
  '/plugins': 'plugins install plugin'
}
const settingsIndex = computed(() => admin.value
  ? [
      { label: t('Frequencies'), description: t('Timer'), icon: 'i-lucide-radio', to: '/timer', keywords: 'frequency channel band raceband vtx' },
      { label: t('Sensor Tuning'), description: t('Timer'), icon: 'i-lucide-activity', to: '/timer?tab=tuning', keywords: 'tuning enterat exitat rssi calibration signal gate threshold node' },
      { label: t('Start Threshold'), description: t('Timer'), icon: 'i-lucide-sliders-horizontal', to: '/timer?tab=advanced', keywords: 'start threshold lower amount lower duration first pass launch advanced' },
      { label: t('Race duration and scoring'), description: t('Formats'), icon: 'i-lucide-timer', to: '/formats', keywords: 'duration length time clock minutes staging tones win condition laps scoring holeshot hole shot grace period prestage first crossing staggered start laps to win team co-op points random staging' },
      { label: t('Grace Period'), description: t('Formats'), icon: 'i-lucide-hourglass', to: '/formats#grace-period', keywords: 'grace period grace final lap after the clock overtime wait for a manual stop' },
      ...tools.value.map(x => ({ label: x.label, description: x.description, icon: x.icon, to: x.to, keywords: x.keywords })),
      { label: t('Generate Heats'), description: t('Heats'), icon: 'i-lucide-wand-sparkles', to: '/heats?generate=1', keywords: 'heat generator generate heats bracket ladder seed seeding random qualifying finals' },
      { label: t('Appearance'), description: t('Settings'), icon: 'i-lucide-sun-moon', to: '/settings/general#appearance', keywords: 'dark mode light mode theme night colour color scheme appearance', strict: true },
      { label: t('Minimum Lap Time'), description: t('Race'), icon: 'i-lucide-gauge', to: '/#min-lap', keywords: 'min lap minimum short laps ignore crossings' },
      { label: t('Pilots'), description: t('Callsign, name, team and color'), icon: 'i-lucide-users', to: '/pilots', keywords: 'pilot callsign name team color colour phonetic add pilot' },
      ...(info.value?.led_enabled || info.value?.led_events_enabled ? [{ label: t('LEDs'), description: t('Settings'), icon: 'i-lucide-lightbulb', to: '/settings/leds', keywords: 'led leds lights strip panel brightness color colour effects' }] : []),
      ...(info.value?.vrx_enabled ? [{ label: t('VRx Control'), description: t('Settings'), icon: 'i-lucide-tv', to: '/settings/vrx', keywords: 'vrx goggles receiver osd mqtt video receiver' }] : []),
      { label: t('Audio'), description: t('Settings'), icon: 'i-lucide-volume-2', to: '/settings/audio', keywords: 'voice callouts sound speech tones beep volume announce' },
      { label: t('Event Actions'), description: t('Settings'), icon: 'i-lucide-zap', to: '/settings/actions', keywords: 'automation actions effects trigger' },
      { label: t('Data & Backups'), description: t('Settings'), icon: 'i-lucide-hard-drive', to: '/settings/data', keywords: 'backup restore export import csv json database new event archive reset' },
      { label: t('Admin Login'), description: t('Settings'), icon: 'i-lucide-key-round', to: '/settings/general#admin-login', keywords: 'password username login admin security' },
      { label: t('Language'), description: t('Settings'), icon: 'i-lucide-languages', to: '/settings/general#language', keywords: 'language translation timer name logo appearance dark light theme interface classic' },
      { label: t('Secondary Timers'), description: t('Settings'), icon: 'i-lucide-network', to: '/settings/cluster', keywords: 'cluster split mirror secondary sensors' },
      { label: t('System'), description: t('Settings'), icon: 'i-lucide-cpu', to: '/settings/system', keywords: 'restart reboot shutdown logs version firmware advanced port' },
      { label: t('Plugins & Streams'), description: t('Settings'), icon: 'i-lucide-cast', to: '/settings/plugins', keywords: 'plugin settings stream overlay obs video' }
    ]
  : [])
// plugin settings, found by panel title or by any of their field labels
const pluginIndex = computed(() => {
  if (!searchData.value || !admin.value) return []
  const items: any[] = []
  for (const [page, panels] of Object.entries(pluginPages)) {
    const route = PANEL_ROUTES[page] || '/settings/plugins'
    const where = page === 'run' ? t('Race') : page === 'format' ? t('Event') : page === 'results' ? t('Results') : page === 'marshal' ? t('Marshal') : t('Plugins & Streams')
    for (const p of panels || []) {
      const fields = [...(p.settings || []), ...(p.fn_binds || []), ...(p.quickbuttons || [])]
      if (!fields.length) continue
      items.push({
        label: t(p.panel.label),
        description: `${t('Plugin')} · ${where}`,
        icon: 'i-lucide-puzzle',
        to: `${route}#panel-${p.panel.name}`,
        keywords: fields.map((f: any) => t(f.label || f.field?.label || '')).join(' ')
      })
    }
  }
  return items
})
const dataIndex = computed(() => {
  if (!searchData.value) return []
  const items: any[] = []
  for (const p of rh.state.pilot_data?.pilots || []) items.push({ label: p.callsign, description: [t('Pilot'), pilotName(p)].filter(Boolean).join(' · '), icon: 'i-lucide-user', to: '/pilots', keywords: p.team || '' })
  const classes = rh.state.class_data?.classes || []
  for (const c of classes) items.push({ label: c.displayname, description: t('Class'), icon: 'i-lucide-trophy', to: `/heats?class=${c.id}` })
  for (const h of rh.state.heat_data?.heats || []) {
    items.push({ label: h.displayname, description: [t('Heat'), classes.find((c: any) => c.id === h.class_id)?.displayname].filter(Boolean).join(' · '), icon: 'i-lucide-layers', to: h.class_id ? `/heats?class=${h.class_id}` : '/heats' })
  }
  for (const f of rh.state.format_data?.formats || []) items.push({ label: t(f.name), description: t('Format'), icon: 'i-lucide-timer', to: '/formats' })
  return items
})
// Short fuzzy matches are noise for the appearance commands ("node" is one letter from "mode"):
// those ('strict') match only when each word typed starts one of their words
function strictFilter(term: string, items: any[]) {
  const typed = term.toLowerCase().split(/\s+/).filter(Boolean)
  return items.filter((i) => {
    if (!i.strict) return true
    const words = `${i.label} ${i.keywords || ''}`.toLowerCase().split(/[^\p{L}\p{N}]+/u)
    // (or appears within the name, for languages written without spaces)
    return typed.every(w => words.some(x => x.startsWith(w)) || String(i.label).toLowerCase().includes(w))
  })
}
const searchGroups = computed(() => [
  {
    id: 'pages',
    label: t('Go to'),
    items: [...raceItems.value, ...eventItems.value, ...systemItems.value, ...pluginItems.value]
      .map(i => ({ label: i.label, icon: i.icon, to: i.to as string, target: i.target, external: i.external, keywords: PAGE_KEYWORDS[i.to === liveHref ? '/live' : i.to as string] }))
      .concat([{ label: t('Documentation'), icon: 'i-lucide-book-open', to: '/docs', keywords: 'docs documentation help guide manual user guide how to' } as any])
  },
  ...(settingsIndex.value.length ? [{ id: 'settings', label: t('Settings'), items: settingsIndex.value, postFilter: strictFilter }] : []),
  // plugin settings come after the timer's own, so they never crowd out a core match
  ...(pluginIndex.value.length ? [{ id: 'plugin-settings', label: t('Plugin settings'), items: pluginIndex.value }] : []),
  ...(dataIndex.value.length ? [{ id: 'event', label: t('Event'), items: dataIndex.value, ignoreFilter: false }] : []),
  {
    id: 'actions',
    label: t('Actions'),
    postFilter: strictFilter,
    items: [
      { label: colorMode.value === 'dark' ? t('Light appearance') : t('Dark appearance'), icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon', keywords: 'dark mode light mode theme night appearance', strict: true, onSelect: () => { colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark' } },
      { label: t('Classic interface'), icon: 'i-lucide-history', onSelect: openClassic },
      ...(admin.value ? [{ label: t('Restart server'), icon: 'i-lucide-rotate-cw', onSelect: () => { restartOpen.value = true } }] : [])
    ]
  }
])
// whole-phrase matching ("min lap" shouldn't match "Admin Login" on "min"), names count most
const searchFuse = {
  fuseOptions: {
    keys: [{ name: 'label', weight: 3 }, { name: 'keywords', weight: 2 }, { name: 'description', weight: 0.5 }],
    threshold: 0.3,
    ignoreLocation: true,
    useTokenSearch: false
  },
  resultLimit: 40
}

// '#id' in a search result: scroll that setting into view and flash it
watch(() => route.fullPath, () => {
  const id = route.hash.slice(1)
  // the docs page scrolls its own section links to the top of the reading column
  if (!id || route.path === '/docs') return
  let tries = 0
  const find = () => {
    const el = document.getElementById(decodeURIComponent(id))
    if (!el) {
      if (++tries < 30) setTimeout(find, 100)
      return
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // the page may still be growing as its data arrives: settle on the target again,
    // then highlight it once it has stopped moving, so the eye lands on it
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 600)
    setTimeout(() => {
      el.classList.remove('rh-flash')
      void el.offsetWidth // restart the animation if the same target is opened again
      el.classList.add('rh-flash')
      setTimeout(() => el.classList.remove('rh-flash'), 2600)
    }, 900)
  }
  nextTick(find)
}, { immediate: true })

const restartOpen = ref(false)
// 'Later' hides the restart banner for this visit; the Settings item keeps a badge
const restartSnoozed = ref(false)
const { restartServer } = useMessages()

// Ctrl/Cmd+K is bound by UDashboardSearch itself

// 'Classic interface' opens the classic page matching this one
const CLASSIC_FOR: [string, string][] = [
  ['/live', '/current'], ['/marshal', '/marshal'], ['/results', '/results'], ['/event', '/event'],
  ['/pilots', '/event'], ['/heats', '/event'], ['/formats', '/format'], ['/timer', '/settings'],
  ['/settings/plugins', '/streams'], ['/settings', '/settings'], ['/plugins', '/plugins'],
  ['/database', '/database'], ['/scanner', '/scanner'], ['/vrx-status', '/vrxstatus'],
  ['/imdtabler', '/imdtabler'], ['/update-nodes', '/updatenodes']
]
// "Skip to content": focus the page's own panel (the last one, after a settings list)
function skipToContent() {
  const bodies = document.querySelectorAll<HTMLElement>('[id^="rh-dashboard-panel-"] > [data-slot="body"]')
  const body = bodies[bodies.length - 1]
  if (!body) return
  if (!body.hasAttribute('tabindex')) body.setAttribute('tabindex', '-1')
  body.style.outline = 'none'
  body.focus()
}
// admins are signed in to the classic pages first, so they don't get the browser's login prompt
async function openClassic() {
  rememberAppPage()
  if (admin.value) await classicSession()
  window.location.href = classicHref.value
}
// the classic page that matches this one
const classicTo = computed(() => {
  if (route.path === '/') return '/run'
  // a plugin page on its own has no classic menu and no way back: open the classic Race
  // (Live for guests) page instead; its "New Interface" comes back to the plugin page
  if (route.path === '/page') return admin.value ? '/run' : '/current'
  if (route.path === '/docs') {
    const d = typeof route.query.d === 'string' && route.query.d ? route.query.d : 'README.md'
    return `/docs?d=${encodeURIComponent(d)}`
  }
  const match = CLASSIC_FOR.find(([app]) => route.path === app || route.path.startsWith(app + '/'))
  // the classic pilot and heat editors are on the (admin-only) Format page; guests get the Event page
  if (match && admin.value && ['/pilots', '/heats'].includes(match[0])) return '/format'
  return match ? match[1] : ''
})
const classicHref = computed(() => (classicTo.value ? `/interface/classic?to=${encodeURIComponent(classicTo.value)}` : '/interface/classic'))
// "New Interface" on that classic page comes back to this very page (Pilots, not Formats, for
// the classic Format page; the tab that was open): the server reads this short-lived cookie
// in /interface/app while the classic page is still the one it was opened for
function rememberAppPage() {
  const classicPath = (classicTo.value || '/classic').split('?')[0]
  // the plugin page viewer's address, written the way the server checks it (?url=%2Fpath)
  // (the server only returns to a plugin page it lists)
  const pluginPage = route.path === '/page' && typeof route.query.url === 'string' ? route.query.url : ''
  const appPage = pluginPage ? `/page?url=${encodeURIComponent(pluginPage)}` : route.fullPath
  document.cookie = `rh_app_return=${encodeURIComponent(`${classicPath}|${appPage}`)}; path=/; max-age=7200; samesite=lax`
}


// A plugin bar at the top (e.g. Telemetry) arrives a moment after the app, and first draws as
// a thin strip until its stylesheet loads. The page is never held back for it; instead its
// room is kept from the start, so the bar drops into place without pushing the page down:
// - last visit's height on this device (0: there was no bar);
// - on a first visit, a neutral bar-high strip, which folds away if no bar turns up.
// The server lists the site-wide plugin scripts in /app-info (usePluginBoot().expectBar), so
// the strip folds away as soon as it is known there is no bar. The room is kept until the
// plugins have finished loading (generously capped, for slow devices), not for a fixed time.
const pluginTop = ref<HTMLElement | null>(null)
const PLUGIN_TOP_KEY = 'rh.pluginTopHeight'
const PLUGIN_TOP_GUESS = 34
let storedTop: string | null = null
try { storedTop = localStorage.getItem(PLUGIN_TOP_KEY) } catch { /* storage unavailable */ }
const pluginTopReserve = ref(storedTop === null ? PLUGIN_TOP_GUESS : Number(storedTop) || 0)
// reserving room (the strip shows) until the bar has drawn, or there turns out to be none
const pluginTopWaiting = ref(pluginTopReserve.value > 0)
// the strip has folded away and there is no bar: take no room at all
const pluginTopGone = ref(!pluginTopWaiting.value)
const boot = usePluginBoot()
let topRO: ResizeObserver | undefined
let topTimer: ReturnType<typeof setTimeout> | undefined
let noBarTimer: ReturnType<typeof setTimeout> | undefined
onMounted(() => {
  const el = pluginTop.value
  if (!el) return
  const barHeight = () => Math.max(0, ...Array.from(el.children).map(c => (c as HTMLElement).offsetHeight || 0))
  const remember = (h: number) => { try { localStorage.setItem(PLUGIN_TOP_KEY, String(h)) } catch { /* storage unavailable */ } }
  const arrived = (h: number) => {
    clearTimeout(topTimer)
    clearTimeout(noBarTimer)
    remember(h)
    pluginTopWaiting.value = false
    pluginTopGone.value = false
    pluginTopReserve.value = 0
  }
  const noBar = () => {
    clearTimeout(topTimer)
    clearTimeout(noBarTimer)
    if (el.children.length) return
    remember(0)
    if (!pluginTopWaiting.value) return
    // fold the strip away (min-height transition), then take no room
    pluginTopReserve.value = 0
    pluginTopWaiting.value = false
    setTimeout(() => { if (!el.children.length) pluginTopGone.value = true }, 250)
  }
  // slow device or a bar that never draws properly: show what there is
  topTimer = setTimeout(() => (el.children.length ? arrived(barHeight()) : noBar()), 20000)
  const check = () => {
    const h = barHeight()
    if (h >= 20) {
      if (pluginTopWaiting.value || h !== pluginTopReserve.value) arrived(h)
      return
    }
    if (!pluginTopWaiting.value || el.children.length) return
    // the server says no plugin draws a bar
    if (boot.value.expectBar === false) return noBar()
    // every plugin script has run and none drew a bar (give a late one a moment to insert itself)
    if (!boot.value.panelsPending && !boot.value.scripts) {
      clearTimeout(noBarTimer)
      noBarTimer = setTimeout(() => { if (!el.children.length) noBar() }, boot.value.expectBar ? 4000 : 300)
    }
  }
  topRO = new ResizeObserver(check)
  topRO.observe(el)
  new MutationObserver(() => {
    pluginTopGone.value = false
    Array.from(el.children).forEach(c => topRO?.observe(c))
  }).observe(el, { childList: true })
  watch(() => [boot.value.panelsPending, boot.value.scripts, boot.value.expectBar], check, { immediate: true })
})
onBeforeUnmount(() => { topRO?.disconnect(); clearTimeout(topTimer); clearTimeout(noBarTimer) })

const logoUrl = useRuntimeConfig().app.baseURL + 'rh-icon.svg'
const version = computed(() => info.value?.server?.release_version)
</script>

<template>
  <UDashboardGroup unit="rem" storage="local" storage-key="rh-dashboard">
    <!-- first stop for the keyboard: past the sidebar, straight to the page -->
    <a v-if="!kiosk" href="#" class="rh-skip" @click.prevent="skipToContent">{{ t('Skip to content') }}</a>
    <UDashboardSidebar
      v-if="!kiosk"
      id="rh"
      v-model:open="sidebarOpen"
      collapsible
      resizable
      :default-size="15"
      :min-size="13"
      :max-size="20"
      class="bg-elevated/40"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-2.5 min-w-0" :title="namedTimer ? `${timerName} · RotorHazard` : undefined">
          <img :src="logoUrl" alt="" class="size-7 shrink-0">
          <!-- a named timer shows its name, with RotorHazard beneath -->
          <span v-if="!collapsed && namedTimer" class="flex min-w-0 flex-col leading-tight">
            <span class="truncate font-display text-[15px] font-semibold text-highlighted">{{ timerName }}</span>
            <span class="truncate text-[11px] font-medium text-dimmed">RotorHazard</span>
          </span>
          <span v-else-if="!collapsed" class="truncate font-display text-[17px] font-semibold text-highlighted">RotorHazard</span>
        </NuxtLink>
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" :label="t('Search')" />

        <UNavigationMenu :collapsed="collapsed" :items="raceItems" orientation="vertical" tooltip popover />

        <template v-if="eventItems.length">
          <div v-if="!collapsed" class="mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
            {{ t('Event') }}
          </div>
          <UNavigationMenu :collapsed="collapsed" :items="eventItems" orientation="vertical" tooltip popover />
        </template>

        <template v-if="systemItems.length">
          <div v-if="!collapsed" class="mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
            {{ t('System') }}
          </div>
          <UNavigationMenu :collapsed="collapsed" :items="systemItems" orientation="vertical" tooltip popover />
        </template>

        <template v-if="pluginItems.length">
          <div v-if="!collapsed" class="mt-3 px-2.5 text-[11px] font-semibold uppercase tracking-wider text-dimmed">
            {{ t('Plugin Pages') }}
          </div>
          <UNavigationMenu :collapsed="collapsed" :items="pluginItems" orientation="vertical" tooltip popover />
        </template>
      </template>

      <template #footer="{ collapsed }">
        <div class="flex w-full flex-col gap-1">
          <RhConnection :collapsed="collapsed" />
          <UButton
            v-if="guestFooter"
            :label="collapsed ? undefined : t('Sign in as admin')"
            icon="i-lucide-lock-keyhole"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="justify-start"
            @click="loginOpen = true"
          />
          <UButton
            v-if="guestFooter"
            :label="collapsed ? undefined : t('Classic interface')"
            icon="i-lucide-history"
            color="neutral"
            variant="ghost"
            block
            :square="collapsed"
            class="justify-start"
            :to="classicHref"
            external
            target="_self"
            @click="rememberAppPage"
          />
          <UDropdownMenu
            v-else
            :items="[
              [{ label: t('About RotorHazard'), icon: 'i-lucide-info', onSelect: () => { aboutOpen = true } },
               { label: t('Classic interface'), icon: 'i-lucide-history', onSelect: openClassic },
               { label: t('Documentation'), icon: 'i-lucide-book-open', to: '/docs' }],
              [{ label: colorMode.value === 'dark' ? t('Light appearance') : t('Dark appearance'), icon: colorMode.value === 'dark' ? 'i-lucide-sun' : 'i-lucide-moon', onSelect: () => { colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark' } }],
              ...(info?.auth_required ? [[{ label: t('Sign out'), icon: 'i-lucide-log-out', onSelect: logout }]] : [])
            ]"
            :content="{ align: 'start', side: 'top' }"
          >
            <UButton
              color="neutral"
              variant="ghost"
              block
              :square="collapsed"
              class="justify-start"
              icon="i-lucide-shield-check"
              :label="collapsed ? undefined : t('Admin')"
              :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
              :ui="{ trailingIcon: 'ms-auto text-dimmed' }"
            />
          </UDropdownMenu>
        </div>
      </template>
    </UDashboardSidebar>

    <UDashboardSearch v-model:open="searchOpen" :groups="searchGroups" :fuse="searchFuse" :color-mode="false" :placeholder="t('Search pages, settings, pilots and heats…')" />

    <div class="flex min-w-0 flex-1 flex-col">
      <div
        v-if="restartRequired && admin && !restartSnoozed && !kiosk"
        class="flex shrink-0 items-center gap-3 border-b border-amber-300/60 bg-amber-100 px-4 py-2 text-sm text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/15 dark:text-amber-100"
        role="status"
      >
        <UIcon :name="restarting ? 'i-lucide-loader-circle' : 'i-lucide-rotate-cw'" class="size-4 shrink-0" :class="restarting ? 'animate-spin' : ''" />
        <span class="min-w-0 flex-1 truncate">{{ restarting ? t('Restarting server…') : t('Restart the server to apply changed settings or plugins.') }}</span>
        <template v-if="!restarting">
          <UButton size="xs" color="neutral" variant="ghost" class="text-current" :label="t('Later')" @click="restartSnoozed = true" />
          <UButton size="xs" color="neutral" variant="solid" :label="t('Restart now')" @click="restartOpen = true" />
        </template>
      </div>
      <UBanner
        v-if="rh.status.everConnected && !rh.status.connected"
        icon="i-lucide-wifi-off"
        color="error"
        :title="restarting ? t('Server is restarting…') : t('Connection to the timer lost. Reconnecting…')"
      />
      <!-- bars that classic-page plugins add to <body> (classic-bridge.client.ts) -->
      <div
        id="rh-plugin-top"
        ref="pluginTop"
        class="shrink-0 max-w-full overflow-x-auto transition-[min-height] duration-200 ease-out"
        :style="{ minHeight: `${pluginTopReserve}px` }"
        :class="[
          kiosk ? 'hidden' : pluginTopGone ? 'empty:hidden' : '',
          pluginTopWaiting ? 'border-b border-default bg-elevated/50 [&>*]:invisible' : ''
        ]"
        :aria-busy="pluginTopWaiting || undefined"
      />
      <slot />
    </div>

    <RhLogin />
    <RhMessages v-model:open="messagesOpen" />
    <RhAlerts />

    <UModal v-model:open="aboutOpen" :title="t('About RotorHazard')">
      <template #body>
        <div class="space-y-4">
          <div class="flex items-center gap-4">
            <img :src="logoUrl" alt="" class="size-14">
            <div>
              <div class="font-display text-xl font-semibold">RotorHazard</div>
              <div class="text-sm text-muted">{{ version }}</div>
            </div>
          </div>
          <!-- eslint-disable-next-line vue/no-v-html -->
          <div class="rh-prose text-sm" v-html="info?.server?.about_html" />
          <div class="text-sm text-muted">
            {{ t('Clock sync') }}: ±{{ Math.ceil(rh.status.latencyMs / 2) }} ms
          </div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="restartOpen" :title="t('Restart server?')" :description="t('Races in progress will be stopped. The timer will be back in a few seconds.')">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="warning" :label="t('Restart')" @click="() => { restartServer(); close() }" />
        </div>
      </template>
    </UModal>

  </UDashboardGroup>
</template>
