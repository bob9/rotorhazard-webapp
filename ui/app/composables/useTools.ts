/**
 * The timer's tool pages, described once: every list that offers them (Timer,
 * Settings › System, Settings › Data, search) shows the same name, icon and wording,
 * and offers each only where it works (admin, debug mode, the right hardware).
 */
export interface RhTool {
  key: 'imdtabler' | 'scanner' | 'vrx-status' | 'update-nodes' | 'database'
  label: string
  description: string
  icon: string
  to: string
  keywords: string
}

export function useTools() {
  const { t } = useI18n()
  const { info } = useServerInfo()
  const { admin } = useAuth()

  const all = computed<(RhTool & { show: boolean })[]>(() => {
    const i = info.value
    const isAdmin = admin.value === true
    return [
      { key: 'imdtabler', label: t('IMDTabler'), description: t('Rate frequency sets for intermodulation interference'), icon: 'i-lucide-table', to: '/imdtabler', keywords: 'imd imdtabler intermodulation interference rating', show: true },
      { key: 'scanner', label: t('Band Scanner'), description: t('Scan the band for interference.'), icon: 'i-lucide-scan-line', to: '/scanner', keywords: 'scanner scan band spectrum rssi interference sweep', show: isAdmin && !!i?.debug },
      { key: 'vrx-status', label: t('VRx Status'), description: t('Connected video receivers'), icon: 'i-lucide-monitor', to: '/vrx-status', keywords: 'vrx status receivers goggles video diagnostics', show: isAdmin && !!i?.vrx_enabled },
      { key: 'update-nodes', label: t('Update Nodes'), description: t('Flash new firmware to the timing node processor.'), icon: 'i-lucide-cpu', to: '/update-nodes', keywords: 'update nodes firmware flash bpill stm32 node processor', show: isAdmin && !!i?.node_fw_updatable },
      { key: 'database', label: t('Database'), description: t('Read-only tables of the current database (debug mode).'), icon: 'i-lucide-table-2', to: '/database', keywords: 'database tables view db raw data', show: isAdmin && !!i?.debug }
    ]
  })

  /** the tools available here, optionally only some of them, in the canonical order */
  function tools(keys?: RhTool['key'][]) {
    return computed(() => all.value.filter(x => x.show && (!keys || keys.includes(x.key))))
  }
  return { tools }
}
