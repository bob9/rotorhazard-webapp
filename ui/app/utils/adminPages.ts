/** Pages only the event admin can use; guests who open one go to Live with an offer to sign in. */
export const ADMIN_PAGES = [
  '/database', '/vrx-status', '/scanner', '/update-nodes', '/marshal', '/pilots', '/heats', '/formats', '/timer', '/plugins',
  '/settings/general', '/settings/actions', '/settings/leds', '/settings/vrx', '/settings/plugins', '/settings/data',
  '/settings/cluster', '/settings/system'
]
export const isAdminPage = (path: string) => ADMIN_PAGES.includes(path.replace(/\/+$/, '') || '/')
