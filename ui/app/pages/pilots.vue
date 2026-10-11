<script setup lang="ts">
const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Pilots')) })
const { admin } = useAuth()
const audio = useAudio()
const toast = useToast()
rh.load(['pilot_data', 'seat_data', 'heat_data', 'class_data', 'frequency_data', { type: 'config', value: { LED: ['ledColorMode'], UI: ['pilotSort'] } }])

const S = rh.state
const pilots = computed<any[]>(() => S.pilot_data?.pilots || [])
const attributes = computed<any[]>(() => S.pilot_data?.attributes || [])
const sortKey = ref<string>('name')
watch(() => S.pilot_data?.pilotSort, (v) => { if (v) sortKey.value = v }, { immediate: true })
const query = ref('')

const sorted = computed(() => {
  const q = query.value.trim().toLowerCase()
  const list = pilots.value.filter(p => !q || [p.callsign, pilotName(p), p.team].some(v => String(v || '').toLowerCase().includes(q)))
  const key = sortKey.value
  // pilots without a name (or with the placeholder new pilots get) sort by callsign
  const sortValue = (p: any) => key === 'name' ? pilotName(p) || String(p.callsign || '') : String(p[key] || '')
  return [...list].sort((a, b) => key === 'id' ? a.pilot_id - b.pilot_id : sortValue(a).localeCompare(sortValue(b), undefined, { sensitivity: 'base' }))
})
const sortItems = computed(() => [
  { label: t('Name'), value: 'name' },
  { label: t('Callsign'), value: 'callsign' },
  { label: t('Pilot ID'), value: 'id' }
])
function setSort(v: string) {
  sortKey.value = v
  rh.emit('set_config', { section: 'UI', key: 'pilotSort', value: v })
}

// heats each pilot is in
const heatsByPilot = computed(() => {
  const m: Record<number, string[]> = {}
  for (const h of S.heat_data?.heats || []) {
    for (const s of h.slots || []) if (s.pilot_id) (m[s.pilot_id] ||= []).push(h.displayname)
  }
  return m
})

// add the pilot to a heat: first empty seat on an enabled node
const fdata = computed<any[]>(() => S.frequency_data?.fdata || [])
function freeSlot(h: any) {
  const enabled = fdata.value.filter(f => f?.frequency).length
  const slots = [...(h.slots || [])].sort((a: any, b: any) => (a.node_index ?? 1e9) - (b.node_index ?? 1e9) || a.id - b.id)
  const empty = (s: any) => !s.pilot_id && !(s.method === 1 || s.method === 2)
  const onNode = slots.find((s: any) => empty(s) && s.node_index !== null && s.node_index !== undefined && s.node_index < fdata.value.length && fdata.value[s.node_index]?.frequency)
  if (onNode) return onNode
  // auto-frequency heats assign nodes when the heat runs; allow one pilot per enabled node
  const used = slots.filter((s: any) => !empty(s)).length
  if (used < enabled) return slots.find((s: any) => empty(s) && (s.node_index === null || s.node_index === undefined))
  return undefined
}
const heatPickerItems = computed(() => {
  const p = editing.value
  if (!p) return []
  const heats = (S.heat_data?.heats || []).filter((h: any) => h.active !== false)
  const classes = [...(S.class_data?.classes || [])].sort((a: any, b: any) => (a.order ?? a.id) - (b.order ?? b.id))
  const item = (h: any) => {
    const inHeat = (h.slots || []).some((s: any) => s.pilot_id === p.pilot_id)
    return {
      label: h.displayname,
      value: h.id,
      disabled: inHeat || !!h.locked,
      description: inHeat ? t('Already in this heat') : h.locked ? t('Has saved races') : undefined
    }
  }
  const groups: any[][] = []
  for (const c of classes) {
    const hs = heats.filter((h: any) => h.class_id === c.id)
    if (hs.length) groups.push([{ type: 'label', label: c.displayname }, ...hs.map(item)])
  }
  const none = heats.filter((h: any) => !h.class_id)
  if (none.length) groups.push([...(classes.length ? [{ type: 'label', label: t('Unclassified') }] : []), ...none.map(item)])
  return groups
})
const pickerKey = ref(0)
function addToHeat(heatId: number) {
  pickerKey.value++
  const p = editing.value
  const h = (S.heat_data?.heats || []).find((x: any) => x.id === heatId)
  if (!p || !h) return
  const slot = freeSlot(h)
  if (!slot) {
    toast.add({ title: t('No free seat'), description: `${h.displayname} ${t('has no empty seat on an enabled node.')}`, icon: 'i-lucide-circle-alert', color: 'warning' })
    return
  }
  rh.emit('alter_heat', { heat: h.id, slot_id: slot.id, pilot: p.pilot_id, ...(slot.method !== 0 ? { method: 0 } : {}) })
  // the server doesn't echo heat_data to the sender; reflect the change locally
  Object.assign(slot, { pilot_id: p.pilot_id, method: 0 })
  toast.add({ title: t('Added to heat'), description: `${p.callsign || t('Pilot')} → ${h.displayname}`, icon: 'i-lucide-check' })
}

