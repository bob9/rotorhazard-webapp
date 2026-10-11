<script setup lang="ts">
/**
 * Renders a server `UIField` (plugin settings, attributes, action effects,
 * importer / generator parameters...). Emits `commit` with the new value when
 * the user finishes editing, matching the classic UI's change-event saves.
 */
import RhRow from './RhRow.vue'

const props = defineProps<{
  field: {
    name: string
    label?: string
    field_type?: string
    value?: any
    desc?: string | null
    placeholder?: string | null
    options?: { value: string, label: string }[] | null
    html_attributes?: Record<string, any> | null
  }
  modelValue?: any
  bare?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [any], 'commit': [any] }>()
const { t } = useI18n()

const type = computed(() => props.field.field_type || 'text')
const attrs = computed(() => props.field.html_attributes || {})

function initial() {
  let v = props.modelValue !== undefined ? props.modelValue : props.field.value
  if (type.value === 'checkbox') return v === true || v === 'true' || v === 1 || v === '1'
  // unset values arrive as the stored string 'None', or false for a missing config item
  if (v === 'None' || v === false) v = ''
  // an unset select shows 'Not set' rather than silently presenting the first option
  if (type.value === 'select' && (v === null || v === undefined)) return ''
  if (type.value === 'range') return Number(v ?? attrs.value.min ?? 0)
  return v ?? ''
}
const local = ref<any>(initial())
watch(() => [props.modelValue, props.field.value], () => { local.value = initial() })

function commit(v = local.value) {
  local.value = v
  const out = type.value === 'checkbox' ? !!v : type.value === 'range' ? String(v) : v
  emit('update:modelValue', out)
  emit('commit', out)
}

let rangeTimer: ReturnType<typeof setTimeout> | undefined
function scheduleCommit() {
  clearTimeout(rangeTimer)
  rangeTimer = setTimeout(() => commit(), 350)
}

const showPassword = ref(false)
// the select component reserves '' for "no selection", but plugin options may use it as a value
const EMPTY = '__rh_empty__'
const selectItems = computed(() => (props.field.options || []).map(o => ({ label: t(o.label), value: String(o.value) === '' ? EMPTY : String(o.value) })))
const hasEmptyOption = computed(() => selectItems.value.some(i => i.value === EMPTY))
const selectValue = computed(() => {
  const v = String(local.value)
  if (v === '') return hasEmptyOption.value ? EMPTY : undefined
  return v
})
const inputType = computed(() => ({
  basic_int: 'number', number: 'number', date: 'date', time: 'time', datetime: 'datetime-local',
  email: 'email', tel: 'tel', url: 'url', password: showPassword.value ? 'text' : 'password'
} as Record<string, string>)[type.value] || 'text')

const numericAttrs = computed(() => {
  if (type.value === 'basic_int') return { min: 0, max: 999, step: 1 }
  const a: Record<string, any> = {}
  for (const k of ['min', 'max', 'step', 'minlength', 'maxlength', 'pattern', 'multiple']) {
    if (attrs.value[k] !== undefined) a[k] = attrs.value[k]
  }
  return a
})
const rangeDisplay = computed(() => {
  const d = attrs.value.value_decimals
  const n = Number(local.value)
  const s = d !== undefined ? n.toFixed(Number(d)) : String(n)
  return `${attrs.value.value_prefix || ''}${s}${attrs.value.value_suffix || ''}`
})
</script>

<template>
  <component
    :is="bare ? 'div' : RhRow"
    v-bind="bare ? {} : { label: t(field.label || field.name), description: field.desc || undefined, html: true, stacked: type === 'range', inline: type === 'checkbox' }"
  >
    <USwitch
      v-if="type === 'checkbox'"
      :model-value="local"
      :disabled="disabled"
      :aria-label="t(field.label || field.name)"
      @update:model-value="commit"
    />
    <USelect
      v-else-if="type === 'select'"
      :model-value="selectValue"
      :items="selectItems"
      :placeholder="t('Not set')"
      :disabled="disabled"
      class="w-full sm:w-64"
      @update:model-value="(v: any) => commit(v === EMPTY ? '' : v)"
    />
    <div v-else-if="type === 'range'" class="flex w-full items-center gap-4">
      <USlider
        v-model="local"
        :min="Number(attrs.min ?? 0)"
        :max="Number(attrs.max ?? 100)"
        :step="Number(attrs.step ?? 1)"
        :disabled="disabled"
        class="flex-1"
        @update:model-value="scheduleCommit"
      />
      <span class="tabular w-16 text-right text-sm text-muted">{{ rangeDisplay }}</span>
    </div>
    <UInput
      v-else
      v-model="local"
      :type="inputType"
      :placeholder="field.placeholder || undefined"
      :disabled="disabled"
      v-bind="numericAttrs"
      class="w-full sm:w-64"
      :ui="type === 'password' ? { trailing: 'pe-1' } : undefined"
      :autocomplete="type === 'password' ? 'new-password' : undefined"
      @change="commit()"
      @keydown.enter="commit()"
    >
      <template v-if="type === 'password'" #trailing>
        <UButton
          color="neutral"
          variant="link"
          size="sm"
          :icon="showPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'"
          :aria-label="showPassword ? 'Hide' : 'Show'"
          @click="showPassword = !showPassword"
        />
      </template>
    </UInput>
  </component>
</template>
