// Text on a tinted (soft/subtle/outline) background uses a deeper shade than the colour itself, so
// it reads at 4.5:1 or more in light mode (amber or green text on a 10% tint is only about 2:1).
// Class names are written out in full so Tailwind finds them.
const TINT_TEXT = {
  primary: 'text-primary-700 dark:text-primary-300',
  secondary: 'text-secondary-700 dark:text-secondary-300',
  success: 'text-success-800 dark:text-success-300',
  info: 'text-info-700 dark:text-info-300',
  warning: 'text-warning-800 dark:text-warning-300',
  error: 'text-error-700 dark:text-error-300'
} as const
// buttons keep the brand orange; the other colours deepen in light mode only
const BUTTON_TEXT = {
  success: 'text-success-700 dark:text-success',
  info: 'text-info-700 dark:text-info',
  warning: 'text-warning-700 dark:text-warning',
  error: 'text-error-700 dark:text-error'
} as const
type Color = keyof typeof TINT_TEXT
// Solid buttons and badges carry white text in light mode, which needs a deeper shade than the
// colour itself (white on green-500 is about 2.2:1, on amber-500 1.9:1); hover goes darker rather
// than lighter so the text stays readable. Dark mode keeps the bright colour with dark text, and
// hover goes lighter there.
const SOLID_BG = {
  primary: 'hover:bg-primary-700 active:bg-primary-700 dark:hover:bg-primary-400 dark:active:bg-primary-400',
  secondary: 'bg-secondary-600 hover:bg-secondary-700 active:bg-secondary-700 disabled:bg-secondary-600 aria-disabled:bg-secondary-600 dark:bg-secondary dark:hover:bg-secondary-300 dark:active:bg-secondary-300 dark:disabled:bg-secondary dark:aria-disabled:bg-secondary',
  success: 'bg-success-700 hover:bg-success-800 active:bg-success-800 disabled:bg-success-700 aria-disabled:bg-success-700 dark:bg-success dark:hover:bg-success-300 dark:active:bg-success-300 dark:disabled:bg-success dark:aria-disabled:bg-success',
  info: 'bg-info-600 hover:bg-info-700 active:bg-info-700 disabled:bg-info-600 aria-disabled:bg-info-600 dark:bg-info dark:hover:bg-info-300 dark:active:bg-info-300 dark:disabled:bg-info dark:aria-disabled:bg-info',
  warning: 'bg-warning-700 hover:bg-warning-800 active:bg-warning-800 disabled:bg-warning-700 aria-disabled:bg-warning-700 dark:bg-warning dark:hover:bg-warning-300 dark:active:bg-warning-300 dark:disabled:bg-warning dark:aria-disabled:bg-warning',
  error: 'bg-error-600 hover:bg-error-700 active:bg-error-700 disabled:bg-error-600 aria-disabled:bg-error-600 dark:bg-error dark:hover:bg-error-300 dark:active:bg-error-300 dark:disabled:bg-error dark:aria-disabled:bg-error'
} as const
const SOLID_BADGE = {
  secondary: 'bg-secondary-600 dark:bg-secondary',
  success: 'bg-success-700 dark:bg-success',
  info: 'bg-info-600 dark:bg-info',
  warning: 'bg-warning-700 dark:bg-warning',
  error: 'bg-error-600 dark:bg-error'
} as const

const tinted = (variants: string[], slot?: string) => (Object.keys(TINT_TEXT) as Color[]).flatMap(color =>
  variants.map(variant => ({ color, variant, class: slot ? { [slot]: TINT_TEXT[color] } : TINT_TEXT[color] })))

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'rh',
      neutral: 'zinc'
    },
    button: {
      slots: { base: 'font-medium' },
      compoundVariants: [
        ...(Object.keys(BUTTON_TEXT) as (keyof typeof BUTTON_TEXT)[]).flatMap(color =>
          ['outline', 'soft', 'subtle', 'ghost', 'link'].map(variant => ({ color, variant, class: BUTTON_TEXT[color] }))),
        ...(Object.keys(SOLID_BG) as (keyof typeof SOLID_BG)[]).map(color => ({ color, variant: 'solid', class: SOLID_BG[color] })),
        // orange text on an orange tint (a selected soft button) takes the deeper shade in light mode
        ...['soft', 'subtle'].map(variant => ({ color: 'primary' as const, variant, class: 'text-primary-700 dark:text-primary' }))
      ]
    },
    badge: {
      compoundVariants: [
        ...tinted(['soft', 'subtle', 'outline']),
        ...(Object.keys(SOLID_BADGE) as (keyof typeof SOLID_BADGE)[]).map(color => ({ color, variant: 'solid', class: SOLID_BADGE[color] }))
      ]
    },
    // the active item sits on a grey tint, so its text takes a deeper orange in light mode
    navigationMenu: {
      compoundVariants: [{ color: 'primary', variant: 'pill', active: true, class: { link: 'text-primary-700 dark:text-primary', linkLeadingIcon: 'text-primary-700 dark:text-primary group-data-[state=open]:text-primary-700 dark:group-data-[state=open]:text-primary' } }]
    },
    alert: { compoundVariants: tinted(['soft', 'subtle', 'outline'], 'root') },
    card: { slots: { root: 'rounded-2xl' } },
    // panels fill the space left below banners and plugin bars, not the full screen height
    dashboardPanel: { slots: { root: 'relative flex flex-col min-w-0 min-h-0 lg:not-last:border-e lg:not-last:border-default shrink-0' } }
  }
})