function alter(p: any, field: string, value: any) {
  if (p[field === 'team_name' ? 'team' : field] === value) return
  p[field === 'team_name' ? 'team' : field] = value
  rh.emit('alter_pilot', { pilot_id: p.pilot_id, [field]: value })
}
function alterAttr(p: any, name: string, value: any) {
  p[name] = value
  rh.emit('alter_pilot', { pilot_id: p.pilot_id, pilot_attr: name, value })
}

// add: focus the new pilot's callsign once it arrives
const focusNew = ref(false)
const knownIds = ref(new Set<number>())
function addPilot() {
  knownIds.value = new Set(pilots.value.map(p => p.pilot_id))
  focusNew.value = true
  query.value = ''
  rh.emit('add_pilot')
}
watch(pilots, async (list) => {
  if (!focusNew.value) return
  const fresh = list.find(p => !knownIds.value.has(p.pilot_id))
  if (!fresh) return
  focusNew.value = false
  await nextTick()
  const el = document.querySelector<HTMLInputElement>(`[data-pilot-callsign="${fresh.pilot_id}"]`)
  el?.focus()
  el?.select()
})

// detail sheet
const editing = ref<any>(null)
const deleteTarget = ref<any>(null)
function remove() {
  rh.emit('delete_pilot', { pilot: deleteTarget.value.pilot_id })
  toast.add({ title: t('Pilot deleted'), description: deleteTarget.value.callsign, icon: 'i-lucide-trash-2' })
  deleteTarget.value = null
  editing.value = null
}
// a row's "…" menu: the details sheet, the spoken name and (admins) delete
function rowMenu(p: any) {
  return [
    [{ label: admin.value ? t('Edit details') : t('Details'), icon: admin.value ? 'i-lucide-pencil' : 'i-lucide-info', onSelect: () => { editing.value = p } },
      { label: t('Hear name'), icon: 'i-lucide-volume-2', onSelect: () => sayName(p) }],
    ...(admin.value ? [[{ label: t('Delete'), icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleteTarget.value = p } }]] : [])
  ]
}
function sayName(p: any) {
  audio.unlock()
  audio.speak(p.phonetic || p.callsign, true)
}

const teams = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
function teamItems(p: any) {
  return p.team && !teams.includes(p.team) ? [p.team, ...teams] : teams
}

// seat colors (a modal; on phones it's reached from the view menu with sorting)
const colorsOpen = ref(false)
const viewMenu = computed(() => [
  [{ type: 'label' as const, label: t('Sort') }, ...sortItems.value.map(i => ({
    label: i.label,
    type: 'checkbox' as const,
    checked: sortKey.value === i.value,
    onUpdateChecked: () => setSort(i.value)
  }))],
  ...(admin.value ? [[{ label: t('Colors'), icon: 'i-lucide-palette', onSelect: () => { colorsOpen.value = true } }]] : [])
])

