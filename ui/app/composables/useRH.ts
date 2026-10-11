import { io, type Socket } from 'socket.io-client'
import type { RHState } from '~/utils/types'

/**
 * Live connection to the RotorHazard server.
 *
 * The server pushes its state as Socket.IO events; each one is stored on a
 * single reactive object so every page simply reads `rh.state.<event>`.
 * Pages ask for the data they need with `rh.load([...])`, which is also
 * replayed automatically after a reconnect.
 */

// events whose latest payload is kept verbatim on `state`
const STATE_EVENTS = [
  'race_status', 'current_heat', 'current_laps', 'leaderboard', 'heartbeat',
  'node_data', 'frequency_data', 'seat_data', 'heat_data', 'class_data',
  'pilot_data', 'format_data', 'language', 'all_languages', 'min_lap',
  'node_tuning', 'enter_and_exit_at_levels', 'event_actions', 'action_setup',
  'result_data', 'race_list', 'cluster_status', 'vrx_list', 'exporter_list',
  'importer_list', 'heatgenerator_list', 'raceclass_rank_method_list',
  'race_points_method_list', 'backups_list', 'upd_cfg_files_list',
  'environmental_data', 'heat_attribute_types', 'start_thresh_lower_amount',
  'start_thresh_lower_duration', 'led_effect_setup', 'led_effects', 'callouts',
  'imdtabler_data', 'heat_list', 'class_list', 'pilot_list', 'ui',
  'config', 'plugin_list', 'plugin_repo', 'server_info', 'race_scheduled',
  'lap_data', 'race_details', 'pilot_race_details', 'hardware_log_init'
] as const

type Handler = (data: any) => void
export type LoadType = string | { type: string, value: any }
const loadKey = (t: LoadType) => typeof t === 'string' ? t : JSON.stringify(t)

const state = reactive<RHState>({} as RHState)
const status = reactive({
  connected: false,
  everConnected: false,
  serverToken: null as number | null,
  /** milliseconds to add to local monotonic clock to get server monotonic time */
  serverOffsetMs: 0,
  latencyMs: 0
})

let socket: Socket | null = null
// load_data types requested so far (keyed by JSON so object types dedupe)
const loaded = new Map<string, LoadType>()
const handlers = new Map<string, Set<Handler>>()

function dispatch(event: string, data: any) {
  handlers.get(event)?.forEach((h) => {
    try {
      h(data)
    } catch (e) {
      console.error(`[rh] handler for '${event}' failed`, e)
    }
  })
  handlers.get('*')?.forEach(h => h({ event, data }))
}

