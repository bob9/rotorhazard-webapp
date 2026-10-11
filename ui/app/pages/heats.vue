<script setup lang="ts">
const rh = useRH()
const { t } = useI18n()
useHead({ title: computed(() => t('Heats')) })
const { admin } = useAuth()
const toast = useToast()
rh.load(['heat_data', 'class_data', 'pilot_data', 'format_data', 'frequency_data', 'seat_data', 'current_heat', 'race_status', 'raceclass_rank_method_list', 'heatgenerator_list'])

const S = rh.state
const heats = computed<any[]>(() => S.heat_data?.heats || [])
const classes = computed<any[]>(() => [...(S.class_data?.classes || [])].sort((a, b) => (a.order ?? a.id) - (b.order ?? b.id)))
const heatAttrs = computed<any[]>(() => S.heat_data?.attributes || [])
const classAttrs = computed<any[]>(() => S.class_data?.attributes || [])
const currentHeatId = computed(() => S.current_heat?.current_heat)

// selection: a class id, or 'none' for unclassified heats
const sel = ref<string>('')
const route = useRoute()
const unclassifiedCount = computed(() => heats.value.filter(h => !h.class_id).length)
function validSel(v: string) {
  if (!v) return false
  if (v === 'none') return unclassifiedCount.value > 0 || !classes.value.length
  return classes.value.some(c => String(c.id) === v)
}
// once both heats and classes have arrived (in either order), pick: the ?class= query,
// the class of the current heat, the first class, then unclassified
watch([() => !!S.class_data && !!S.heat_data, classes, heats, currentHeatId, sel], ([ready]) => {
  if (!ready || validSel(sel.value)) return
  const fromQuery = route.query.class ? String(route.query.class) : ''
  const currentClass = heats.value.find(h => h.id === currentHeatId.value)?.class_id
  const candidates = [fromQuery, currentClass ? String(currentClass) : '', ...classes.value.map(c => String(c.id)), 'none']
  sel.value = candidates.find(validSel) || 'none'
}, { immediate: true })
const cls = computed(() => classes.value.find(c => String(c.id) === sel.value) || null)
const classHeats = computed(() => heats.value.filter(h => sel.value === 'none' ? !h.class_id : String(h.class_id) === sel.value))
const grouped = computed(() => cls.value?.round_type === 1)
const groups = computed(() => {
  if (!grouped.value) return [{ id: null as number | null, heats: classHeats.value }]
  const m = new Map<number, any[]>()
  for (const h of classHeats.value) {
    if (!m.has(h.group_id ?? 0)) m.set(h.group_id ?? 0, [])
    m.get(h.group_id ?? 0)!.push(h)
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([id, hs]) => ({ id, heats: hs }))
})

function alterClass(data: Record<string, any>) {
  rh.emit('alter_race_class', { class_id: cls.value.id, ...data })
  Object.assign(cls.value, Object.fromEntries(Object.entries(data).map(([k, v]) => [({ class_name: 'name', class_description: 'description', class_format: 'format' } as any)[k] || k, v])))
}
function addClass() {
  rh.emit('add_race_class')
  const before = classes.value.length
  const stop = watch(classes, (cs) => {
    if (cs.length > before) {
      sel.value = String(cs.reduce((a, b) => (a.id > b.id ? a : b)).id)
      stop()
    }
  })
}
function addHeat(group?: number | null) {
  const data: Record<string, any> = { class: sel.value === 'none' ? null : Number(sel.value) }
  if (grouped.value && group !== undefined && group !== null) data.group = group
  rh.emit('add_heat', data)
}

