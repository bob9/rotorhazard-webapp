<script setup lang="ts">
/**
 * Settings: a section list (left column on desktop, its own screen on mobile)
 * and the selected section, rendered by the child route in <NuxtPage />.
 * Child pages render only their content; the panel, navbar and section
 * heading come from here.
 */
const route = useRoute()
const { t } = useI18n()
const { admin, loginOpen } = useAuth()
const { info } = useServerInfo()

interface Section {
  to: string
  label: string
  description: string
  icon: string
  tile: string
  guest?: boolean
  /** reachable by URL, but not listed (hardware not enabled) */
  hidden?: boolean
}

const groups = computed<Section[][]>(() => {
  const i = info.value
  return [
    [
      { to: '/settings/general', label: t('General'), description: t('Timer name, language, appearance and admin login.'), icon: 'i-lucide-settings', tile: 'bg-zinc-500' },
      { to: '/settings/audio', label: t('Audio'), description: t('Voice settings apply to this device only.'), icon: 'i-lucide-volume-2', tile: 'bg-rose-500', guest: true }
    ],
    [
      { to: '/settings/actions', label: t('Event Actions'), description: t('Run effects automatically when race events happen.'), icon: 'i-lucide-zap', tile: 'bg-amber-500' },
      { to: '/settings/leds', label: t('LEDs'), description: t('Choose the LED effect shown for each race event.'), icon: 'i-lucide-lightbulb', tile: 'bg-yellow-500', hidden: !(i?.led_enabled || i?.led_events_enabled) },
      { to: '/settings/vrx', label: t('VRx Control'), description: t('Video receivers connected to the timer.'), icon: 'i-lucide-tv', tile: 'bg-indigo-500', hidden: !i?.vrx_enabled }
    ],
    [
      { to: '/settings/plugins', label: t('Plugins & Streams'), description: t('Settings provided by plugins, and stream overlays.'), icon: 'i-lucide-puzzle', tile: 'bg-violet-500' }
    ],
    [
      { to: '/settings/data', label: t('Data & Backups'), description: t('Event backups, import and export, and server settings files.'), icon: 'i-lucide-hard-drive', tile: 'bg-sky-500' },
      { to: '/settings/cluster', label: t('Secondary Timers'), description: t('Split and mirror timers connected to this timer.'), icon: 'i-lucide-network', tile: 'bg-teal-500' },
      { to: '/settings/system', label: t('System'), description: t('Restart, shut down, logs and advanced options.'), icon: 'i-lucide-cpu', tile: 'bg-slate-500' }
    ]
  ]
})

const visibleGroups = computed(() => groups.value
  .map(g => g.filter(s => !s.hidden && (admin.value !== false || s.guest)))
  .filter(g => g.length))

const current = computed(() => groups.value.flat().find(s => route.path === s.to || route.path.startsWith(s.to + '/')))
const atIndex = computed(() => route.path.replace(/\/+$/, '') === '/settings')
const locked = computed(() => admin.value === false && current.value && !current.value.guest)

// the bar above a section names it only once the section's own large heading has scrolled away
const heading = useTemplateRef<HTMLElement>('heading')
const headingVisible = ref(true)
let headingIO: IntersectionObserver | undefined
watch(heading, (el) => {
  headingIO?.disconnect()
  headingVisible.value = true
  if (!el || typeof IntersectionObserver === 'undefined') return
  headingIO = new IntersectionObserver(([e]) => { headingVisible.value = !!e?.isIntersecting })
  headingIO.observe(el)
})
onBeforeUnmount(() => headingIO?.disconnect())

useHead(() => ({ title: current.value ? `${current.value.label} · ${t('Settings')}` : t('Settings') }))
</script>

