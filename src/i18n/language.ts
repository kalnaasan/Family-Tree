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

/** The main language of a browser language tag ("ar-EG", "ar_EG" and "AR" are all "ar"); null for a tag that is not one. */
function mainLanguage(tag: string): string | null {
  try {
    return new Intl.Locale(tag.replace(/_/g, '-')).language
  } catch {
    return null
  }
}

/** The Language to show for a setting. A language that is not available yet is shown as English. */
export function resolveLanguage(
  setting: LanguageSetting,
  browserLanguages: readonly string[],
  available: readonly Language[],
): Language {
  if (setting !== 'auto') return available.includes(setting) ? setting : 'en'
  for (const tag of browserLanguages) {
    const main = mainLanguage(tag)
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
  /** Calls the listener with the saved value (null: removed) whenever another tab changes it. */
  watch?: (listener: (value: string | null) => void) => void
}

interface LanguageState {
  setting: LanguageSetting
  /** The Language in use: the setting resolved against the available languages and the browser. */
  language: Language
  available: readonly Language[]
  setSetting: (setting: LanguageSetting) => void
}

export function createLanguageStore(env: LanguageEnvironment) {
  /** A language that is not available is not kept as the setting: it would switch on by itself the day it is. */
  const usable = (setting: LanguageSetting): LanguageSetting =>
    setting === 'auto' || env.available.includes(setting) ? setting : 'auto'
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
  const setting = isSetting(saved) ? usable(saved) : 'auto'
  show(resolve(setting))
  const store = create<LanguageState>()((set) => ({
    setting,
    language: resolve(setting),
    available: env.available,
    setSetting: (chosen) => {
      const next = usable(chosen)
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
  env.watch?.((value) => {
    const next = value === null ? 'auto' : isSetting(value) ? usable(value) : null
    if (next === null) return
    const language = resolve(next)
    show(language)
    store.setState({ setting: next, language })
  })
  return store
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

/** Another tab changed the setting: `storage` events arrive only in the other tabs. */
function watchOtherTabs(listener: (value: string | null) => void) {
  if (typeof window === 'undefined') return
  window.addEventListener('storage', (event) => {
    if (event.key === LANGUAGE_KEY || event.key === null) listener(event.newValue)
  })
}

/** The app's Language, kept for as long as the page is open. Creating it puts `lang` and `dir` on the page. */
export const useLanguageStore: LanguageStore = createLanguageStore({
  available: AVAILABLE_LANGUAGES,
  storage: browserStorage(),
  browserLanguages: typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language],
  root: typeof document === 'undefined' ? { lang: '', dir: '' } : document.documentElement,
  watch: watchOtherTabs,
})
