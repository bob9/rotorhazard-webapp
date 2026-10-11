// RotorHazard web interface (Nuxt UI). Built as a static SPA and served by the
// RotorHazard Flask server under /app/. See README.md for development notes.
const RH_SERVER = process.env.RH_SERVER || 'http://localhost:5000'

export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  ssr: false,
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  app: {
    baseURL: '/app/',
    buildAssetsDir: '_rh/',
    head: {
      title: 'RotorHazard',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'theme-color', content: '#0b0b0f' }
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/static/image/RotorHazard Icon.svg' },
        { rel: 'apple-touch-icon', href: '/static/image/apple-touch-icon.png' }
      ]
    }
  },
  // Timers are often run at fields without internet access: bundle everything.
  ui: {
    fonts: false,
    colorMode: true,
    theme: { colors: ['primary', 'secondary', 'success', 'info', 'warning', 'error', 'neutral'] }
  },
  icon: {
    // all icons used in the source are bundled into the client (no CDN at runtime)
    provider: process.env.NODE_ENV === 'development' ? 'server' : 'none',
    clientBundle: { scan: true, includeCustomCollections: true, sizeLimitKb: 1024 },
    serverBundle: 'local'
  },
  nitro: {
    prerender: { routes: ['/'] }
  },
  vite: {
    // Vue tags the elements it renders (__vnode) only in development unless this is on;
    // the classic plugin bridge uses those tags to tell plugin-inserted elements apart
    define: { __VUE_PROD_DEVTOOLS__: 'true' },
    server: {
      proxy: {
        // everything outside the app (socket, classic pages, plugin pages, /app-info...) lives on the timer
        '/socket.io': { target: RH_SERVER, ws: true },
        '^/(?!app(/|$)).+': RH_SERVER
      }
    }
  },
  compatibilityDate: '2026-01-01'
})
