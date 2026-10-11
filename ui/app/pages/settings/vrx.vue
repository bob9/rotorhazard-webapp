<script setup lang="ts">
/** VRx Control: video receivers reported by VRx controller plugins, and their seat. */
const rh = useRH()
const { t } = useI18n()
const { info } = useServerInfo()

rh.load(['vrx_list', 'frequency_data'])

const vrx = computed(() => rh.state.vrx_list)
const controllers = computed(() => Object.entries<any>(vrx.value?.controllers || {}))
const devices = computed(() => Object.entries<any>(vrx.value?.devices || {})
  // the dict key ("<controller>:<device id>") is what set_vrx_node expects; keep the
  //  device's own id separately for display
  .map(([id, d]) => ({ ...d, deviceId: d.id, id }))
  .sort((a, b) => String(a.name || a.id).localeCompare(String(b.name || b.id))))

const numNodes = computed(() => info.value?.num_nodes ?? rh.state.frequency_data?.fdata?.length ?? 0)
const seatItems = computed(() => Array.from({ length: numNodes.value }, (_, i) => {
  const f = rh.state.frequency_data?.fdata?.[i]
  const chan = f?.band && f?.channel ? ` · ${f.band}${f.channel}` : ''
  return { label: `${t('Seat')} ${i + 1}${chan}`, value: i }
}))

function status(d: any) {
  if (!d.connected) return { label: t('Unreachable'), color: 'error' as const }
  if (!d.ready) return { label: t('Not Ready'), color: 'warning' as const }
  return { label: t('Ready'), color: 'success' as const }
}
function cameraFormat(d: any) {
  const p = d.extended_properties || {}
  if (!('cam_forced_or_auto' in p) || !('chosen_camera_type' in p)) return null
  const mode = ({ A: t('Auto'), F: t('Forced') } as Record<string, string>)[p.cam_forced_or_auto] || p.cam_forced_or_auto
  const type = ({ N: t('NTSC'), P: t('PAL') } as Record<string, string>)[p.chosen_camera_type] || p.chosen_camera_type
  return `${mode}: ${type}`
}
function address(d: any) {
  return d.address || d.ip || ''
}
function setSeat(d: any, node: number) {
  if (d.map) d.map.seat = node
  rh.emit('set_vrx_node', { vrx_id: d.id, node })
}
</script>

<template>
  <div class="space-y-8">
    <div v-if="!vrx" class="space-y-4">
      <USkeleton class="h-24 w-full rounded-2xl" />
      <USkeleton class="h-48 w-full rounded-2xl" />
    </div>

    <UEmpty
      v-else-if="!vrx.enabled"
      icon="i-lucide-tv"
      :title="t('VRx control is not enabled')"
      :description="t('Install and configure a VRx controller plugin to manage video receivers.')"
    />

    <template v-else>
      <RhGroup :title="t('Controllers')">
        <RhRow
          v-for="[name, c] in controllers"
          :key="name"
          :label="name"
          :description="`${c.devices ?? 0} ${t('devices')}`"
          icon="i-lucide-router"
        >
          <UBadge :label="c.ready ? t('Ready') : t('Not Ready')" :color="c.ready ? 'success' : 'warning'" variant="subtle" />
        </RhRow>
        <div v-if="!controllers.length" class="flex items-center gap-3 px-4 py-3 text-sm text-muted">
          <UIcon name="i-lucide-unplug" class="size-5 text-warning" />
          {{ t('No connection to VRx communications server (MQTT)') }}
        </div>
      </RhGroup>

      <RhGroup v-if="devices.length" :title="t('Connected Devices')" :footer="t('Changing a seat may cause the pilot to lose video.')">
        <div v-for="d in devices" :key="d.id" class="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-elevated text-muted">
              <UIcon name="i-lucide-tv-minimal" class="size-5" />
            </span>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <span class="truncate text-[15px] font-medium text-highlighted">{{ d.name || d.deviceId }}</span>
                <UBadge :label="status(d).label" :color="status(d).color" variant="subtle" size="sm" />
                <UBadge
                  v-if="d.connected && d.ready && 'video_lock' in d"
                  :label="d.video_lock ? t('Locked') : t('Unlocked')"
                  :icon="d.video_lock ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                  :color="d.video_lock ? 'neutral' : 'warning'"
                  variant="outline"
                  size="sm"
                />
              </div>
              <div class="mt-0.5 flex flex-wrap gap-x-3 text-[13px] text-muted">
                <a v-if="address(d)" :href="`http://${address(d)}`" target="_blank" rel="noopener" class="hover:text-highlighted hover:underline">{{ d.deviceId }}</a>
                <span v-else>{{ d.deviceId }}</span>
                <span v-if="d.type">{{ d.type }}</span>
                <span v-if="cameraFormat(d)">{{ cameraFormat(d) }}</span>
              </div>
            </div>
          </div>
          <USelect
            v-if="d.connected && d.ready && d.map"
            :model-value="d.map.seat"
            :items="seatItems"
            icon="i-lucide-armchair"
            class="w-full sm:w-48"
            :aria-label="t('Seat')"
            @update:model-value="(v: any) => setSeat(d, Number(v))"
          />
        </div>
      </RhGroup>

      <UEmpty
        v-else
        icon="i-lucide-tv"
        :title="t('No video receivers found')"
        :description="t('Receivers appear here when they connect to the VRx controller.')"
      />
    </template>
  </div>
</template>