function authHeader(): Record<string, string> {
  const creds = readCredentials()
  return creds ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${creds.username}:${creds.password}`))) } : {}
}

export function readCredentials(): { username: string, password: string } | null {
  try {
    const raw = localStorage.getItem('rh.credentials')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function writeCredentials(creds: { username: string, password: string } | null) {
  try {
    if (creds) localStorage.setItem('rh.credentials', JSON.stringify(creds))
    else localStorage.removeItem('rh.credentials')
  } catch { /* storage unavailable */ }
}

async function syncClock(s: Socket) {
  // server monotonic time sync, used to render race clocks that agree with the timer
  const samples: { offset: number, rtt: number }[] = []
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now()
    const reply: any = await new Promise(resolve => s.timeout(2000).emit('get_server_time', {}, (_err: any, r: any) => resolve(r))).catch(() => null)
    const t1 = performance.now()
    if (!reply || typeof reply.server_time_s !== 'number') break
    const rtt = t1 - t0
    samples.push({ rtt, offset: reply.server_time_s * 1000 - (t0 + rtt / 2) })
  }
  if (samples.length) {
    samples.sort((a, b) => a.rtt - b.rtt)
    status.serverOffsetMs = samples[0]!.offset
    status.latencyMs = samples[0]!.rtt
  }
}

function connect() {
  if (socket) return socket
  socket = io({
    path: '/socket.io',
    transports: ['polling', 'websocket'],
    extraHeaders: authHeader(),
    transportOptions: { polling: { extraHeaders: authHeader() } }
  })

  socket.on('connect', () => {
    status.connected = true
    status.everConnected = true
    if (loaded.size) emitLoads([...loaded.values()])
    syncClock(socket!)
  })
  socket.on('disconnect', () => {
    status.connected = false
  })
  socket.on('load_all', (data: any) => {
    // server restarted with a new instance: reload everything we track
    if (status.serverToken !== null && data?.server_instance_token !== status.serverToken && loaded.size) {
      emitLoads([...loaded.values()])
    }
    status.serverToken = data?.server_instance_token ?? null
    dispatch('load_all', data)
  })
  socket.onAny((event: string, data: any) => {
    if ((STATE_EVENTS as readonly string[]).includes(event)) {
      ;(state as any)[event] = data
    }
    if (event !== 'load_all') dispatch(event, data)
  })
  return socket
}

/**
 * Asks for a batch of data. The server answers a request's types one after another, and
 * plugin panel lists ('ui') take it a while to build: they go in a request of their own,
 * after the page's data, so a page doesn't wait for every plugin's panels to show its race.
 */
function emitLoads(types: LoadType[]) {
  const isUi = (t: LoadType) => typeof t !== 'string' && t.type === 'ui'
  const first = types.filter(t => !isUi(t))
  const later = types.filter(isUi)
  if (first.length) socket!.emit('load_data', { load_types: first })
  if (later.length) socket!.emit('load_data', { load_types: later })
}

/** Reconnects with the stored credentials (after login/logout). */
function reconnect() {
  if (socket) {
    socket.removeAllListeners()
    socket.disconnect()
    socket = null
  }
  status.connected = false
  connect()
}

/**
 * Sends an event. Without data it is sent with no payload at all: several
 * server handlers (stage_race, stop_race, save_laps, discard_laps) take their
 * positional arguments from the payload and fail or misbehave if one is sent.
 */
function emit(event: string, data?: any) {
  if (data === undefined) connect().emit(event)
  else connect().emit(event, data)
}

/** Emits and waits for the server's acknowledgement callback (if the handler returns one). */
function call<T = any>(event: string, data: any = {}, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    connect().timeout(timeoutMs).emit(event, data, (err: any, res: T) => (err ? reject(err) : resolve(res)))
  })
}

/** Requests data from the server and keeps it current across reconnects. */
function load(types: LoadType[]) {
  const fresh = types.filter(t => !loaded.has(loadKey(t)))
  types.forEach(t => loaded.set(loadKey(t), t))
  const s = connect()
  if (s.connected) emitLoads(fresh.length ? fresh : types)
}

/** Re-request data (even if already loaded). */
function refresh(types: LoadType[]) {
  types.forEach(t => loaded.set(loadKey(t), t))
  connect().emit('load_data', { load_types: types })
}

/**
 * Subscribes to a server event. Inside a component the subscription ends when
 * the component unmounts; pass `{ global: true }` for app-wide listeners that
 * shared composables register once.
 */
function on(event: string, handler: Handler, opts: { global?: boolean } = {}) {
  if (!handlers.has(event)) handlers.set(event, new Set())
  handlers.get(event)!.add(handler)
  const off = () => handlers.get(event)?.delete(handler)
  if (!opts.global && getCurrentInstance()) onBeforeUnmount(off)
  return off
}

/** Current server monotonic time in seconds. */
function serverNow() {
  return (performance.now() + status.serverOffsetMs) / 1000
}

/** The underlying Socket.IO connection (used by the classic plugin bridge). */
function getSocket() {
  return connect()
}

export function useRH() {
  if (import.meta.client) connect()
  return { state, status, emit, call, load, refresh, on, reconnect, serverNow, authHeader, getSocket }
}
