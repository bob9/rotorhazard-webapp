<script setup lang="ts">
/** Editable heat: name, seats with pilots or seeding rules, status, plugin attributes. */
const props = defineProps<{ heat: any, admin: boolean, current?: boolean, attributes?: any[], showRound?: boolean }>()
const emit = defineEmits<{ select: [] }>()
const rh = useRH()
const { t } = useI18n()
const S = rh.state

const fdata = computed<any[]>(() => S.frequency_data?.fdata || [])
const seatColors = computed<Record<number, string>>(() => Object.fromEntries((S.seat_data?.seats || []).map((s: any) => [s.seat_id, s.color])))
const pilots = computed<any[]>(() => S.pilot_data?.pilots || [])
const heats = computed<any[]>(() => (S.heat_data?.heats || []).filter((h: any) => h.id !== props.heat.id))
const classes = computed<any[]>(() => S.class_data?.classes || [])
const locked = ref(!!props.heat.locked)
watch(() => props.heat.locked, (v) => { locked.value = !!v })
const confirmed = computed(() => props.heat.status === 2)
const planned = computed(() => (props.heat.auto_frequency || props.heat.dynamic) && !confirmed.value)
const editable = computed(() => props.admin && !locked.value)

// pilots not yet in any heat come first; the rest show which heat they're already in
const pilotHeats = computed(() => {
  const m: Record<number, string[]> = {}
  for (const h of S.heat_data?.heats || []) {
    for (const s of h.slots || []) if (s.pilot_id) (m[s.pilot_id] ||= []).push(h.displayname)
  }
  return m
})
const pilotItems = computed<any[]>(() => {
  const sorted = [...pilots.value].sort((a, b) => String(a.callsign).localeCompare(String(b.callsign)))
  const free = sorted.filter(p => !pilotHeats.value[p.pilot_id])
  const placed = sorted.filter(p => pilotHeats.value[p.pilot_id])
  const groups: any[] = [[{ label: t('None'), value: 0 }]]
  if (free.length) groups.push([{ type: 'label', label: t('Not in a heat') }, ...free.map(p => ({ label: p.callsign, value: p.pilot_id, description: pilotName(p) || undefined }))])
  if (placed.length) groups.push([{ type: 'label', label: t('Already in a heat') }, ...placed.map(p => ({ label: p.callsign, value: p.pilot_id, description: pilotHeats.value[p.pilot_id]!.join(', ') }))])
  return groups
})
const methodItems = computed(() => [
  { label: t('Pilot'), value: 0, icon: 'i-lucide-user' },
  { label: t('Heat result'), value: 1, icon: 'i-lucide-layers' },
  { label: t('Class result'), value: 2, icon: 'i-lucide-trophy' }
])
const heatItems = computed(() => heats.value.map(h => ({ label: h.displayname, value: h.id })))
const classItems = computed(() => classes.value.map(c => ({ label: c.displayname, value: c.id })))

function alter(data: Record<string, any>) {
  rh.emit('alter_heat', { heat: props.heat.id, ...data })
}
function setSlot(slot: any, data: Record<string, any>) {
  Object.assign(slot, data.pilot !== undefined ? { pilot_id: data.pilot || null } : {}, data.method !== undefined ? { method: data.method } : {})
  alter({ slot_id: slot.id, ...data })
}
// Slots: show seats on enabled nodes plus any holding a pilot or seeding rule. Databases can
// hold far more slots than the timer has nodes (or nodes with a frequency); collapse the rest.
const nodeCount = computed(() => fdata.value.length)
const enabledNodes = computed(() => fdata.value.filter(f => f?.frequency).length)
function hasRule(s: any) {
  return !!s.pilot_id || s.method === 1 || s.method === 2
}
function onEnabledNode(s: any) {
  return s.node_index !== null && s.node_index !== undefined && s.node_index < nodeCount.value && !!fdata.value[s.node_index]?.frequency
}
const slotSplit = computed(() => {
  const all = [...(props.heat.slots || [])].sort((a: any, b: any) => (a.node_index ?? 1e9) - (b.node_index ?? 1e9) || a.id - b.id)
  const shown: any[] = []
  const rest: any[] = []
  for (const s of all) (hasRule(s) || onEnabledNode(s) ? shown : rest).push(s)
  // seats of auto-frequency heats get a node only when the heat runs: offer one slot per enabled node
  while (shown.length < enabledNodes.value) {
    const i = rest.findIndex((s: any) => s.node_index === null || s.node_index === undefined)
    if (i < 0) break
    shown.push(...rest.splice(i, 1))
  }
  return { shown, rest }
})
const showUnused = ref(false)
const UNUSED_LIMIT = 24
const visibleSlots = computed(() => showUnused.value ? [...slotSplit.value.shown, ...slotSplit.value.rest.slice(0, UNUSED_LIMIT)] : slotSplit.value.shown)
function slotLabel(slot: any) {
  const unassigned = slot.node_index === null || slot.node_index === undefined
  if (unassigned || (planned.value && props.heat.auto_frequency)) return '·'
  return channelLabel(fdata.value[slot.node_index]) || `${t('Seat')} ${slot.node_index + 1}`
}