// LED colour mode: 0 seat, 1 pilot, 2 frequency (anything else counts as seat)
const cfg = useConfig()
cfg.load({ LED: ['ledColorMode'] })
const colorMode = ref<string>('0')
watch(() => cfg.get('LED', 'ledColorMode', 0), (v) => {
  colorMode.value = ['0', '1', '2'].includes(String(v)) ? String(v) : '0'
}, { immediate: true })
const colorModeItems = computed(() => [
  { label: t('Seat'), value: '0' },
  { label: t('Pilot'), value: '1' },
  { label: t('Frequency'), value: '2' }
])
function setColorMode(v: string) {
  colorMode.value = v
  cfg.set('LED', 'ledColorMode', Number(v))
}
</script>

<template>
  <UDashboardPanel id="pilots">
    <template #header>
      <UDashboardNavbar :title="t('Pilots')">
        <template #trailing>
          <UBadge :label="String(pilots.length)" variant="subtle" color="neutral" />
        </template>
        <template #right>
          <RhBell />
          <UButton v-if="admin" icon="i-lucide-plus" :label="t('Add Pilot')" @click="addPilot" />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar :ui="{ left: 'flex-1 sm:flex-none' }">
        <template #left>
          <UInput v-model="query" icon="i-lucide-search" :placeholder="t('Search pilots')" class="w-full sm:w-72" variant="soft" />
        </template>
        <template #right>
          <USelect :model-value="sortKey" :items="sortItems" size="sm" variant="ghost" icon="i-lucide-arrow-down-up" class="hidden w-36 sm:flex" @update:model-value="setSort" />
          <UButton v-if="admin" color="neutral" variant="ghost" size="sm" icon="i-lucide-palette" :label="t('Colors')" class="hidden sm:flex" @click="colorsOpen = true" />
          <!-- phones: one menu for sort and colors -->
          <UDropdownMenu :items="viewMenu" :content="{ align: 'end' }" class="sm:hidden">
            <UButton color="neutral" variant="ghost" icon="i-lucide-sliders-horizontal" :aria-label="t('View options')" class="sm:hidden" />
          </UDropdownMenu>
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-5xl">
        <div v-if="!pilots.length && S.pilot_data" class="flex justify-center pb-2 pt-6">
          <RhArt name="empty-pilots" class="w-full max-w-sm rounded-3xl shadow-lg" />
        </div>
        <UEmpty
          v-if="!pilots.length && S.pilot_data"
          icon="i-lucide-users"
          :title="t('No pilots yet')"
          :description="t('Add the pilots racing at this event. You can then put them into heats.')"
          :actions="admin ? [{ label: t('Add Pilot'), icon: 'i-lucide-plus', onClick: addPilot }] : []"
        />
        <div v-else class="overflow-hidden rounded-2xl bg-default ring-1 ring-default">
          <table class="w-full text-sm">
            <thead class="border-b border-default bg-elevated/40">
              <tr class="text-left text-[11px] font-semibold uppercase tracking-wider text-dimmed">
                <th class="w-12 py-2.5 pl-4" />
                <th class="px-3.5 py-2.5">
                  {{ t('Callsign') }}
                </th>
                <th class="px-3.5 py-2.5">
                  {{ t('Name') }}
                </th>
                <th class="hidden w-24 px-3 py-2.5 md:table-cell">
                  {{ t('Team') }}
                </th>
                <th class="hidden px-2 py-2.5 lg:table-cell">
                  {{ t('Heats') }}
                </th>
                <th class="w-12 py-2.5 pr-4" />
              </tr>
            </thead>
            <TransitionGroup tag="tbody" name="rh" class="divide-y divide-default">
              <tr v-for="p in sorted" :key="p.pilot_id" class="group hover:bg-elevated/40">
                <td class="py-1.5 pl-4">
                  <UPopover v-if="admin && p.color">
                    <button type="button" class="block size-6 rounded-full ring-2 ring-default transition-transform hover:scale-110" :style="{ background: p.color }" :aria-label="t('Color')" />
                    <template #content>
                      <UColorPicker :model-value="p.color" class="p-2" @update:model-value="(c: any) => alter(p, 'color', c)" />
                    </template>
                  </UPopover>
                  <span v-else class="block size-6 rounded-full ring-2 ring-default" :style="{ background: p.color || 'var(--ui-bg-accented)' }" />
                </td>
                <td class="px-1 py-1">
                  <UInput
                    :model-value="p.callsign"
                    :data-pilot-callsign="p.pilot_id"
                    variant="ghost"
                    class="w-full"
                    :ui="{ base: 'font-semibold text-highlighted disabled:opacity-100 disabled:cursor-default' }"
                    :placeholder="t('Callsign')"
                    :disabled="!admin"
                    :aria-label="t('Callsign')"
                    @change="(e: any) => alter(p, 'callsign', e.target.value)"
                  />
                </td>
                <td class="px-1 py-1">
                  <UInput :model-value="pilotName(p)" variant="ghost" class="w-full" :ui="{ base: 'disabled:opacity-100 disabled:cursor-default' }" :placeholder="t('Name')" :disabled="!admin" :aria-label="t('Name')" @change="(e: any) => alter(p, 'name', e.target.value)" />
                </td>
                <td class="hidden px-1 py-1 md:table-cell">
                  <USelect :model-value="p.team" :items="teamItems(p)" variant="ghost" size="sm" class="w-16" :ui="{ base: 'px-2' }" :disabled="!admin" :aria-label="t('Team')" @update:model-value="(v: any) => alter(p, 'team_name', v)" />
                </td>
                <td class="hidden px-2 py-1 text-muted lg:table-cell">
                  <span class="line-clamp-1">{{ (heatsByPilot[p.pilot_id] || []).join(', ') || '—' }}</span>
                </td>
                <td class="py-1 pr-3 text-right">
                  <UDropdownMenu :items="rowMenu(p)" :content="{ align: 'end' }">
                    <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" :aria-label="`${t('Actions')}: ${p.callsign}`" />
                  </UDropdownMenu>
                </td>
              </tr>
            </TransitionGroup>
          </table>
          <div v-if="admin" class="border-t border-default p-2">
            <UButton block color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('Add Pilot')" @click="addPilot" />
          </div>
        </div>
      </div>

      <USlideover :open="!!editing" :title="editing?.callsign || t('Pilot')" :description="pilotName(editing) || undefined" @update:open="(o: boolean) => { if (!o) editing = null }">
        <template #body>
          <div v-if="editing" class="space-y-6">
            <RhGroup :title="t('Pilot')">
              <RhRow :label="t('Callsign')">
                <UInput :model-value="editing.callsign" class="w-full sm:w-56" :disabled="!admin" @change="(e: any) => alter(editing, 'callsign', e.target.value)" />
              </RhRow>
              <RhRow :label="t('Name')">
                <UInput :model-value="pilotName(editing)" class="w-full sm:w-56" :placeholder="t('Name')" :disabled="!admin" @change="(e: any) => alter(editing, 'name', e.target.value)" />
              </RhRow>
              <RhRow :label="t('Phonetic')" :description="t('How announcers say the callsign.')">
                <UFieldGroup>
                  <UInput :model-value="editing.phonetic" class="w-40" :placeholder="editing.callsign" :disabled="!admin" @change="(e: any) => alter(editing, 'phonetic', e.target.value)" />
                  <UButton color="neutral" variant="outline" icon="i-lucide-volume-2" :aria-label="t('Play')" @click="sayName(editing)" />
                </UFieldGroup>
              </RhRow>
              <RhRow :label="t('Team')">
                <USelect :model-value="editing.team" :items="teamItems(editing)" class="w-24" :disabled="!admin" @update:model-value="(v: any) => alter(editing, 'team_name', v)" />
              </RhRow>
              <RhRow v-if="editing.color" :label="t('Color')">
                <UPopover>
                  <UButton color="neutral" variant="outline" :label="editing.color">
                    <template #leading>
                      <span class="size-4 rounded-full" :style="{ background: editing.color }" />
                    </template>
                  </UButton>
                  <template #content>
                    <UColorPicker :model-value="editing.color" class="p-2" @update:model-value="(c: any) => alter(editing, 'color', c)" />
                  </template>
                </UPopover>
              </RhRow>
            </RhGroup>

            <RhGroup v-if="attributes.length" :title="t('More')">
              <RhField
                v-for="a in attributes"
                :key="a.name"
                :field="a"
                :model-value="editing[a.name]"
                :disabled="!admin"
                @commit="(v: any) => alterAttr(editing, a.name, v)"
              />
            </RhGroup>

            <RhGroup v-if="heatsByPilot[editing.pilot_id]?.length || admin" :title="t('Heats')">
              <RhRow v-for="h in heatsByPilot[editing.pilot_id]" :key="h" :label="h" icon="i-lucide-layers" />
              <RhRow v-if="admin" inline>
                <template #label>
                  <span class="font-normal text-muted">{{ heatsByPilot[editing.pilot_id]?.length ? t('Add to another heat') : t('Not in any heat yet') }}</span>
                </template>
                <USelectMenu
                  :key="pickerKey"
                  :model-value="undefined"
                  :items="heatPickerItems"
                  value-key="value"
                  :placeholder="t('Add to heat…')"
                  icon="i-lucide-plus"
                  size="sm"
                  class="w-44"
                  :search-input="{ placeholder: t('Find heat…') }"
                  :content="{ align: 'end' }"
                  @update:model-value="(v: any) => v && addToHeat(v)"
                />
              </RhRow>
            </RhGroup>

            <div v-if="admin">
              <UButton
                v-if="!editing.locked"
                block
                color="error"
                variant="soft"
                icon="i-lucide-trash-2"
                :label="t('Delete Pilot')"
                @click="deleteTarget = editing"
              />
              <p v-else class="text-center text-sm text-muted">
                {{ t('This pilot has saved races and cannot be deleted.') }}
              </p>
            </div>
          </div>
        </template>
      </USlideover>

      <UModal v-model:open="colorsOpen" :title="t('Colors')" :ui="{ content: 'max-w-sm' }">
        <template #body>
          <div class="space-y-5">
            <UFormField :label="t('LED Color Mode')" :description="t('Which color represents each pilot on LEDs and in the interface.')">
              <UTabs :model-value="colorMode" :items="colorModeItems" :content="false" size="sm" class="mt-2" @update:model-value="(v: any) => setColorMode(String(v))" />
            </UFormField>
            <div v-if="colorMode === '0'" class="space-y-2">
              <div class="text-sm font-medium text-highlighted">
                {{ t('Seat Colors') }}
              </div>
              <div class="flex flex-wrap gap-2">
                <UPopover v-for="s in S.seat_data?.seats || []" :key="s.seat_id">
                  <button type="button" class="flex size-9 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-default" :style="{ background: s.color, color: contrastText(s.color) }">
                    {{ s.seat_id + 1 }}
                  </button>
                  <template #content>
                    <UColorPicker :model-value="s.color" class="p-2" @update:model-value="(c: any) => rh.emit('set_seat_color', { seat_id: s.seat_id, color: c })" />
                  </template>
                </UPopover>
              </div>
              <UButton size="xs" color="neutral" variant="link" :label="t('Reset')" class="px-0" @click="rh.emit('reset_seat_color')" />
            </div>
          </div>
        </template>
      </UModal>

      <UModal :open="!!deleteTarget" :title="t('Delete pilot?')" :description="deleteTarget ? `${deleteTarget.callsign} ${t('will be removed from the event and its heats.')}` : ''" @update:open="(o: boolean) => { if (!o) deleteTarget = null }">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton color="error" :label="t('Delete')" @click="remove" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
