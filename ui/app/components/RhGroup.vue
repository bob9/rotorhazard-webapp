<script setup lang="ts">
// Inset grouped list, in the style of iOS / macOS settings.
defineProps<{ title?: string, description?: string, footer?: string }>()
</script>

<template>
  <section class="space-y-2">
    <div v-if="title || $slots.actions" class="flex items-end justify-between gap-3 px-1">
      <div>
        <h3 v-if="title" class="text-[13px] font-semibold uppercase tracking-wide text-muted">
          {{ title }}
        </h3>
        <p v-if="description" class="mt-0.5 text-sm text-muted">
          {{ description }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
    <div class="overflow-hidden rounded-2xl bg-default ring-1 ring-default divide-y divide-default shadow-xs">
      <slot />
    </div>
    <p v-if="footer || $slots.footer" class="px-1 text-xs text-muted">
      <slot name="footer">
        {{ footer }}
      </slot>
    </p>
  </section>
</template>
