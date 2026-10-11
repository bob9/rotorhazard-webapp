/**
 * After a user switches tabs in a card, bring the newly shown content into view if it
 * now runs below the fold (or above it), without jumping when it already fits.
 */
export function revealAfterTabChange(target: Element | { $el?: Element } | null | undefined) {
  const el = target && '$el' in target ? target.$el : target as Element | null | undefined
  if (!el || typeof window === 'undefined') return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  nextTick(() => requestAnimationFrame(() => el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })))
}
