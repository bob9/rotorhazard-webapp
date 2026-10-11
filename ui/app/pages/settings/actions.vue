<script setup lang="ts">
/**
 * Event Actions (EventActions.py): run an effect (speak, message, plugin
 * effects...) when a race event fires. The whole list is stored as a JSON
 * string in config USER.actions and rewritten on every change.
 */
const rh = useRH()
const cfg = useConfig()
const { t } = useI18n()

rh.load(['action_setup', 'event_actions'])

interface Action { uid: number, data: Record<string, any> }
let nextUid = 1
const actions = ref<Action[]>([])

watch(() => rh.state.event_actions?.actions, (raw) => {
  if (raw === undefined) return
  let list: any = []
  try {
    list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw
  } catch { /* invalid stored value */ }
  actions.value = (Array.isArray(list) ? list : []).map(data => ({ uid: nextUid++, data: { ...data } }))
}, { immediate: true })

const setup = computed(() => rh.state.action_setup)
const loaded = computed(() => setup.value !== undefined && rh.state.event_actions !== undefined)
const enabled = computed(() => setup.value?.enabled !== false)
const events = computed<Record<string, string>>(() => setup.value?.events || {})
const effects = computed<Record<string, { name: string, fields: any[] | null }>>(() => setup.value?.effects || {})

function eventItems(current?: string) {
  const items = Object.entries(events.value).map(([value, label]) => ({ label: t(label), value }))
  if (current && !(current in events.value)) items.push({ label: current, value: current })
  return items
}
function effectItems(current?: string) {
  const items = Object.entries(effects.value).map(([value, e]) => ({ label: t(e.name), value }))
  if (current && !(current in effects.value)) items.push({ label: `${current} (${t('not available')})`, value: current })
  return items
}
function fieldsFor(a: Action) {
  return (effects.value[a.data.effect]?.fields || []).map(f => ({
    ...f,
    value: a.data[f.name] !== undefined && a.data[f.name] !== '' ? a.data[f.name] : f.value
  }))
}

function save() {
  cfg.set('USER', 'actions', JSON.stringify(actions.value.map(a => a.data)))
}

function add() {
  actions.value.push({
    uid: nextUid++,
    data: { event: Object.keys(events.value)[0], effect: Object.keys(effects.value)[0] }
  })
  save()
}

function update(a: Action, key: string, value: any) {
  a.data[key] = value
  save()
}

const deleting = ref<Action | null>(null)
function remove() {
  actions.value = actions.value.filter(a => a !== deleting.value)
  deleting.value = null
  save()
}
</script>

<template>
  <div class="space-y-8">
    <div v-if="!loaded" class="space-y-4">
      <USkeleton v-for="i in 2" :key="i" class="h-36 w-full rounded-2xl" />
    </div>

    <UEmpty
      v-else-if="!enabled"
      icon="i-lucide-zap-off"
      :title="t('Event actions are not available')"
      :description="t('No event action effects are loaded on this timer.')"
    />

    <template v-else>
      <UEmpty
        v-if="!actions.length"
        icon="i-lucide-zap"
        :title="t('No event actions')"
        :description="t('Add an action to speak, show a message or run a plugin effect whenever something happens during a race.')"
        :actions="[{ label: t('Add Action'), icon: 'i-lucide-plus', onClick: add }]"
        class="rounded-2xl ring-1 ring-default bg-default"
      />

      <template v-else>
        <div class="flex items-center justify-between gap-3 px-1">
          <p class="text-sm text-muted">
            {{ actions.length === 1 ? t('1 action') : t('{0} actions', actions.length) }}
          </p>
          <UButton icon="i-lucide-plus" :label="t('Add Action')" size="sm" @click="add" />
        </div>

        <TransitionGroup name="rh" tag="div" class="space-y-5">
          <section
            v-for="(a, i) in actions"
            :key="a.uid"
            class="overflow-hidden rounded-2xl bg-default ring-1 ring-default shadow-xs"
          >
            <div class="flex items-start gap-3 bg-elevated/40 px-4 py-3">
              <span class="flex size-7 shrink-0 items-center justify-center mt-6 rounded-full bg-amber-500/15 text-xs font-semibold text-amber-800 tabular max-sm:hidden dark:text-amber-400">
                {{ i + 1 }}
              </span>
              <div class="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <UFormField :label="t('When')" :ui="{ label: 'text-xs text-muted font-normal', container: 'mt-1' }">
                  <USelect
                    :model-value="a.data.event"
                    :items="eventItems(a.data.event)"
                    icon="i-lucide-radio"
                    class="w-full"
                    :aria-label="t('Event')"
                    @update:model-value="(v: any) => update(a, 'event', v)"
                  />
                </UFormField>
                <UFormField :label="t('Do')" :ui="{ label: 'text-xs text-muted font-normal', container: 'mt-1' }">
                  <USelect
                    :model-value="a.data.effect"
                    :items="effectItems(a.data.effect)"
                    icon="i-lucide-zap"
                    class="w-full"
                    :aria-label="t('Effect')"
                    @update:model-value="(v: any) => update(a, 'effect', v)"
                  />
                </UFormField>
              </div>
              <UButton
                icon="i-lucide-trash-2"
                color="neutral"
                variant="ghost"
                class="mt-5 -me-1.5 shrink-0"
                :aria-label="t('Delete Action')"
                @click="deleting = a"
              />
            </div>
            <div v-if="fieldsFor(a).length" class="divide-y divide-default border-t border-default">
              <RhField
                v-for="f in fieldsFor(a)"
                :key="a.data.effect + ':' + f.name"
                :field="f"
                @commit="(v: any) => update(a, f.name, v)"
              />
            </div>
          </section>
        </TransitionGroup>
      </template>
    </template>

    <UModal
      :open="!!deleting"
      :title="t('Delete this action?')"
      :description="deleting ? `${t(events[deleting.data.event] || deleting.data.event)} → ${t(effects[deleting.data.effect]?.name || deleting.data.effect)}` : ''"
      @update:open="(o: boolean) => { if (!o) deleting = null }"
    >
      <template #footer="{ close }">
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('Cancel')" @click="close" />
          <UButton color="error" :label="t('Delete Action')" @click="remove" />
        </div>
      </template>
    </UModal>
  </div>
</template>
