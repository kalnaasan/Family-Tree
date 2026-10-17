import { create } from 'zustand'

/** The languages the app has text for. Which of them users are offered is `AVAILABLE_LANGUAGES` (spec section 13.1). */
export type Language = 'en' | 'ar'

/** What the user chose in Settings: a language, or `auto` to follow the browser. */
export type LanguageSetting = Language | 'auto'

/**
 * The languages users are offered. Arabic is added here, and only here, when the release gate of spec section 13.8
 * has passed; until then `auto` cannot switch an Arabic browser to unreviewed text.
 */
export const AVAILABLE_LANGUAGES: readonly Language[] = ['en']

/** Where a language reads from, set as `dir` on the page. */
export const DIRECTION: Record<Language, 'ltr' | 'rtl'> = { en: 'ltr', ar: 'rtl' }

/** Each language written in itself, so a reader who cannot read the current one can still find theirs. */
export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', ar: 'العربية' }

/** The key the setting is kept under in `localStorage`: a per-browser preference, never part of the Tree or a backup. */
export const LANGUAGE_KEY = 'family-tree.language'

const isSetting = (value: unknown): value is LanguageSetting => value === 'auto' || value === 'en' || value === 'ar'

/** The Language to show for a setting. A language that is not available yet is shown as English. */
export function resolveLanguage(
  setting: LanguageSetting,
  browserLanguages: readonly string[],
  available: readonly Language[],
): Language {
  if (setting !== 'auto') return available.includes(setting) ? setting : 'en'
  for (const tag of browserLanguages) {
    const main = tag.toLowerCase().split('-')[0]
    const found = available.find((language) => language === main)
    if (found) return found
  }
  return 'en'
}

/** The part of `localStorage` that is used. */
export interface SettingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** The part of `<html>` that is used. */
export interface PageRoot {
  lang: string
  dir: string
}

export interface LanguageEnvironment {
  available: readonly Language[]
  storage: SettingStorage | null
  browserLanguages: readonly string[]
  root: PageRoot
}

interface LanguageState {
  setting: LanguageSetting
  /** The Language in use: the setting resolved against the available languages and the browser. */
  language: Language
  available: readonly Language[]
  setSetting: (setting: LanguageSetting) => void
}

export function createLanguageStore(env: LanguageEnvironment) {
  const resolve = (setting: LanguageSetting) => resolveLanguage(setting, env.browserLanguages, env.available)
  const show = (language: Language) => {
    env.root.lang = language
    env.root.dir = DIRECTION[language]
  }
  // storage can refuse (private windows, blocked site data): the setting then lasts only until the page is closed
  const saved = (() => {
    try {
      return env.storage?.getItem(LANGUAGE_KEY)
    } catch {
      return null
    }
  })()
  const setting: LanguageSetting = isSetting(saved) ? saved : 'auto'
  show(resolve(setting))
  return create<LanguageState>()((set) => ({
    setting,
    language: resolve(setting),
    available: env.available,
    setSetting: (next) => {
      try {
        env.storage?.setItem(LANGUAGE_KEY, next)
      } catch {
        // see above
      }
      const language = resolve(next)
      show(language)
      set({ setting: next, language })
    },
  }))
}

export type LanguageStore = ReturnType<typeof createLanguageStore>

/** `localStorage`, or null where reading it at all is refused. */
function browserStorage(): SettingStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

/** The app's Language, kept for as long as the page is open. Creating it puts `lang` and `dir` on the page. */
export const useLanguageStore: LanguageStore = createLanguageStore({
  available: AVAILABLE_LANGUAGES,
  storage: browserStorage(),
  browserLanguages: typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language],
  root: typeof document === 'undefined' ? { lang: '', dir: '' } : document.documentElement,
})
