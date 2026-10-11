/**
 * Presentation (kiosk) mode of the Live page, for a projector or a TV: `/live?kiosk=1`
 * shows the race without the sidebar, plugin bars or navigation.
 */
export function useKiosk() {
  const route = useRoute()
  return computed(() => route.path === '/live' && route.query.kiosk !== undefined && route.query.kiosk !== '0')
}
