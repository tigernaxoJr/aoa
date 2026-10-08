// The site language the visitor uses on the portal (English at the root, 繁體中文 under zh-TW/).
// The portal records it; the workbenches read it so "back to the overview" returns to that language.
// All apps are served from one origin, so they share this localStorage entry.

export type Lang = 'en' | 'zh-Hant'

/** localStorage key: the language the visitor picked, or that they dismissed the suggestion. */
export const LANG_KEY = 'aoa-lang'

export function readLang(): string | null {
  try {
    return localStorage.getItem(LANG_KEY)
  } catch {
    return null
  }
}

export function saveLang(value: string) {
  try {
    localStorage.setItem(LANG_KEY, value)
  } catch {
    // private mode: the choice just isn't remembered
  }
}

/** The portal home in the remembered language, for a page one level below the portal root. */
export const portalHome = () => (readLang() === 'zh-Hant' ? '../zh-TW/' : '../')
