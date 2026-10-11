<script setup lang="ts">
/**
 * A value in a table or card, or, when there is none, the app's one empty-value mark:
 * an em dash in the dimmed text colour (times of '0:00.000' count as none).
 */
defineProps<{ value?: string | number | null }>()
</script>

<template>
  <template v-if="value !== null && value !== undefined && value !== '' && value !== '0:00.000'">{{ value }}</template>
  <span v-else class="text-dimmed">—</span>
</template>