function slotPilot(slot: any) {
  return pilots.value.find(p => p.pilot_id === slot.pilot_id)
}
function seedLabel(slot: any) {
  if (slot.method === 1) return `${S.heat_data?.heats?.find((h: any) => h.id === slot.seed_id)?.displayname || t('Deleted Heat')} · ${t('Rank')} ${slot.seed_rank ?? '?'}`
  if (slot.method === 2) return `${classes.value.find(c => c.id === slot.seed_id)?.displayname || t('Class')} · ${t('Rank')} ${slot.seed_rank ?? '?'}`
  return ''
}

const unlockOpen = ref(false)
const deleteOpen = ref(false)
const menu = computed(() => [
  [
    props.heat.active === false
      ? { label: t('Activate'), icon: 'i-lucide-eye', onSelect: () => rh.emit('activate_heat', { heat: props.heat.id }) }
      : { label: t('Deactivate'), icon: 'i-lucide-eye-off', onSelect: () => rh.emit('deactivate_heat', { heat: props.heat.id }) },
    { label: t('Duplicate'), icon: 'i-lucide-copy', onSelect: () => rh.emit('duplicate_heat', { heat: props.heat.id }) },
    { label: props.heat.auto_frequency ? t('Assign channels manually') : t('Auto Frequency'), icon: 'i-lucide-radio', onSelect: () => alter({ auto_frequency: !props.heat.auto_frequency }) }
  ],
  [
    ...(locked.value ? [{ label: t('Unlock'), icon: 'i-lucide-lock-open', onSelect: () => { unlockOpen.value = true } }] : []),
    ...(!props.heat.locked ? [{ label: t('Delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteOpen.value = true } }] : [])
  ]
].filter(g => g.length))
</script>

<template>
  <div
    class="flex flex-col overflow-hidden rounded-2xl bg-default ring-1 transition-shadow"
    :class="[current ? 'ring-2 ring-primary shadow-md' : 'ring-default shadow-xs', heat.active === false ? 'opacity-55' : '']"
  >
    <div class="flex items-center gap-2 border-b border-default px-3 py-2">
      <!-- read-only and editable cards share the same metrics (32px name, 36px seat rows) -->
      <span v-if="!editable" class="block h-8 min-w-0 flex-1 truncate px-1.5 text-[15px] font-semibold leading-8 text-highlighted">{{ heat.displayname }}</span>
      <UInput
        v-else
        :model-value="heat.name || ''"
        :placeholder="heat.auto_name || heat.displayname"
        variant="ghost"
        class="min-w-0 flex-1"
        :ui="{ base: 'h-8 py-0 font-semibold text-highlighted text-[15px] md:text-[15px] px-1.5 placeholder:text-highlighted' }"
        :disabled="!editable"
        :aria-label="t('Heat name')"
        @change="(e: any) => alter({ name: e.target.value })"
      />
      <UTooltip v-if="locked && !admin" :text="t('Has saved races')">
        <UIcon name="i-lucide-lock" class="size-4 text-dimmed" />
      </UTooltip>
      <UBadge v-if="current" :label="t('Current')" size="sm" color="primary" variant="subtle" />
      <UBadge v-else-if="heat.active === false" :label="t('Inactive')" size="sm" color="neutral" variant="subtle" />
      <UDropdownMenu v-if="admin" :items="menu" :content="{ align: 'end' }">
        <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="t('Heat actions')" />
      </UDropdownMenu>
    </div>

    <div v-if="admin && locked" class="flex items-center gap-3 border-b border-default bg-elevated/40 px-4 py-2">
      <p class="min-w-0 flex-1 text-xs text-muted">
        {{ t('This heat has saved races. Unlock it to change pilots.') }}
      </p>
      <UButton size="xs" color="neutral" variant="outline" icon="i-lucide-lock-open" :label="t('Unlock')" @click="unlockOpen = true" />
    </div>

    <ul class="flex-1 divide-y divide-default/70">
      <li v-for="slot in visibleSlots" :key="slot.id" class="flex min-h-9 items-center gap-2 px-3 py-1">
        <div class="flex w-16 shrink-0 items-center gap-1.5">
          <span class="size-2.5 shrink-0 rounded-full" :style="{ background: seatColors[slot.node_index] || 'var(--ui-bg-accented)' }" />
          <span class="truncate text-xs tabular text-muted">{{ slotLabel(slot) }}</span>
        </div>

        <template v-if="!editable || confirmed || slot.method === 0 || slot.method === -1">
          <USelectMenu
            v-if="editable"
            :model-value="slot.pilot_id || undefined"
            :items="pilotItems"
            :placeholder="t('Add pilot…')"
            value-key="value"
            variant="ghost"
            size="sm"
            class="min-w-0 flex-1"
            :ui="{ base: 'h-7 text-sm md:text-sm font-medium text-highlighted' }"
            :search-input="{ placeholder: t('Find pilot…') }"
            @update:model-value="(v: any) => setSlot(slot, { pilot: v, ...(planned ? { method: 0 } : {}) })"
          />
          <span v-else class="block h-7 min-w-0 flex-1 truncate px-2.5 text-sm leading-7" :class="slotPilot(slot) ? 'font-medium text-highlighted' : 'text-dimmed'">
            {{ slotPilot(slot)?.callsign || seedLabel(slot) || '—' }}
          </span>
        </template>
        <template v-else>
          <USelect v-if="slot.method === 1" :model-value="slot.seed_id" :items="heatItems" size="sm" variant="ghost" class="min-w-0 flex-1" :placeholder="t('Heat')" @update:model-value="(v: any) => setSlot(slot, { seed_heat_id: v })" />
          <USelect v-else :model-value="slot.seed_id" :items="classItems" size="sm" variant="ghost" class="min-w-0 flex-1" :placeholder="t('Class')" @update:model-value="(v: any) => setSlot(slot, { seed_class_id: v })" />
          <UInputNumber :model-value="slot.seed_rank ?? 1" :min="1" size="sm" class="w-20" orientation="vertical" @update:model-value="(v: any) => setSlot(slot, { seed_rank: v })" />
        </template>

        <UDropdownMenu
          v-if="editable && !confirmed"
          :items="methodItems.map(m => ({ ...m, type: 'checkbox' as const, checked: (slot.method === -1 ? 0 : slot.method) === m.value, onUpdateChecked: () => setSlot(slot, { method: m.value, seed_heat_id: 0, seed_class_id: 0 }) }))"
          :content="{ align: 'end' }"
        >
          <UTooltip :text="t('Fill this seat with a pilot, or from a heat or class result')">
            <UButton icon="i-lucide-git-merge" color="neutral" variant="ghost" size="xs" :aria-label="t('Seeding')" :class="slot.method > 0 ? 'text-primary' : 'text-dimmed'" />
          </UTooltip>
        </UDropdownMenu>
      </li>
      <li v-if="!visibleSlots.length" class="px-4 py-3 text-sm text-dimmed">
        {{ t('No seats available') }}
      </li>
    </ul>
    <button
      v-if="slotSplit.rest.length"
      type="button"
      class="flex items-center gap-1.5 border-t border-default/70 px-4 py-2 text-left text-xs text-dimmed transition-colors hover:text-muted"
      :aria-expanded="showUnused"
      @click="showUnused = !showUnused"
    >
      <UIcon :name="showUnused ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-3.5" />
      <template v-if="!showUnused">
        +{{ slotSplit.rest.length }} {{ slotSplit.rest.length === 1 ? t('unused slot') : t('unused slots') }}
      </template>
      <template v-else>
        {{ t('Hide unused slots') }}<span v-if="slotSplit.rest.length > UNUSED_LIMIT"> · {{ slotSplit.rest.length - UNUSED_LIMIT }} {{ t('more not shown') }}</span>
      </template>
    </button>

    <div v-if="admin && (planned || (confirmed && (heat.auto_frequency || heat.dynamic) && !heat.locked))" class="flex items-center justify-between gap-2 border-t border-default bg-elevated/40 px-3 py-2">
      <span class="text-xs text-muted">{{ confirmed ? t('Seats confirmed') : t('Seats assigned when the heat runs') }}</span>
      <UButton v-if="!confirmed" size="xs" color="neutral" variant="soft" icon="i-lucide-wand-sparkles" :label="t('Seed Now')" @click="rh.emit('calc_pilots', { heat: heat.id })" />
      <UButton v-else size="xs" color="neutral" variant="soft" icon="i-lucide-undo-2" :label="t('Revert to Plan')" @click="rh.emit('calc_reset', { heat: heat.id })" />
    </div>

    <div v-if="attributes?.length" class="divide-y divide-default border-t border-default">
      <RhField
        v-for="a in attributes"
        :key="a.name"
        :field="a"
        :model-value="heat[a.name]"
        :disabled="!admin"
        @commit="(v: any) => { heat[a.name] = v; alter({ heat_attr: a.name, value: v }) }"
      />
    </div>

    <UModal v-model:open="unlockOpen" :title="t('Unlock heat?')" :description="t('Modifying a locked heat retroactively changes saved race data.')">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="warning" :label="t('Unlock')" @click="() => { locked = false; close() }" />
        </div>
      </template>
    </UModal>
    <UModal v-model:open="deleteOpen" :title="t('Delete heat?')" :description="heat.displayname">
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" :label="t('Delete')" @click="() => { rh.emit('delete_heat', { heat: heat.id }); close() }" />
        </div>
      </template>
    </UModal>
  </div>
</template>
