/**
 * Translation using the server's language tables (the same strings as the
 * classic interface). Strings are keyed by their English text.
 */
// The app's own strings that the server's language table lacks (served by the web app
// plugin at /app-strings on a stock server), one fetch per language
const extra = reactive<Record<string, Record<string, string>>>({})
const requested = new Set<string>()
function loadExtra(url: string, lang: string) {
  const key = `${url}|${lang}`
  if (requested.has(key) || !import.meta.client) return
  requested.add(key)
  fetch(`${url}?lang=${encodeURIComponent(lang)}`)
    .then(r => (r.ok ? r.json() : null))
    .then((d) => { if (d?.values && typeof d.values === 'object') extra[lang] = d.values })
    .catch(() => { requested.delete(key) })
}

export function useI18n() {
  const { state } = useRH()
  const lang = computed<string>(() => state.language?.language || '')
  const table = computed<Record<string, string>>(() => {
    const l = lang.value
    if (!l) return {}
    const url = serverInfoState.value?.strings
    if (url) loadExtra(url, l)
    const core = state.all_languages?.languages?.[l]?.values || {}
    return extra[l] ? { ...extra[l], ...core } : core
  })
  function t(text: string | null | undefined, ...args: (string | number)[]) {
    if (text === null || text === undefined) return ''
    let out = table.value[text] || text
    args.forEach((a, i) => { out = out.replace(`{${i}}`, String(a)) })
    return out
  }
  return { t, lang }
}
