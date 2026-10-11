/**
 * Runs <script> elements inside server/plugin HTML that was inserted with
 * v-html. Browsers never execute scripts added through innerHTML, but the
 * classic interface inserted plugin HTML with jQuery's .html(), which does run
 * them, so plugins may rely on it.
 */
export function runScripts(root: HTMLElement | null | undefined) {
  if (!root) return
  root.querySelectorAll('script').forEach((old) => {
    if ((old as any)._rhRan) return
    const s = document.createElement('script')
    for (const a of Array.from(old.attributes)) s.setAttribute(a.name, a.value)
    s.text = old.textContent || ''
    ;(s as any)._rhRan = true
    old.replaceWith(s)
  })
}
