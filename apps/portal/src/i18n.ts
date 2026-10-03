// Language switch shared by the home pages (vite.config.ts injects it at <!--lang-switch-->) and the
// article reader (articles.ts). English is the default site language; 繁體中文 lives under zh-TW/.
export type Lang = 'en' | 'zh-Hant'

/** localStorage key: the language the visitor picked, or that they dismissed the suggestion. */
export const LANG_KEY = 'aoa-lang'

const base = 'rounded-[3px] px-2.5 py-1 transition-colors'
const active = 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
const idle = 'text-stone-600 hover:bg-stone-200 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-white'

/** A segmented EN | 中文 control; `enHref` / `zhHref` point at the same page in each language. */
export function langSwitch(current: Lang, enHref: string, zhHref: string): string {
  const option = (lang: Lang, href: string, label: string) =>
    lang === current
      ? `<span class="${base} ${active}" aria-current="true" lang="${lang}">${label}</span>`
      : `<a href="${href}" hreflang="${lang}" lang="${lang}" data-set-lang="${lang}" class="${base} ${idle}">${label}</a>`
  return `<div class="flex items-center gap-2" role="group" aria-label="Language / 語言">
            <svg class="h-4 w-4 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z"/></svg>
            <div class="flex rounded-md border border-stone-300 bg-white/60 p-0.5 text-xs font-medium dark:border-stone-700 dark:bg-stone-900/60">${option('en', enHref, 'EN')}${option('zh-Hant', zhHref, '中文')}</div>
          </div>`
}

const store = {
  get: () => {
    try {
      return localStorage.getItem(LANG_KEY)
    } catch {
      return null
    }
  },
  set: (value: string) => {
    try {
      localStorage.setItem(LANG_KEY, value)
    } catch {
      // private mode: the choice just isn't remembered
    }
  },
}

/**
 * Remembers explicit language choices, and on English pages offers 繁體中文 to visitors whose browser
 * prefers Chinese (shown until they pick a language or dismiss it). Never redirects on its own.
 */
export function initLanguage() {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element).closest<HTMLElement>('[data-set-lang]')
    if (link) store.set(link.dataset.setLang!)
  })
  const hint = document.getElementById('lang-hint')
  if (!hint || store.get()) return
  if (!navigator.languages.some((l) => l.toLowerCase().startsWith('zh'))) return
  hint.hidden = false
  hint.querySelector('[data-dismiss]')?.addEventListener('click', () => {
    store.set('en')
    hint.hidden = true
  })
}