<template>
  <div class="flex min-h-0 min-w-0 flex-1">
    <!-- section list -->
    <UDashboardPanel
      id="settings-nav"
      :default-size="19"
      :min-size="16"
      :max-size="26"
      resizable
      :class="atIndex ? '' : 'max-lg:hidden'"
      :ui="{ body: 'gap-6 lg:gap-5 p-4 sm:p-6 lg:p-3' }"
    >
      <template #header>
        <UDashboardNavbar :title="t('Settings')">
          <template #right>
            <RhBell class="lg:hidden" />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <nav class="space-y-6 lg:space-y-5" :aria-label="t('Settings')">
          <ul
            v-for="(group, gi) in visibleGroups"
            :key="gi"
            class="max-lg:overflow-hidden max-lg:rounded-2xl max-lg:bg-default max-lg:ring-1 max-lg:ring-default max-lg:divide-y max-lg:divide-default max-lg:shadow-xs lg:space-y-0.5"
          >
            <li v-for="s in group" :key="s.to">
              <NuxtLink
                :to="s.to"
                class="group flex items-center gap-3 px-4 py-2.5 transition-colors max-lg:min-h-12 max-lg:hover:bg-elevated/60 lg:rounded-lg lg:px-2 lg:py-1.5"
                :class="current?.to === s.to ? 'lg:bg-elevated lg:ring-1 lg:ring-default' : 'lg:hover:bg-elevated/60'"
                :aria-current="current?.to === s.to ? 'page' : undefined"
              >
                <span class="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-white shadow-xs lg:size-6 lg:rounded-md" :class="s.tile">
                  <UIcon :name="s.icon" class="size-4 lg:size-3.5" />
                </span>
                <span
                  class="min-w-0 flex-1 truncate text-[15px] lg:text-sm"
                  :class="current?.to === s.to ? 'font-semibold text-highlighted' : 'text-highlighted'"
                >{{ s.label }}</span>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-dimmed lg:hidden" />
              </NuxtLink>
            </li>
          </ul>

          <div v-if="admin === false" class="rounded-2xl bg-elevated/50 p-4 text-sm text-muted">
            <p>{{ t('Sign in as admin to change timer settings.') }}</p>
            <UButton class="mt-3" size="sm" icon="i-lucide-lock-keyhole" :label="t('Sign in as admin')" @click="loginOpen = true" />
          </div>
        </nav>
      </template>
    </UDashboardPanel>

    <!-- selected section -->
    <UDashboardPanel id="settings-content" :class="atIndex ? 'max-lg:hidden' : ''">
      <template #header>
        <!-- the open section's name appears here once its large heading has scrolled out of view -->
        <UDashboardNavbar
          :title="current?.label || ''"
          :toggle="false"
          :ui="{ left: 'gap-1', title: `transition-opacity duration-200 ${current && headingVisible ? 'opacity-0' : 'opacity-100'}` }"
        >
          <template #leading>
            <UButton
              to="/settings"
              icon="i-lucide-chevron-left"
              color="neutral"
              variant="ghost"
              class="-ms-2.5 lg:hidden"
              :label="t('Settings')"
            />
          </template>
          <template #right>
            <RhBell />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div class="mx-auto w-full max-w-3xl space-y-8 pb-10">
          <header v-if="current" class="flex items-center gap-4 pt-1">
            <span class="flex size-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm" :class="current.tile">
              <UIcon :name="current.icon" class="size-6" />
            </span>
            <div class="min-w-0">
              <h1 ref="heading" class="font-display text-2xl font-semibold tracking-tight text-highlighted sm:text-[28px]">
                {{ current.label }}
              </h1>
              <p class="mt-0.5 text-sm text-muted">
                {{ current.description }}
              </p>
            </div>
          </header>

          <UEmpty
            v-if="locked"
            icon="i-lucide-lock-keyhole"
            :title="t('Sign in to change settings')"
            :description="t('Timer settings are available to the event admin.')"
            :actions="[{ label: t('Sign in as admin'), icon: 'i-lucide-lock-keyhole', onClick: () => { loginOpen = true } }]"
          />
          <NuxtPage v-else />
        </div>
      </template>
    </UDashboardPanel>
  </div>
</template>
