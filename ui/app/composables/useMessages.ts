/**
 * Server notifications: priority messages (toasts / alerts), the message
 * history, restart-required state and page reload requests.
 */
export interface RHMessage {
  id: number
  message: string
  interrupt: boolean
  time: Date
}

const messages = ref<RHMessage[]>([])
const unread = ref(0)
const alerts = ref<RHMessage[]>([])
const restartRequired = ref(false)
const restarting = ref(false)
let started = false
let nextId = 1

const hasText = (s: string) => /[a-z0-9]/i.test(s.replace(/<[^>]*>/g, ''))

export function useMessages() {
  const rh = useRH()
  const toast = useToast()
  const { admin } = useAuth()
  const { t } = useI18n()

  if (!started && import.meta.client) {
    started = true
    rh.on('priority_message', (d: any) => {
      if (!d?.message || !hasText(d.message)) return
      if (d.admin_only && !admin.value) return
      const m: RHMessage = { id: nextId++, message: d.message, interrupt: !!d.interrupt, time: new Date() }
      messages.value = [m, ...messages.value].slice(0, 100)
      unread.value++
      // the server's "errors were logged" notice links to the classic log page: show it as a
      // toast that opens the app's own log viewer, not a pop-up blocking the whole app
      if (/href="\/hardwarelog/.test(m.message)) {
        toast.add({
          title: stripHtml(m.message.split('<br')[0]!),
          icon: 'i-lucide-triangle-alert',
          color: 'warning',
          duration: 12000,
          actions: [{ label: t('View error log'), color: 'neutral', variant: 'outline', onClick: () => { navigateTo('/settings/system?log=ERROR') } }]
        })
      } else if (m.interrupt) alerts.value.push(m)
      else toast.add({ description: stripHtml(m.message), icon: 'i-lucide-bell', color: 'neutral' })
    }, { global: true })
    rh.on('clear_priority_messages', () => {
      messages.value = []
      unread.value = 0
    }, { global: true })
    rh.on('restart_required', () => { restartRequired.value = true }, { global: true })
    rh.on('restart_not_required', () => { restartRequired.value = false }, { global: true })
    rh.on('server_restarting', () => {
      restarting.value = true
    }, { global: true })
    rh.on('load_all', () => {
      if (restarting.value) {
        restarting.value = false
        restartRequired.value = false
      }
    }, { global: true })
    rh.on('refresh_page', () => window.location.reload(), { global: true })
    rh.on('database_restore_done', () => window.location.reload(), { global: true })
  }

  function restartServer() {
    restarting.value = true
    rh.emit('restart_server')
  }

  return { messages, unread, alerts, restartRequired, restarting, restartServer }
}

export function stripHtml(html: string) {
  const d = document.createElement('div')
  d.innerHTML = html
  return d.textContent || ''
}
