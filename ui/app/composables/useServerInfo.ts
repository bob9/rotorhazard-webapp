/** Server facts from /app-info (version, enabled hardware, plugin pages...). */
export interface ServerInfo {
  server: Record<string, any>
  admin: boolean
  auth_required: boolean
  first_run: boolean
  debug: boolean
  restart_required: boolean
  num_nodes: number
  imdtabler?: boolean
  led_enabled: boolean
  led_events_enabled: boolean
  vrx_enabled: boolean
  cluster_has_secondaries: boolean
  node_fw_updatable: boolean
  is_raspberry_pi: boolean
  /** plugin loader scripts run on every page (a bar at the top, for example); newer servers only */
  site_scripts?: string[]
  plugin_pages: { name: string, label: string | null, url: string, admin_only: boolean, order: number, source: string }[]
  event: { name: string, description: string }
  timer_name: string
  timer_logo: string
  // set when the app is served by the RotorHazard Web App plugin on a stock server
  // (absent from the core-integrated server, which has all of these built in)
  /** what serves the app: { kind: 'plugin', domain, version } */
  host?: { kind: string, domain?: string, version?: string }
  /** false: no '/app-classic-session'; the classic pages use their own sign-in prompt */
  classic_session?: boolean
  /** URL of the app's own translations (strings the server's language table lacks) */
  strings?: string
  /** false: the documentation folder is not on this timer */
  docs?: boolean
  /** installed plugins deleted since the server started (a restart finishes removing them) */
  removed_plugins?: string[]
}

const info = ref<ServerInfo | null>(null)
/** the latest /app-info answer, for code that can't call useServerInfo() (useI18n) */
export const serverInfoState = info
let pending: Promise<void> | null = null

// one /app-info request serves everyone asking at about the same time with the same sign-in
// (the facts above, and the sign-in check of a device without saved credentials)
let shared: { key: string, at: number, p: Promise<ServerInfo | null> } | null = null
export function requestServerInfo(headers: Record<string, string> = {}): Promise<ServerInfo | null> {
  const key = headers.Authorization || ''
  if (shared && shared.key === key && Date.now() - shared.at < 2000) return shared.p
  const p = fetch('/app-info', { headers, cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null)
  shared = { key, at: Date.now(), p }
  return p
}

export function useServerInfo() {
  const rh = useRH()
  // taken here, in setup, not inside the fetch callback below
  const { restartRequired } = useMessages()

  function fetchInfo() {
    pending = requestServerInfo(rh.authHeader())
      .then((d) => {
        if (!d) return
        info.value = d
        if (d.restart_required) restartRequired.value = true
      })
    return pending
  }

  if (!pending && import.meta.client) {
    fetchInfo()
    // server restarted (new plugins, settings): refresh facts
    rh.on('load_all', () => fetchInfo(), { global: true })
    rh.on('option_update', (d: any) => {
      const o = d?.options || {}
      if (!info.value) return
      if ('eventName' in o) info.value.event.name = o.eventName
      if ('eventDescription' in o) info.value.event.description = o.eventDescription
    }, { global: true })
  }

  // the name set in Settings (kept current as it is changed there or on another device),
  // or the one the server gave at start-up
  const cfg = useConfig()
  const timerName = computed(() => {
    const v = cfg.get<string>('UI', 'timerName', info.value?.timer_name || '')
    return typeof v === 'string' ? v.trim() : ''
  })

  return { info, timerName, refresh: fetchInfo }
}
