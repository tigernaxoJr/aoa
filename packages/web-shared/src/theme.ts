// Light / dark theme the visitor picks. "system" (the default) follows the OS; light and dark override it.
// The choice is remembered in localStorage, which every app shares (one origin), so the portal and the
// workbenches stay in step. Dark is the `dark` class on <html>, which Tailwind's `dark:` variant and
// theme.css key off. Each page also sets the class in an inline <head> script (THEME_BOOT) so a dark
// page doesn't flash light before this module loads.

export type ThemePref = 'system' | 'light' | 'dark'

/** localStorage key: 'light' | 'dark'; absent means follow the system. */
export const THEME_KEY = 'aoa-theme'

export const THEME_ORDER: ThemePref[] = ['system', 'light', 'dark']

export const THEME_ICON: Record<ThemePref, string> = { system: '◐', light: '☀', dark: '☾' }
export const THEME_LABEL: Record<ThemePref, { zh: string; en: string }> = {
  system: { zh: '跟隨系統', en: 'System' },
  light: { zh: '淺色', en: 'Light' },
  dark: { zh: '深色', en: 'Dark' },
}

export function readTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function saveTheme(pref: ThemePref) {
  try {
    if (pref === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, pref)
  } catch {
    // private mode: the choice just isn't remembered
  }
}

export const nextTheme = (pref: ThemePref): ThemePref => THEME_ORDER[(THEME_ORDER.indexOf(pref) + 1) % THEME_ORDER.length]

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches

/** Puts the preference on <html>. */
export function applyTheme(pref: ThemePref = readTheme()) {
  document.documentElement.classList.toggle('dark', pref === 'dark' || (pref === 'system' && prefersDark()))
}

/** Applies the saved preference now, and again when the OS theme or another tab's choice changes. */
export function initTheme(onChange?: (pref: ThemePref) => void) {
  applyTheme()
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (readTheme() === 'system') applyTheme('system')
  })
  addEventListener('storage', (e) => {
    if (e.key !== THEME_KEY) return
    applyTheme()
    onChange?.(readTheme())
  })
}

/** Moves to the next preference (system → light → dark) and returns it. */
export function cycleTheme(): ThemePref {
  const pref = nextTheme(readTheme())
  saveTheme(pref)
  applyTheme(pref)
  return pref
}

/**
 * Wires the `[data-theme-toggle]` buttons on a static page (the portal): a click cycles the preference
 * and the `[data-theme-icon]` inside shows it. Clicks are delegated, so buttons added later work too.
 * Labels follow the page's <html lang>.
 */
export function bindThemeToggles() {
  const zh = document.documentElement.lang.startsWith('zh')
  const paint = (pref: ThemePref) => {
    const text = zh ? `外觀：${THEME_LABEL[pref].zh}（點擊切換）` : `Theme: ${THEME_LABEL[pref].en} (click to change)`
    for (const b of document.querySelectorAll<HTMLElement>('[data-theme-toggle]')) {
      b.title = text
      b.setAttribute('aria-label', text)
      const icon = b.querySelector('[data-theme-icon]')
      if (icon) icon.textContent = THEME_ICON[pref]
    }
  }
  initTheme(paint)
  paint(readTheme())
  document.addEventListener('click', (e) => {
    if ((e.target as Element).closest('[data-theme-toggle]')) paint(cycleTheme())
  })
}
