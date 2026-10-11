<script setup lang="ts">
import { runScripts } from '~/utils/scripts'
// Markdown from plugins (HTML allowed, and inline scripts run as in the classic
// interface). Links to plugin pages open inside the app.
const props = defineProps<{ source: string }>()
const html = computed(() => renderMarkdown(props.source))
const router = useRouter()
const { info } = useServerInfo()
const el = ref<HTMLElement>()

watch(html, () => nextTick(() => runScripts(el.value)), { flush: 'post' })
onMounted(() => runScripts(el.value))

function onClick(e: MouseEvent) {
  const a = (e.target as HTMLElement).closest('a')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return
  const href = a.getAttribute('href') || ''
  if (href.startsWith('/app/')) {
    e.preventDefault()
    router.push(href.slice(4))
  } else if (href.startsWith('/') && !href.startsWith('//') && info.value?.plugin_pages?.some(p => p.url === href.split(/[?#]/)[0])) {
    e.preventDefault()
    router.push({ path: '/page', query: { url: href } })
  }
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div ref="el" class="rh-prose" @click="onClick" v-html="html" />
</template>
