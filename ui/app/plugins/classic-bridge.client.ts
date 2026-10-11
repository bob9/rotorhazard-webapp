import { io as ioClient } from 'socket.io-client'

/**
 * Classic plugin bridge.
 *
 * Some plugins add a panel whose Markdown only loads a script, and that script
 * builds UI on the classic pages: it expects the classic globals (`io`,
 * `socket`, `__`), finds classic element ids (`leaderboard`, `race-graph`,
 * `selected_heat`...) and inserts its own elements, sometimes straight into
 * <body>. This plugin provides that environment so those plugins keep working:
 *
 * - `window.io` is the Socket.IO client, with this device's admin credentials
 *   added to new connections (classic pages relied on the browser's cached
 *   Basic auth); `window.socket` is the app's own connection; `window.__`
 *   translates like the classic helper.
 * - Pages tag their matching elements with the classic ids (see the Race and
 *   Marshal pages).
 * - Elements plugins insert at the top of <body> are moved into a slot above
 *   the page content, where the full-screen layout does not cover them.
 * - Elements plugins insert into a page survive navigating away and back: they
 *   are parked when the page closes and put back next to the same anchor when
 *   it is shown again.
 * - A loader script that a plugin adds to three or more pages is a site-wide
 *   add-on (e.g. a status bar); it is loaded once at startup so it appears on
 *   every page, not only after visiting one of the pages that load it.
 * - A loader script used on only one or two pages gets a fresh page load when
 *   you move between those pages, as the classic pages always did.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const rh = useRH()
  const w = window as any

  // ---- globals ------------------------------------------------------------
  const withAuth = (opts: any = {}) => {
    const headers = { ...rh.authHeader(), ...(opts.extraHeaders || {}) }
    return {
      ...opts,
      extraHeaders: headers,
      transportOptions: { ...(opts.transportOptions || {}), polling: { ...(opts.transportOptions?.polling || {}), extraHeaders: headers } }
    }
  }
  const bridgedIo: any = (url?: any, opts?: any) => {
    if (url && typeof url === 'object') return ioClient(withAuth(url))
    return ioClient(url, withAuth(opts))
  }
  bridgedIo.connect = bridgedIo
  Object.assign(bridgedIo, { Manager: (ioClient as any).Manager, Socket: (ioClient as any).Socket, protocol: (ioClient as any).protocol })
  if (!w.io) w.io = bridgedIo
  Object.defineProperty(w, 'socket', { configurable: true, get: () => rh.getSocket() })
  if (!w.__) {
    w.__ = (text: string) => {
      const lang = rh.state.language?.language
      return (lang && rh.state.all_languages?.languages?.[lang]?.values?.[text]) || text
    }
  }

  // ---- site-wide loader scripts -------------------------------------------
  const HOST_PAGES = ['run', 'settings', 'format', 'marshal', 'results']
  const loaderSrcs = new Map<string, Set<string>>()
  const loaded = new Set<string>()
  const boot = usePluginBoot()
  const answered = new Set<string>()
  function loadSiteScript(src: string) {
    if (loaded.has(src)) return
    loaded.add(src)
    if (document.querySelector(`script[src="${src}"]`)) return
    const el = document.createElement('script')
    el.src = src
    boot.value.scripts++
    el.onload = el.onerror = () => { boot.value.scripts = Math.max(0, boot.value.scripts - 1) }
    document.head.appendChild(el)
  }
  // the server lists the site-wide scripts in /app-info: start them without waiting for the panels
  const { info } = useServerInfo()
  watch(info, (i) => {
    if (!i || !Array.isArray(i.site_scripts)) return
    boot.value.expectBar = i.site_scripts.length > 0
    for (const src of i.site_scripts) {
      if (!loaderSrcs.has(src)) loaderSrcs.set(src, new Set(['run', 'settings', 'format']))
      loadSiteScript(src)
    }
  }, { immediate: true })
  rh.on('ui', (d: any) => {
    if (!d?.page || !HOST_PAGES.includes(d.page)) return
    answered.add(d.page)
    for (const panel of d.panels || []) {
      for (const m of panel.markdowns || []) {
        for (const match of String(m.desc || '').matchAll(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi)) {
          const src = match[1]!
          if (!loaderSrcs.has(src)) loaderSrcs.set(src, new Set())
          loaderSrcs.get(src)!.add(d.page)
          if (loaderSrcs.get(src)!.size >= 3) loadSiteScript(src)
        }
      }
    }
    // every host page has listed its panels: any site-wide script is known (and counted) by now
    if (answered.size === HOST_PAGES.length) boot.value.panelsPending = false
  }, { global: true })
  // start the plugin panel store first, so the replies to this request are kept
  usePluginUI()
  rh.load(HOST_PAGES.map(value => ({ type: 'ui', value })))

  // ---- elements added at the top of <body> ----------------------------------
  const known = (n: Element) => n.id === '__nuxt' || n.id === 'teleports' || n.tagName === 'SCRIPT' || n.tagName === 'STYLE' || n.tagName === 'LINK'
    || n.hasAttribute('data-reka-portal') || n.closest('[data-reka-popper-content-wrapper]') !== null || n.id === 'rh-plugin-holder'
  function adoptBodyElements() {
    const slot = document.getElementById('rh-plugin-top')
    if (!slot) return
    for (const n of Array.from(document.body.children)) {
      if (known(n)) continue
      // only elements placed before the app (a plugin bar), not overlays appended at the end
      const nuxt = document.getElementById('__nuxt')
      if (nuxt && n.compareDocumentPosition(nuxt) & Node.DOCUMENT_POSITION_FOLLOWING) slot.appendChild(n)
    }
  }
  new MutationObserver(adoptBodyElements).observe(document.body, { childList: true })
  // a bar drawn before the app had rendered its slot is moved in once the slot is there
  nuxtApp.hook('app:mounted', adoptBodyElements)
  nuxtApp.hook('page:finish', adoptBodyElements)

  // ---- plugin elements inside pages survive navigation ---------------------
  interface Parked { node: Element, anchorId: string | null, parentId: string | null }
  let parked: Parked[] = []
  const holder = document.createElement('div')
  holder.id = 'rh-plugin-holder'
  holder.hidden = true
  document.body.appendChild(holder)

  const isVue = (n: any) => !!(n.__vnode || n.__vueParentComponent)
  function foreignNodes(root: Element) {
    // elements not rendered by Vue, whose parent is (that is, inserted by plugin scripts)
    const out: Element[] = []
    root.querySelectorAll('*').forEach((n) => {
      if (!isVue(n) && n.parentElement && isVue(n.parentElement) && !n.closest('#rh-plugin-top') && !n.closest('.rh-prose, .rh-desc, .rh-about')) out.push(n)
    })
    return out
  }
  function nextAnchorId(n: Element) {
    let s = n.nextElementSibling
    while (s) {
      if (s.id) return s.id
      s = s.nextElementSibling
    }
    return null
  }
  const main = () => document.getElementById('__nuxt')

  nuxtApp.$router.beforeEach((to, from) => {
    if (to.path === from.path) return
    const root = main()
    if (!root) return
    for (const node of foreignNodes(root)) {
      parked.push({ node, anchorId: nextAnchorId(node), parentId: node.parentElement?.id || null })
      holder.appendChild(node)
    }
  })

  function restore() {
    parked = parked.filter((p) => {
      const anchor = p.anchorId ? document.getElementById(p.anchorId) : null
      if (anchor?.parentNode && !holder.contains(anchor)) {
        anchor.parentNode.insertBefore(p.node, anchor)
        return false
      }
      const parent = p.parentId ? document.getElementById(p.parentId) : null
      if (parent && !holder.contains(parent)) {
        parent.appendChild(p.node)
        return false
      }
      return true
    })
  }
  nuxtApp.$router.afterEach(() => {
    // pages render their content over a few ticks (data arrives over the socket)
    for (const ms of [50, 400, 1500]) setTimeout(restore, ms)
  })

  // ---- page-specific loader scripts ---------------------------------------
  // A script a plugin loads on only one or two pages expects a fresh start on each of
  // them (classic pages were full page loads) and positions its UI only when it starts.
  // When one has already started on another page, entering this page reloads it.
  const PAGE_KEY: Record<string, string> = { '/': 'run', '/marshal': 'marshal', '/results': 'results', '/event': 'format', '/settings/plugins': 'settings' }
  const startedOn = new Map<string, string>()
  const { panelsFor } = usePluginUI()
  function pageScripts(key: string) {
    const srcs: string[] = []
    for (const panel of panelsFor(key)) {
      for (const m of panel.markdowns || []) {
        for (const match of String(m.desc || '').matchAll(/<script[^>]*\ssrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi)) {
          const src = match[1]!
          if ((loaderSrcs.get(src)?.size || 0) < 3) srcs.push(src)
        }
      }
    }
    return srcs
  }
  nuxtApp.$router.afterEach((to, from) => {
    const key = PAGE_KEY[to.path]
    if (!key || to.path === from.path) return
    for (const src of pageScripts(key)) {
      const prev = startedOn.get(src)
      if (prev && prev !== key) {
        window.location.reload()
        return
      }
      startedOn.set(src, key)
    }
  })
  // the first page shown starts its scripts directly
  watch(() => panelsFor(PAGE_KEY[nuxtApp.$router.currentRoute.value.path] || ''), () => {
    const key = PAGE_KEY[nuxtApp.$router.currentRoute.value.path]
    if (!key) return
    for (const src of pageScripts(key)) if (!startedOn.has(src)) startedOn.set(src, key)
  }, { immediate: true })
})
