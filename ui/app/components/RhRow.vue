<script setup lang="ts">
// One row in an RhGroup: label (+ description) on the left, control on the right.
// `inline` keeps a small control (switch, button) beside the label on phones too.
import { NuxtLink } from '#components'
import { runScripts } from '~/utils/scripts'

const props = defineProps<{ label?: string, description?: string, html?: boolean, stacked?: boolean, inline?: boolean, icon?: string, to?: string }>()
// HTML descriptions come from plugins; run their scripts as the classic interface did
const descEl = ref<HTMLElement>()
watch(() => props.description, () => nextTick(() => runScripts(descEl.value)), { flush: 'post' })
onMounted(() => runScripts(descEl.value))
</script>

<template>
  <component
    :is="to ? NuxtLink : 'div'"
    :to="to"
    class="flex gap-x-4 gap-y-2 px-4 py-3 min-h-12"
    :class="[stacked ? 'flex-col' : inline || to ? 'flex-row items-center' : 'flex-col sm:flex-row sm:items-center', to ? 'hover:bg-elevated/60 transition-colors' : '']"
  >
    <div v-if="label || description || $slots.label" class="flex min-w-0 flex-1 items-center gap-3">
      <UIcon v-if="icon" :name="icon" class="size-5 shrink-0 text-muted" />
      <div class="min-w-0">
        <div class="text-[15px] font-medium text-highlighted">
          <slot name="label">
            {{ label }}
          </slot>
        </div>
        <!-- eslint-disable-next-line vue/no-v-html -->
        <div v-if="description && html" ref="descEl" class="rh-desc mt-0.5 text-[13px] text-muted" v-html="description" />
        <div v-else-if="description" class="mt-0.5 text-[13px] text-muted">
          {{ description }}
        </div>
      </div>
    </div>
    <div class="flex shrink-0 items-center gap-2" :class="stacked ? 'w-full' : inline ? 'justify-end' : 'sm:justify-end sm:max-w-[60%]'">
      <slot />
      <UIcon v-if="to" name="i-lucide-chevron-right" class="size-4 text-dimmed" />
    </div>
  </component>
</template>
