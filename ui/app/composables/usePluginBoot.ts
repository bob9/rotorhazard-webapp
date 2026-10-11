/**
 * Start-up progress of plugin add-ons that draw a bar above the page (classic-bridge.client.ts):
 * whether the plugin panel lists are still on their way, how many site-wide loader scripts are
 * still loading, and whether the server says such a script exists (`expectBar`; null until
 * /app-info has answered, or from a server that doesn't say). The layout uses it to keep room
 * for the bar until it has drawn.
 */
export const usePluginBoot = () => useState('rh.pluginBoot', () => ({ panelsPending: true, scripts: 0, expectBar: null as boolean | null }))
