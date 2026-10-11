/**
 * Admin access. RotorHazard protects admin actions with HTTP Basic auth; the
 * web app checks credentials against /app-auth and sends them with the
 * Socket.IO handshake so admin socket events are accepted.
 */
const admin = ref<boolean | null>(null)
const loginOpen = ref(false)
// a page refused for lack of sign-in (set by the admin-pages middleware, shown by the layout)
const refusedPath = ref<string | null>(null)
let inflight: Promise<boolean> | null = null

function basicHeader(creds = readCredentials()): Record<string, string> {
  return creds ? { Authorization: 'Basic ' + btoa(unescape(encodeURIComponent(`${creds.username}:${creds.password}`))) } : {}
}

async function check(creds = readCredentials()) {
  // without credentials there is nothing to verify: /app-info says whether this device has
  // admin access anyway (a timer without an admin login), and a guest's console stays free
  // of the 401 that /app-auth answers
  if (!creds) return (await requestServerInfo())?.admin === true
  const headers = basicHeader(creds)
  try {
    const res = await fetch('/app-auth', { headers, cache: 'no-store' })
    return res.ok
  } catch {
    return false
  }
}

export function useAuth() {
  const rh = useRH()

  // concurrent callers (app start, a guarded route) share one request
  function refresh() {
    inflight ||= check().then((ok) => {
      admin.value = ok
      inflight = null
      return ok
    })
    return inflight
  }

  async function login(username: string, password: string) {
    const ok = await check({ username, password })
    if (ok) {
      writeCredentials({ username, password })
      admin.value = true
      rh.reconnect()
    }
    return ok
  }

  function logout() {
    writeCredentials(null)
    // also sign this browser out of the classic pages (see classicSession)
    if (serverInfoState.value?.classic_session !== false) {
      fetch('/app-classic-session', { method: 'DELETE', cache: 'no-store' }).catch(() => {})
    }
    rh.reconnect()
    refresh()
  }

  // The classic pages use the browser's own Basic Auth prompt. Before an admin switches
  // to them, sign this browser in with the app's credentials (a signed session cookie),
  // so the classic pages open without asking again.
  // (Not available from the web app plugin on a stock server: the classic pages then ask once.)
  async function classicSession() {
    if (!readCredentials() || serverInfoState.value?.classic_session === false) return false
    try {
      const res = await fetch('/app-classic-session', { method: 'POST', headers: basicHeader(), cache: 'no-store' })
      return res.ok
    } catch {
      return false
    }
  }

  return { admin, loginOpen, refusedPath, refresh, login, logout, classicSession, hasCredentials: () => !!readCredentials() }
}
