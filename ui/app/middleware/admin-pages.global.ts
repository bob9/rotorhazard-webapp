/**
 * Admin pages open only once the sign-in check has answered, so a guest never sees
 * one flash up (or its requests fail) before being sent to Live.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || !isAdminPage(to.path)) return
  const { admin, refresh, refusedPath } = useAuth()
  const ok = admin.value ?? await refresh()
  if (ok) return
  refusedPath.value = to.path
  return navigateTo('/live', { replace: true })
})
