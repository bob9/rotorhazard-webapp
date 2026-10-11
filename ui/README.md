# RotorHazard Web App

The RotorHazard web interface, built with [Nuxt](https://nuxt.com) and
[Nuxt UI](https://ui.nuxt.com). It is a single-page app that talks to the
RotorHazard server over the same Socket.IO events as the classic interface,
so it supports every timer feature and every plugin the classic pages do.

This folder is the app's source. It is delivered as a RotorHazard plugin,
**RotorHazard Web App** (`custom_plugins/rh_webapp`, see the [main README](../README.md)),
that runs on a stock RotorHazard server. The built app is committed to
`custom_plugins/rh_webapp/webapp/` and served by the plugin at `/app/`, so a timer
never needs Node.js. The classic interface stays available at `/classic` and its
existing URLs (`/run`, `/format`, `/settings`, ...).

The same build also works when served by the core-integrated server of the
[`webapp-redesign`](https://github.com/bob9/RotorHazard/tree/webapp-redesign) branch:
the plugin answers the same HTTP endpoints, and adds a few facts to `/app-info` that
the app uses to adapt (`host`, `classic_session`, `strings`, `docs`, `removed_plugins`;
absent means "core-integrated").

### Choosing an interface

- Each device chooses for itself: "Classic interface" in the app (sidebar or
  account menu) and "New Interface" in the classic menu go through
  `/interface/classic` and `/interface/app`, which remember the choice in a
  cookie and decide what `/` opens on that device. Each switch opens the matching
  page of the other interface (`?to=`); returning from a classic page reopens the
  app page that sent you there (a short-lived `rh_app_return` cookie).
- Devices that have not chosen get the timer's default, set in
  Settings › General › Default Interface (config `UI.classicInterface`;
  the new interface unless set to classic). The plugin also shows this setting
  on the classic Settings page (panel "Web App"), and adds "New interface" to
  the classic menu with a small script (`custom_plugins/rh_webapp/static/classic.js`).

## Development

```bash
cd ui
npm install
# start a timer with mock nodes in another terminal (a RotorHazard checkout):
#   cp -r ../custom_plugins/rh_webapp ~/rh-data/plugins/   (once; the app's HTTP endpoints)
#   cd RotorHazard/src/server && python server.py --mock-nodes 4
npm run dev          # http://localhost:3000/app/ (proxies to the timer on :5000)
RH_SERVER=http://192.168.1.50 npm run dev   # use a timer elsewhere on the network
npm run build        # generate and copy into custom_plugins/rh_webapp/webapp/
npm run package-plugin   # build, then zip the plugin: dist/rh_webapp.zip
```

Run `npm run build` and commit `custom_plugins/rh_webapp/webapp/` together with source changes.
(`RH_WEBAPP_DEST=<dir> npm run build` copies the build somewhere else, e.g.
`src/server/webapp` for the core-integrated branch.)

## How it fits together

| Piece | Where |
|---|---|
| Socket connection, server state, `load_data` | `app/composables/useRH.ts` |
| Admin sign-in (HTTP Basic credentials sent with the socket handshake) | `app/composables/useAuth.ts`, `/app-auth` route |
| Server facts (version, LEDs/VRx enabled, plugin pages, event name) | `app/composables/useServerInfo.ts`, `/app-info` route |
| Translations (server language tables, keyed by English text, plus the app's own strings from the plugin's `/app-strings`) | `app/composables/useI18n.ts` → `t('Text')`, `custom_plugins/rh_webapp/translations.json` |
| Race clock synced to server monotonic time | `app/composables/useRaceClock.ts` |
| Voice callouts and tones (same localStorage keys as the classic UI) | `app/composables/useAudio.ts` |
| Notifications, alerts, restart banner | `app/composables/useMessages.ts` |
| Plugin panels (`rhapi.ui.register_panel`) | `app/composables/usePluginUI.ts`, `RhPluginPanels`, `RhField` |
| Presentation mode of Live (`/live?kiosk=1`: no app chrome, scaled to fit the screen without scrolling, full screen) | `app/pages/live.vue`, `app/composables/useKiosk.ts` |

Each server event's latest payload is stored on `useRH().state[eventName]`.
A page calls `rh.load([...load types])` for what it needs; the request is
replayed after a reconnect or server restart. Write actions are plain
`rh.emit(event, payload)` calls, using the same events as the classic UI.
Several race-control events (`stage_race`, `stop_race`, `save_laps`,
`discard_laps`) must be sent **without** a payload.

## Plugins

- **Panels** registered for a page (`settings`, `format`, `run`, `marshal`,
  `results`, `streams`) appear on the matching page:
  - `run` → Race (Plugins tab)
  - `marshal` → Marshal
  - `results` → Results
  - `format` → Event
  - `settings` and `streams` → Settings › Plugins & Streams

  Panels for any other page key are also listed under Settings › Plugins & Streams.
- **Fields** of all types, **quick buttons** and **Markdown** (HTML allowed) are
  rendered by `RhField`, `RhPluginPanels` and `RhMarkdown`.
- **Attributes** for pilots, heats and classes are edited with their entity.
- **Pages** added with `rhapi.ui.blueprint_add()` appear under "Plugin Pages"
  in the sidebar for admins, named after their plugin. Only GET routes without
  URL parameters whose view renders HTML are listed (JSON/API routes are left
  out). To name a page yourself, or to list it for everyone, call
  `register_nav_link(name, label, url, admin_only=False, order=0)` from the
  web app plugin (`from plugins.rh_webapp import register_nav_link`, in a
  `try`), or `rhapi.ui.register_nav_link(...)` on the core-integrated server.
- **Pages shown in the app** are framed same-origin; the app hides the classic
  header and footer inside the frame (`app/pages/page.vue`).
- **Panels shown to guests** include only their Markdown; settings, fields and
  quick buttons are shown to signed-in admins.
- **Scripts in Markdown and field descriptions** run, as they did on the
  classic pages. Plugins that load a script to build UI on the classic pages
  (for example Sensor Top Bar, Auto Marshalling, Gate Walkthrough Calibration)
  are supported by `app/plugins/classic-bridge.client.ts`: it provides the
  classic globals (`io`, `socket`, `__`; new `io()` connections carry the
  device's admin credentials), the Race and Marshal pages carry the classic
  element ids those scripts look for (`leaderboard`, `race-graph`,
  `selected_heat`, `selected_round`, plus `window.marshal` /
  `window.current_race_data` on Marshal), bars added to `<body>` are shown
  above the page, and plugin elements inside a page survive navigation.
  `/app-info` lists the site-wide loader scripts (`site_scripts`), so the app
  starts them at once and keeps room for their bar until it has drawn.
- Importers, exporters, heat generators, ranking and points methods, event
  actions, LED effects and VRx controllers all use their existing registries.

## UI conventions

- Pages use `UDashboardPanel` + `UDashboardNavbar`; content is centered with
  `mx-auto w-full max-w-…` and generous spacing (`space-y-6`/`space-y-8`).
- Settings-style lists use `RhGroup` (inset grouped list) with `RhRow` rows:
  label + description on the left, control on the right.
- Tables of data use plain `<table>` styling like `RhLeaderboard`
  (11px uppercase headers, `divide-y divide-default`, `tabular` numbers).
- Destructive actions confirm in a `UModal`; successful actions that have no
  visible effect show a short `useToast()` message.
- Every user-visible string goes through `t()`. Use the classic UI's English
  wording where the meaning is the same, so existing translations apply.
  Translations of new strings go in `custom_plugins/rh_webapp/translations.json`
  (same layout as RotorHazard's `language.json`, new strings only).
- Use only `i-lucide-*` icons, written as literal strings (they are bundled at
  build time by scanning the source).
- Use semantic colors (`text-muted`, `bg-elevated`, `text-highlighted`,
  `ring-default`, `primary`, `error`...) so light and dark modes both work.
  `text-dimmed` and `text-muted` meet 4.5:1 on every background up to `bg-elevated`
  (`assets/css/main.css`); tinted badges and alerts use deeper text shades, and solid buttons and
  badges deeper backgrounds behind white text in light mode (`app.config.ts`). Light mode's
  primary is a deeper RotorHazard orange (`#d43d08`), so orange text and white-on-orange pass 4.5:1.
- A missing value in a table or card is `<RhValue :value="x" />`: the value, or one
  dimmed em dash.
- Tabs that a link or search result can open keep their tab in the address
  (`?tab=`, replaced rather than pushed), as on Timer, Results and Plugins.