const formatItems = computed(() => [{ label: t('Unrestricted'), value: 0 }, ...(S.format_data?.formats || []).map((f: any) => ({ label: f.name, value: f.id }))])
const rankItems = computed(() => [{ label: t('From Race Format'), value: '__format__' }, ...(S.raceclass_rank_method_list?.methods || []).map((m: any) => ({ label: m.label, value: m.name }))])
const rankMethod = computed(() => (S.raceclass_rank_method_list?.methods || []).find((m: any) => m.name === cls.value?.win_condition))
const roundTypeItems = computed(() => [{ label: t('Count races per heat'), value: 0 }, { label: t('Generate heat groups'), value: 1 }])
const advanceItems = computed(() => [
  { label: t('Always'), value: 1 },
  { label: t('After All Rounds'), value: 2 },
  ...(!grouped.value ? [{ label: t('Never'), value: 0 }] : [])
])
const classLocked = ref(false)
watch(cls, (c) => { classLocked.value = !!c?.locked }, { immediate: true })
// a locked setting reads as plain text, not as a greyed-out control that looks editable
function itemLabel(items: any[], value: any) {
  return items.flat().find((i: any) => i?.value === value)?.label ?? '—'
}

const deleteClassOpen = ref(false)
const rankSettingsOpen = ref(false)
function saveRankSetting(name: string, value: any) {
  const rs = { ...(cls.value.ranksettings || {}), [name]: value }
  cls.value.ranksettings = rs
  rh.emit('alter_race_class', { class_id: cls.value.id, rank_settings: { [name]: value } })
}

// generator
const genOpen = ref(false)
const generators = computed<any[]>(() => [...(S.heatgenerator_list?.generators || [])].sort((a, b) => a.label.localeCompare(b.label)))
const gen = reactive({ name: '', input: 0 as number, output: 'new' as string | number, params: {} as Record<string, any> })
const genDef = computed(() => generators.value.find(g => g.name === gen.name))
watch(genDef, (g) => {
  gen.params = Object.fromEntries((g?.settings || []).map((f: any) => [f.name, f.value]))
})
function openGenerator() {
  gen.name = gen.name || generators.value[0]?.name || ''
  gen.output = sel.value !== 'none' && classHeats.value.length === 0 ? Number(sel.value) : 'new'
  genOpen.value = true
}
// ?generate=1 (from search or the class-complete prompt) opens the generator once the
// class and the generator list are known
const router = useRouter()
watch([() => route.query.generate, () => sel.value, () => generators.value.length], ([g, s, n]) => {
  if (!g || !s || !n || !admin.value) return
  openGenerator()
  router.replace({ query: { ...route.query, generate: undefined } })
}, { immediate: true })
const generating = ref(false)
function generate() {
  generating.value = true
  rh.emit('generate_heats_v2', {
    generator: gen.name,
    input_class: gen.input || null,
    output_class: gen.output === 'new' ? null : gen.output,
    params: gen.params
  })
  const stop = rh.on('heat_data', () => {
    generating.value = false
    genOpen.value = false
    stop()
  })
  setTimeout(() => { generating.value = false }, 8000)
}
const classOptions = computed(() => [{ label: t('All Pilots'), value: 0 }, ...classes.value.map(c => ({ label: c.displayname, value: c.id }))])
const outputOptions = computed(() => [{ label: t('New Class'), value: 'new' }, ...classes.value.map(c => ({ label: c.displayname, value: c.id })), { label: t('Unclassified'), value: 0 }])

const plan = ref<any>(null)
rh.on('heat_plan_result', (d: any) => { plan.value = d })

const raceActive = computed(() => [1, 2, 3].includes(S.race_status?.race_status))
const navItems = computed(() => [
  ...classes.value.map(c => ({
    label: c.displayname,
    value: String(c.id),
    count: heats.value.filter(h => h.class_id === c.id).length
  })),
  ...(unclassifiedCount.value || !classes.value.length ? [{ label: t('Unclassified'), value: 'none', count: unclassifiedCount.value }] : [])
])
</script>

