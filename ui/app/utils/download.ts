/** Saves a Blob as a file download in the browser. */
export function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** Decodes base64 (the server's `file_data`, which may contain line breaks) to bytes. */
export function base64ToBytes(b64: string) {
  const bin = atob((b64 || '').replace(/\s+/g, ''))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/** Saves a server `{file_name, file_data(base64)}` payload as a download. */
export function saveBase64File(fileName: string, b64: string, type = 'application/octet-stream') {
  saveBlob(new Blob([base64ToBytes(b64)], { type }), fileName)
}

/**
 * Splits a backup file name like `database_20261010_142233.db` or
 * `Spring_Cup_20261010_142233.json` into a readable name and its timestamp.
 */
export function parseBackupName(file: string) {
  const base = file.replace(/\.(db|json)$/i, '')
  const m = base.match(/^(.*?)[_ -]?(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/)
  if (!m) return { name: base, date: null as Date | null }
  const [, name, y, mo, d, h, mi, s] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))
  return { name: (name || '').replace(/_/g, ' ').trim(), date: Number.isNaN(date.getTime()) ? null : date }
}
