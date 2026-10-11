<script setup lang="ts">
/** VRx diagnostics (the classic /vrxstatus page): controllers and devices as the timer sees them. */
const { t } = useI18n()
const rh = useRH()
useHead({ title: computed(() => t('VRx Status')) })
rh.load(['vrx_list', 'pilot_data'])

const list = computed(() => rh.state.vrx_list || null)
const controllers = computed(() => Object.entries<any>(list.value?.controllers || {}))
const devices = computed(() => Object.entries<any>(list.value?.devices || {}))

// fields shown in plain words; anything else goes under "Raw details"
const KNOWN = ['id', 'name', 'type', 'address', 'ready', 'connected', 'video_lock', 'response_time', 'map']
const facts = (d: any) => [
  { label: t('Type'), value: d.type },
  { label: t('Address'), value: d.address },
  { label: t('Response time'), value: d.response_time != null ? `${d.response_time} ms` : null }
].filter(f => f.value != null && f.value !== '')
const flags = (d: any) => [
  { label: t('Ready'), on: d.ready },
  { label: t('Connected'), on: d.connected },
  { label: t('Video lock'), on: d.video_lock }
].filter(f => typeof f.on === 'boolean')

// VRxDeviceMethod on the server: 0 all events, 1 one pilot, 2 one seat
function assignment(map: any) {
  if (!map) return null
  if (map.method === 1) {
    const p = (rh.state.pilot_data?.pilots || []).find((x: any) => x.pilot_id === map.pilot_id)
    return `${t('Pilot')}: ${p?.callsign ?? map.pilot_id ?? '—'}`
  }
  if (map.method === 2) return `${t('Seat')} ${(Number(map.seat) || 0) + 1}`
  return `${t('All seats')}${map.seat != null ? ` · ${t('Seat')} ${Number(map.seat) + 1}` : ''}`
}
function raw(d: any) {
  const rest = Object.fromEntries(Object.entries(d).filter(([k, v]) => !KNOWN.includes(k) && v !== null && !(typeof v === 'object' && !Object.keys(v as object).length)))
  return Object.keys(rest).length ? JSON.stringify(rest, null, 2) : ''
}
</script>

<template>
  <UDashboardPanel id="vrx-status">
    <template #header>
      <UDashboardNavbar :title="t('VRx Status')">
        <template #leading>
          <UButton icon="i-lucide-chevron-left" color="neutral" variant="ghost" to="/settings/system" :aria-label="t('System')" />
        </template>
        <template #right>
          <RhBell />
          <UButton color="neutral" variant="ghost" icon="i-lucide-refresh-cw" :aria-label="t('Refresh')" @click="rh.refresh(['vrx_list'])" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8">
        <p class="text-sm text-muted">
          {{ t('Diagnostic view of VRx controllers and the video receivers they report.') }}
        </p>
        <div v-if="!list" class="grid gap-4 sm:grid-cols-2">
          <USkeleton v-for="i in 2" :key="i" class="h-40 rounded-2xl" />
        </div>
        <UEmpty v-else-if="!controllers.length && !devices.length" icon="i-lucide-tv" :title="t('No VRx controllers')" :description="t('Enable a VRx controller plugin to see its receivers here.')" variant="naked" />
        <template v-else>
          <RhGroup v-if="controllers.length" :title="t('Controllers')">
            <RhRow v-for="[id, c] in controllers" :key="id" :label="id" :description="`${c.devices ?? 0} ${c.devices === 1 ? t('device') : t('devices')}`" icon="i-lucide-router" inline>
              <UBadge :color="c.ready ? 'success' : 'neutral'" variant="subtle" :label="c.ready ? t('Ready') : t('Not ready')" />
            </RhRow>
          </RhGroup>

          <section v-if="devices.length" class="space-y-3">
            <h2 class="px-1 text-xs font-semibold uppercase tracking-wider text-muted">
              {{ t('Devices') }}
            </h2>
            <div class="grid gap-4 sm:grid-cols-2">
              <UCard v-for="[key, d] in devices" :key="key" :ui="{ body: 'space-y-4' }">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate font-medium text-highlighted">{{ d.name || d.id || key }}</div>
                    <div class="truncate text-xs text-muted">{{ key }}</div>
                  </div>
                  <UIcon name="i-lucide-tv" class="size-5 shrink-0 text-muted" />
                </div>
                <div class="flex flex-wrap gap-1.5">
                  <UBadge
                    v-for="f in flags(d)"
                    :key="f.label"
                    :color="f.on ? 'success' : 'neutral'"
                    variant="subtle"
                    :icon="f.on ? 'i-lucide-check' : 'i-lucide-x'"
                    :label="f.label"
                  />
                </div>
                <dl class="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
                  <template v-if="assignment(d.map)">
                    <dt class="text-muted">{{ t('Shows') }}</dt>
                    <dd class="min-w-0 break-words">{{ assignment(d.map) }}</dd>
                  </template>
                  <template v-for="f in facts(d)" :key="f.label">
                    <dt class="text-muted">{{ f.label }}</dt>
                    <dd class="tabular min-w-0 break-words">{{ f.value }}</dd>
                  </template>
                </dl>
                <UCollapsible v-if="raw(d)">
                  <UButton color="neutral" variant="link" size="xs" class="px-0" trailing-icon="i-lucide-chevron-down" :label="t('Raw details')" />
                  <template #content>
                    <pre class="mt-2 overflow-x-auto rounded-lg bg-elevated p-3 font-mono text-xs">{{ raw(d) }}</pre>
                  </template>
                </UCollapsible>
              </UCard>
            </div>
          </section>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