<template>
  <UDashboardPanel id="heats" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <UDashboardNavbar :title="t('Heats')">
        <template #right>
          <RhBell />
          <UButton v-if="admin && classHeats.length" color="neutral" variant="soft" icon="i-lucide-wand-sparkles" :label="t('Generate Heats')" @click="openGenerator" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- sized by its content (not flex-1, whose zero basis caps it at the panel height), so the class list's divider runs the full height -->
      <div class="flex min-h-full shrink-0 grow flex-col lg:flex-row">
        <!-- class list -->
        <aside class="border-b border-default lg:w-64 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div class="p-3 lg:sticky lg:top-0 lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto">
            <div class="mb-2 flex items-center justify-between px-2">
              <span class="text-[11px] font-semibold uppercase tracking-wider text-dimmed">{{ t('Classes') }}</span>
              <UButton v-if="admin" icon="i-lucide-plus" size="xs" color="neutral" variant="ghost" :aria-label="t('Add Class')" @click="addClass" />
            </div>
            <nav class="flex gap-1 overflow-x-auto lg:flex-col">
              <button
                v-for="item in navItems"
                :key="item.value"
                type="button"
                class="flex shrink-0 items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors"
                :class="sel === item.value ? 'bg-elevated font-medium text-highlighted' : 'text-muted hover:bg-elevated/60 hover:text-highlighted'"
                @click="sel = item.value"
              >
                <span class="truncate">{{ item.label }}</span>
                <span class="tabular text-xs text-dimmed">{{ item.count }}</span>
              </button>
            </nav>
          </div>
        </aside>

        <!-- class detail -->
        <div class="min-w-0 flex-1 space-y-8 p-4 sm:p-6 lg:p-8">
          <UAlert
            v-if="raceActive && admin"
            color="warning"
            variant="subtle"
            icon="i-lucide-info"
            :title="t('Some options cannot be changed for currently active race.')"
            :actions="[{ label: t('Go to Race'), to: '/', color: 'neutral', variant: 'outline' }]"
          />

          <template v-if="cls">
            <header class="space-y-0.5">
              <div class="flex items-start gap-3">
                <UInput
                  :model-value="cls.name || ''"
                  :placeholder="cls.displayname"
                  variant="ghost"
                  size="xl"
                  class="min-w-0 flex-1"
                  :ui="{ base: 'font-display text-3xl font-semibold px-1 py-0 -ml-1 text-highlighted placeholder:text-highlighted disabled:opacity-100 disabled:cursor-default' }"
                  :disabled="!admin"
                  :aria-label="t('Class name')"
                  @change="(e: any) => alterClass({ class_name: e.target.value })"
                />
                <UDropdownMenu
                  v-if="admin"
                  :items="[[
                    { label: t('Duplicate'), icon: 'i-lucide-copy', onSelect: () => rh.emit('duplicate_race_class', { class: cls.id }) },
                    ...(classLocked ? [{ label: t('Unlock'), icon: 'i-lucide-lock-open', onSelect: () => { classLocked = false } }] : [])
                  ], [{ label: t('Delete Class'), icon: 'i-lucide-trash-2', color: 'error', onSelect: () => { deleteClassOpen = true } }]]"
                  :content="{ align: 'end' }"
                >
                  <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" :aria-label="t('Class actions')" />
                </UDropdownMenu>
              </div>
              <UTextarea
                :model-value="cls.description || ''"
                :placeholder="t('Description (shown on the event page)')"
                variant="ghost"
                autoresize
                :rows="1"
                class="w-full"
                :ui="{ base: 'px-1 -ml-1 text-muted' }"
                :disabled="!admin"
                @change="(e: any) => alterClass({ class_description: e.target.value })"
              />
            </header>

            <UAlert
              v-if="classLocked"
              icon="i-lucide-lock"
              color="neutral"
              variant="subtle"
              :title="t('Format, ranking and round type are locked')"
              :description="t('This class has saved races. Unlock it to change the format, ranking or round type.')"
              :actions="admin ? [{ label: t('Unlock'), icon: 'i-lucide-lock-open', color: 'neutral', variant: 'outline', onClick: () => { classLocked = false } }] : undefined"
            />
            <RhGroup :title="t('Class Settings')">
              <RhRow :label="t('Race Format')" :description="t('Races in this class always use this format.')">
                <span v-if="classLocked" class="flex items-center gap-1.5 text-sm text-highlighted"><UIcon name="i-lucide-lock" class="size-3.5 text-dimmed" />{{ itemLabel(formatItems, cls.format || 0) }}</span>
                <USelect v-else :model-value="cls.format || 0" :items="formatItems" class="w-full sm:w-64" :disabled="!admin || classLocked" @update:model-value="(v: any) => alterClass({ class_format: v })" />
              </RhRow>
              <RhRow :label="t('Ranking')" :description="rankMethod ? t('How pilots are ranked for the class result.') : t('Ranked by the race format\'s win condition.')">
                <div class="flex w-full gap-2 sm:w-auto">
                  <span v-if="classLocked" class="flex items-center gap-1.5 text-sm text-highlighted"><UIcon name="i-lucide-lock" class="size-3.5 text-dimmed" />{{ itemLabel(rankItems, cls.win_condition || '__format__') }}</span>
                  <USelect v-else :model-value="cls.win_condition || '__format__'" :items="rankItems" class="w-full sm:w-64" :disabled="!admin || classLocked" @update:model-value="(v: any) => alterClass({ win_condition: v === '__format__' ? '' : v })" />
                  <UButton v-if="rankMethod?.settings?.length" icon="i-lucide-settings-2" color="neutral" variant="outline" :aria-label="t('Settings')" :disabled="!admin" @click="rankSettingsOpen = true" />
                </div>
              </RhRow>
              <RhRow :label="t('Rounds')" :description="t('Number of rounds each heat races. 0 means unlimited.')">
                <UInputNumber :model-value="cls.rounds || 0" :min="0" class="w-36" :disabled="!admin" @update:model-value="(v: any) => alterClass({ rounds: v })" />
              </RhRow>
              <RhRow :label="t('Round Type')">
                <span v-if="classLocked" class="flex items-center gap-1.5 text-sm text-highlighted"><UIcon name="i-lucide-lock" class="size-3.5 text-dimmed" />{{ itemLabel(roundTypeItems, cls.round_type || 0) }}</span>
                <USelect v-else :model-value="cls.round_type || 0" :items="roundTypeItems" class="w-full sm:w-64" :disabled="!admin || classLocked" @update:model-value="(v: any) => alterClass({ round_type: v })" />
              </RhRow>
              <RhRow :label="t('Advance Heat')" :description="t('When the Race page moves on to the next heat after saving.')">
                <USelect :model-value="cls.heat_advance_type ?? 1" :items="advanceItems" class="w-full sm:w-64" :disabled="!admin" @update:model-value="(v: any) => alterClass({ heat_advance_type: v })" />
              </RhRow>
              <RhField
                v-for="a in classAttrs"
                :key="a.name"
                :field="a"
                :model-value="cls[a.name]"
                :disabled="!admin"
                @commit="(v: any) => { cls[a.name] = v; rh.emit('alter_race_class', { class_id: cls.id, class_attr: a.name, value: v }) }"
              />
            </RhGroup>
          </template>
          <header v-else class="space-y-1">
            <h1 class="font-display text-3xl font-semibold">
              {{ t('Unclassified') }}
            </h1>
            <p class="text-muted">
              {{ t('Heats that do not belong to a class.') }}
            </p>
          </header>

          <div v-if="!classHeats.length && S.heat_data" class="flex flex-col items-center gap-6 rounded-3xl bg-default px-6 py-10 text-center ring-1 ring-default sm:py-12">
            <RhArt name="empty-heats" class="w-full max-w-xs rounded-2xl shadow-lg" />
            <p class="max-w-sm text-muted">
              {{ admin ? t('Generate heats from your pilots or another class\'s results, or add them one by one.') : t('No heats yet') }}
            </p>
            <div v-if="admin" class="flex flex-wrap justify-center gap-2">
              <UButton icon="i-lucide-wand-sparkles" :label="t('Generate Heats')" @click="openGenerator" />
              <UButton color="neutral" variant="soft" icon="i-lucide-plus" :label="t('Add Heat')" @click="addHeat(grouped ? 0 : undefined)" />
            </div>
          </div>
          <template v-else>
            <section v-for="g in groups" :key="String(g.id)" class="space-y-3">
              <div class="flex items-center justify-between">
                <h2 class="font-display text-xl font-semibold">
                  {{ grouped ? `${t('Round')} ${(g.id ?? 0) + 1}` : t('Heats') }}
                  <span class="ml-1 text-base font-normal text-dimmed tabular">{{ g.heats.length }}</span>
                </h2>
                <UButton v-if="admin" size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :label="t('Add Heat')" @click="addHeat(g.id)" />
              </div>
              <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                <RhHeatCard
                  v-for="h in g.heats"
                  :key="h.id"
                  :heat="h"
                  :admin="!!admin"
                  :current="h.id === currentHeatId"
                  :attributes="heatAttrs"
                />
              </div>
            </section>
          </template>
          <div v-if="grouped && admin && classHeats.length">
            <UButton color="neutral" variant="ghost" icon="i-lucide-plus" :label="t('Add Round')" @click="addHeat((groups[groups.length - 1]?.id ?? -1) + 1)" />
          </div>
        </div>
      </div>

      <!-- class ranking settings -->
      <UModal v-model:open="rankSettingsOpen" :title="rankMethod?.label" :description="t('Ranking settings')">
        <template #body>
          <RhGroup v-if="cls && rankMethod">
            <RhField
              v-for="f in rankMethod.settings"
              :key="f.name"
              :field="f"
              :model-value="cls.ranksettings?.[f.name]"
              @commit="(v: any) => saveRankSetting(f.name, v)"
            />
          </RhGroup>
        </template>
      </UModal>

      <!-- generator -->
      <UModal v-model:open="genOpen" :title="t('Generate Heats')" :description="t('Build heats automatically from pilots or from results.')" :ui="{ content: 'max-w-xl' }">
        <template #body>
          <div class="space-y-5">
            <UFormField :label="t('Generator')">
              <USelect v-model="gen.name" :items="generators.map(g => ({ label: g.label, value: g.name }))" class="w-full" />
            </UFormField>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField :label="t('Input')" :description="t('Seed from')">
                <USelect v-model="gen.input" :items="classOptions" class="w-full" />
              </UFormField>
              <UFormField :label="t('Output')" :description="t('Put heats into')">
                <USelect v-model="gen.output" :items="outputOptions" class="w-full" />
              </UFormField>
            </div>
            <RhGroup v-if="genDef?.settings?.length" :title="t('Settings')">
              <RhField
                v-for="f in genDef.settings"
                :key="f.name"
                :field="f"
                :model-value="gen.params[f.name]"
                @commit="(v: any) => { gen.params[f.name] = v }"
              />
            </RhGroup>
          </div>
        </template>
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton icon="i-lucide-wand-sparkles" :label="t('Generate Heats')" :loading="generating" :disabled="!gen.name" @click="generate" />
          </div>
        </template>
      </UModal>

      <UModal v-model:open="deleteClassOpen" :title="t('Delete class?')" :description="cls ? `${cls.displayname} ${t('and its heats will be deleted.')}` : ''">
        <template #footer="{ close }">
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
            <UButton
              color="error"
              :label="t('Delete')"
              @click="() => { rh.emit('delete_class', { class: cls.id }); toast.add({ title: t('Class deleted'), icon: 'i-lucide-trash-2' }); sel = ''; close() }"
            />
          </div>
        </template>
      </UModal>

      <RhHeatPlan v-model:plan="plan" source="format" />
    </template>
  </UDashboardPanel>
</template>
