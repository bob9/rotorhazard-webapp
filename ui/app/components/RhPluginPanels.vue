<script setup lang="ts">
/**
 * Plugin-registered UI panels for a page (rhapi.ui.register_panel). Uses the
 * same page keys as the classic interface: settings, format, run, marshal,
 * results, streams — so existing plugins appear where their authors expect.
 */
import type { Directive } from 'vue'

/** `columns`: lay panels out in two columns on wide screens (the Race page) */
const props = defineProps<{ page: string, title?: string, columns?: boolean }>()
const rh = useRH()
const { t } = useI18n()
const { admin } = useAuth()
const { saveField, pressButton, panelsFor } = usePluginUI()

rh.load([{ type: 'ui', value: props.page }])

// fields named "_…" are plugin-internal state (e.g. "_gate_cal_boot_run"), not settings
const visible = (fields?: any[]) => (fields || []).filter(f => !String(f?.name ?? '').startsWith('_'))

// Guests see only pure-Markdown panels. A panel built around fields or quick buttons acts
// on the timer, and its text alone ("Press Refresh to load…") makes no sense without
// them: keep it mounted (its scripts still run) but hidden.
const hasControls = (p: any) => !!(visible(p.settings).length || visible(p.fn_binds).length || p.quickbuttons?.length)
const panels = computed(() => panelsFor(props.page)
  .map((p: any) => ({
    ...p,
    guestHidden: admin.value !== true && hasControls(p),
    settings: admin.value === true ? visible(p.settings) : [],
    fn_binds: admin.value === true ? visible(p.fn_binds) : [],
    quickbuttons: admin.value === true ? (p.quickbuttons || []) : []
  }))
  .filter((p: any) => admin.value === true || p.markdowns?.length))

// collapsed panels are remembered on this device
const COLLAPSED_KEY = 'rh.collapsedPanels'
const openState = ref<Record<string, boolean>>({})
try { openState.value = JSON.parse(localStorage.getItem(COLLAPSED_KEY) || '{}') } catch { /* storage unavailable */ }
function isOpen(p: any) {
  return openState.value[p.panel.name] ?? true
}
function toggle(p: any) {
  openState.value[p.panel.name] = !isOpen(p)
  try { localStorage.setItem(COLLAPSED_KEY, JSON.stringify(openState.value)) } catch { /* storage unavailable */ }
}
function isEmptyPanel(p: any) {
  return !p.markdowns?.length && !p.settings.length && !p.fn_binds.length && !p.quickbuttons.length
}

/**
 * Markdown rows that render nothing visible (e.g. a lone <script> loader) are
 * hidden so they don't leave an empty row. They stay mounted so their scripts
 * run, and reappear if a script later fills them.
 */
const VISUAL = 'img,svg,canvas,iframe,video,audio,input,button,select,textarea,table,hr,object,embed'
function hasVisibleContent(el: HTMLElement) {
  if (el.querySelector(VISUAL)) return true
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest('script, style, template, noscript')) continue
    if (n.textContent?.trim()) return true
  }
  return false
}
// panel name + markdown name → renders nothing visible
const blank = reactive<Record<string, boolean>>({})
type BlankEl = HTMLElement & { _rhObs?: MutationObserver }
const vReportBlank: Directive<BlankEl, string> = {
  mounted(el, { value }) {
    const check = () => { blank[value] = !hasVisibleContent(el) }
    check()
    el._rhObs = new MutationObserver(check)
    el._rhObs.observe(el, { childList: true, subtree: true, characterData: true })
  },
  beforeUnmount(el, { value }) {
    el._rhObs?.disconnect()
    delete blank[value]
  }
}
const mdKey = (p: any, m: any) => `${p.panel.name}/${m.name}`
// a panel with nothing but blank Markdown (a loader script) stays mounted but hidden
function isBlankPanel(p: any) {
  return !!p.markdowns?.length && !p.settings.length && !p.fn_binds.length && !p.quickbuttons.length
    && p.markdowns.every((m: any) => blank[mdKey(p, m)])
}
</script>

<template>
  <div v-if="panels.length" :class="columns ? 'gap-6 xl:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid [&>*:last-child]:mb-0' : 'space-y-8'">
    <h2 v-if="title" class="font-display text-xl font-semibold" :class="{ 'xl:[column-span:all]': columns }">
      {{ title }}
    </h2>
    <RhGroup
      v-for="p in panels"
      v-show="!isBlankPanel(p) && !p.guestHidden"
      :id="`panel-${p.panel.name}`"
      :key="p.panel.name"
      :title="t(p.panel.label)"
    >
      <template #actions>
        <UButton
          color="neutral"
          variant="ghost"
          size="xs"
          :icon="isOpen(p) ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :aria-label="isOpen(p) ? 'Collapse' : 'Expand'"
          @click="toggle(p)"
        />
      </template>
      <!-- collapsed panels stay mounted (v-show) so their loader scripts keep running -->
      <div v-show="isOpen(p)" class="divide-y divide-default">
        <div v-for="m in p.markdowns" :key="m.name" v-report-blank="mdKey(p, m)" :class="{ hidden: blank[mdKey(p, m)] }">
          <RhMarkdown :source="m.desc" class="px-4 py-3" />
        </div>
        <RhField
          v-for="f in p.settings"
          :key="'s-' + f.name"
          :field="f"
          @commit="(v: any) => saveField(f, v)"
        />
        <RhField
          v-for="f in p.fn_binds"
          :key="'b-' + f.name"
          :field="f"
          @commit="(v: any) => saveField(f, v, true)"
        />
        <div
          v-if="p.quickbuttons.length"
          class="gap-2 px-4 py-3"
          :class="p.quickbuttons.length > 5 ? 'grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))]' : 'flex flex-wrap'"
        >
          <UButton
            v-for="b in p.quickbuttons"
            :key="b.name"
            color="neutral"
            variant="soft"
            :size="p.quickbuttons.length > 5 ? 'sm' : 'md'"
            :block="p.quickbuttons.length > 5"
            class="min-w-0"
            :ui="{ label: 'truncate' }"
            :title="t(b.label)"
            @click="pressButton(b.name)"
          >
            {{ t(b.label) }}
          </UButton>
        </div>
        <div v-if="isEmptyPanel(p)" class="px-4 py-3 text-sm text-muted">
          {{ t('No settings') }}
        </div>
      </div>
      <div v-if="!isOpen(p)" class="px-4 py-2.5 text-sm text-muted">
        {{ p.settings.length + p.fn_binds.length }} {{ t('settings') }}
      </div>
    </RhGroup>
  </div>
</template>
