<script setup lang="ts">
/** Confirms the seat/channel plan of a dynamic or auto-frequency heat. */
const plan = defineModel<any>('plan')
const props = defineProps<{ source: 'run' | 'format' }>()
const rh = useRH()
const { t } = useI18n()

const open = computed({ get: () => !!plan.value, set: (v) => { if (!v) plan.value = null } })
const fdata = computed<any[]>(() => rh.state.frequency_data?.fdata || [])
const assigning = ref<any>(null)

function methodLabel(s: any) {
  const heats = rh.state.heat_data?.heats || []
  const classes = rh.state.class_data?.classes || []
  if (s.method === 1) return `${heats.find((h: any) => h.id === s.seed_id)?.displayname || t('Heat')} ${t('Rank')} ${s.seed_rank}`
  if (s.method === 2) return `${classes.find((c: any) => c.id === s.seed_id)?.displayname || t('Class')} ${t('Rank')} ${s.seed_rank}`
  return t('Assigned')
}
function reseed() {
  rh.emit('calc_pilots', { heat: plan.value.heat })
}
function assign(seat: number) {
  const pre: Record<string, number> = {}
  for (const s of plan.value.slots) if (s.preassigned) pre[s.id] = s.node_index
  pre[assigning.value.id] = seat
  rh.emit('calc_pilots', { heat: plan.value.heat, preassignments: pre })
  assigning.value = null
}
function confirm() {
  rh.emit('confirm_heat_plan', { heat_id: plan.value.heat, source: props.source })
  plan.value = null
}
</script>

<template>
  <UModal v-model:open="open" :title="`${t('Heat Plan')} · ${plan?.displayname || ''}`" :description="t('Check the seats and channels before racing.')" :ui="{ content: 'max-w-lg' }">
    <template #body>
      <div v-if="plan" class="space-y-3">
        <UAlert v-if="plan.calc_result && !plan.calc_result.calc_success" color="error" variant="subtle" icon="i-lucide-octagon-alert" :title="t('Heat plan is invalid')" />
        <UAlert v-else-if="plan.calc_result?.unassigned_slots" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="t('Heat contains empty slots')" />
        <ul class="divide-y divide-default overflow-hidden rounded-xl ring-1 ring-default">
          <li v-for="s in plan.slots" :key="s.id" class="flex items-center gap-3 px-4 py-3">
            <div class="min-w-0 flex-1">
              <div class="font-medium text-highlighted">
                {{ s.callsign || t('None') }}
              </div>
              <div class="text-xs text-muted">
                {{ methodLabel(s) }}
              </div>
            </div>
            <UButton
              v-if="s.node_index !== null && s.node_index !== undefined"
              color="neutral"
              :variant="s.frequency_change ? 'solid' : 'soft'"
              size="sm"
              :icon="s.frequency_change ? 'i-lucide-arrow-right-left' : undefined"
              :label="`${channelLabel(fdata[s.node_index])} ${fdata[s.node_index]?.frequency || ''}`"
              @click="assigning = s"
            />
            <span v-else class="text-sm text-dimmed">{{ t('Unassigned') }}</span>
          </li>
        </ul>
        <div v-if="assigning" class="space-y-2 rounded-xl bg-elevated/60 p-3">
          <div class="text-sm font-medium">
            {{ t('Assign') }} {{ assigning.callsign }}
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-for="(f, i) in fdata"
              :key="i"
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="!f.frequency"
              :label="`${channelLabel(f)} ${f.frequency}`"
              @click="assign(i)"
            />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-between gap-2">
        <UButton color="neutral" variant="ghost" icon="i-lucide-shuffle" :label="t('Reseed')" @click="reseed" />
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="plan = null" />
          <UButton :label="t('Confirm')" icon="i-lucide-check" @click="confirm" />
        </div>
      </div>
    </template>
  </UModal>
</template>
