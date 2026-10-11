/**
 * Server configuration values (the `[SECTION] key` items of config.json).
 *
 * Values are requested with `load({ SECTION: ['key', ...] })`, which the server
 * answers with `config_update`; every payload is merged into one reactive
 * store. `set()` writes with `set_config` and updates the store at once, since
 * the server does not echo config changes back.
 */
const values = reactive<Record<string, Record<string, any>>>({})
let listening = false

function merge(config: Record<string, Record<string, any>> | undefined) {
  for (const [section, items] of Object.entries(config || {})) {
    if (!items || typeof items !== 'object') continue
    // SENSORS always arrives as a whole section, so deleted keys must disappear
    values[section] = section === 'SENSORS' ? { ...items } : { ...(values[section] || {}), ...items }
  }
}

export function useConfig() {
  const rh = useRH()

  if (!listening && import.meta.client) {
    listening = true
    rh.on('config_update', (d: any) => merge(d?.config), { global: true })
  }

  /** Requests config items; kept current across reconnects like any `rh.load`. */
  function load(spec: Record<string, string[]>) {
    rh.load([{ type: 'config', value: spec }])
  }

  function has(section: string, key: string) {
    return !!values[section] && key in values[section]!
  }

  function get<T = any>(section: string, key: string, fallback?: T): T {
    const v = values[section]?.[key]
    return (v === undefined || v === null ? fallback : v) as T
  }

  function set(section: string, key: string, value: any) {
    rh.emit('set_config', { section, key, value })
    values[section] = { ...(values[section] || {}), [key]: value }
  }

  return { values, load, has, get, set }
}
