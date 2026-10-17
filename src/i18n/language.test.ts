import { describe, expect, it } from 'vitest'
import { serializeDocument } from '../domain/document.ts'
import { generateTree } from '../layout/fixtures.ts'
import { LANGUAGE_KEY, createLanguageStore, resolveLanguage } from './language.ts'

/** A place to keep the setting and a page root, standing in for `localStorage` and `<html>`. */
function environment(stored?: string, available: ('en' | 'ar')[] = ['en', 'ar'], browserLanguages = ['en-US']) {
  const values = new Map<string, string>(stored === undefined ? [] : [[LANGUAGE_KEY, stored]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => void values.set(key, value) }
  const root = { lang: '', dir: '' }
  let notify: (value: string | null) => void = () => {}
  /** What another tab changing the setting looks like. */
  const changeInAnotherTab = (value: string | null) => notify(value)
  const watch = (listener: (value: string | null) => void) => void (notify = listener)
  return { values, storage, root, available, browserLanguages, watch, changeInAnotherTab }
}

describe('resolving the Language', () => {
  it('uses an explicit setting when that language is available', () => {
    expect(resolveLanguage('ar', ['en-US'], ['en', 'ar'])).toBe('ar')
    expect(resolveLanguage('en', ['ar'], ['en', 'ar'])).toBe('en')
  })

  it('uses English when the chosen language is not available yet', () => {
    expect(resolveLanguage('ar', ['ar'], ['en'])).toBe('en')
  })

  describe('auto', () => {
    it('follows the first browser language that is available, by its main part, in any case', () => {
      expect(resolveLanguage('auto', ['ar-EG', 'en'], ['en', 'ar'])).toBe('ar')
      expect(resolveLanguage('auto', ['AR'], ['en', 'ar'])).toBe('ar')
      expect(resolveLanguage('auto', ['de-DE', 'ar', 'en'], ['en', 'ar'])).toBe('ar')
    })

    it('uses English when no browser language is available', () => {
      expect(resolveLanguage('auto', ['de-DE', 'fr'], ['en', 'ar'])).toBe('en')
      expect(resolveLanguage('auto', [], ['en', 'ar'])).toBe('en')
    })

    it('reads tags written with an underscore, and skips empty ones', () => {
      expect(resolveLanguage('auto', ['ar_EG'], ['en', 'ar'])).toBe('ar')
      expect(resolveLanguage('auto', ['', 'ar'], ['en', 'ar'])).toBe('ar')
    })

    it('does not follow a browser language that is not available yet', () => {
      expect(resolveLanguage('auto', ['ar-EG'], ['en'])).toBe('en')
    })
  })
})

describe('the Language setting', () => {
  it('starts from the saved setting and puts lang and dir on the page', () => {
    const env = environment('ar')
    const store = createLanguageStore(env)
    expect(store.getState().setting).toBe('ar')
    expect(store.getState().language).toBe('ar')
    expect(env.root).toEqual({ lang: 'ar', dir: 'rtl' })
  })

  it('follows the browser when nothing is saved, or the saved value is not a setting', () => {
    expect(createLanguageStore(environment(undefined, ['en', 'ar'], ['ar-EG'])).getState()).toMatchObject({ setting: 'auto', language: 'ar' })
    expect(createLanguageStore(environment('klingon', ['en', 'ar'], ['en'])).getState()).toMatchObject({ setting: 'auto', language: 'en' })
  })

  it('changes language live, saving the setting and updating lang and dir, with no reload', () => {
    const env = environment()
    const store = createLanguageStore(env)
    expect(env.root).toEqual({ lang: 'en', dir: 'ltr' })
    store.getState().setSetting('ar')
    expect(store.getState().language).toBe('ar')
    expect(env.root).toEqual({ lang: 'ar', dir: 'rtl' })
    expect(env.values.get(LANGUAGE_KEY)).toBe('ar')
    store.getState().setSetting('en')
    expect(env.root).toEqual({ lang: 'en', dir: 'ltr' })
    expect(env.values.get(LANGUAGE_KEY)).toBe('en')
  })

  it('still works in a browser where storage refuses to read or write', () => {
    const root = { lang: '', dir: '' }
    const refuses = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const store = createLanguageStore({ available: ['en', 'ar'], storage: refuses, browserLanguages: ['en'], root })
    expect(store.getState().setting).toBe('auto')
    store.getState().setSetting('ar')
    expect(store.getState().language).toBe('ar')
    expect(root).toEqual({ lang: 'ar', dir: 'rtl' })
  })

  it('is not part of the saved Tree or a backup', () => {
    const env = environment()
    createLanguageStore(env).getState().setSetting('ar')
    const document = serializeDocument(generateTree(5, 1))
    expect(document).not.toContain('language')
    expect(document).not.toContain(LANGUAGE_KEY)
  })

  it('does not keep a language that is not available: it is treated as auto, so it cannot switch on by itself later', () => {
    const saved = environment('ar', ['en'], ['ar'])
    expect(createLanguageStore(saved).getState()).toMatchObject({ setting: 'auto', language: 'en' })

    const env = environment(undefined, ['en'], ['ar'])
    const store = createLanguageStore(env)
    store.getState().setSetting('ar')
    expect(store.getState().setting).toBe('auto')
    expect(env.values.get(LANGUAGE_KEY)).toBe('auto')
  })

  it('follows a change made in another tab, without saving it again', () => {
    const env = environment()
    const store = createLanguageStore(env)
    env.changeInAnotherTab('ar')
    expect(store.getState()).toMatchObject({ setting: 'ar', language: 'ar' })
    expect(env.root).toEqual({ lang: 'ar', dir: 'rtl' })
    expect(env.values.has(LANGUAGE_KEY)).toBe(false)
    env.changeInAnotherTab('klingon')
    expect(store.getState().setting).toBe('ar')
    env.changeInAnotherTab(null)
    expect(store.getState()).toMatchObject({ setting: 'auto', language: 'en' })
  })
})
