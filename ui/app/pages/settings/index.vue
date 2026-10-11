<script setup lang="ts">
// On desktop the section list is always visible, so open the first section.
// On mobile the list itself is this screen (rendered by pages/settings.vue).
const router = useRouter()
const { admin } = useAuth()

let mq: MediaQueryList | undefined
function openFirst() {
  // wait for sign-in status: opening General first would bounce a guest to Live
  if (mq?.matches && admin.value !== null) router.replace(admin.value === false ? '/settings/audio' : '/settings/general')
}
onMounted(() => {
  mq = window.matchMedia('(min-width: 1024px)')
  mq.addEventListener('change', openFirst)
  openFirst()
})
onBeforeUnmount(() => mq?.removeEventListener('change', openFirst))
// sign-in status may arrive after mount: guests belong on Audio, the one section they can use
watch(admin, openFirst)
</script>

<template>
  <div />
</template>
