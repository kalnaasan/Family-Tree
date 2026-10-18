import { test as base } from '@playwright/test'
import type { Language } from '../src/i18n/languageType.ts'
import { LANGUAGE_KEY } from '../src/i18n/language.ts'
import { type MessageParam, msg, renderMessage } from '../src/i18n/messageRef.ts'
import { DICTIONARIES, type MessageKey } from '../src/i18n/messages.ts'
import { createTranslator } from '../src/i18n/translate.ts'

export { expect } from '@playwright/test'

interface Options {
  /** The Language the page is opened in: English unless a project says Arabic (spec section 13.7). */
  language: Language
}

/** The Language of the running test's project. */
export const languageOfProject = (): Language =>
  ((test.info().project.use as Partial<Options>).language ?? 'en') as Language

const translators = new Map<Language, ReturnType<typeof createTranslator<MessageKey>>>()

/**
 * The words of a message in the running project's Language, from the same dictionary the app uses, so one spec
 * serves both languages. A parameter may be another message: `msg('step.addRelation', { relation: msg('relation.sister') })`.
 */
export function words(key: MessageKey, params?: Record<string, MessageParam>): string {
  const language = languageOfProject()
  let translate = translators.get(language)
  if (!translate) {
    translate = createTranslator<MessageKey>(language, DICTIONARIES)
    translators.set(language, translate)
  }
  return renderMessage(translate, msg(key, params))
}

export { msg }

/** A pattern for text that starts with `text` (a toast whose message goes on after the part a test knows). */
export const startingWith = (text: string) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)

/**
 * `test` for specs that run in both languages. In an Arabic project the page is opened with `family-tree.language`
 * set to Arabic and Arabic offered (the released list is English only; the page reads `__familyTreeLanguages`
 * before anything else), so one spec serves both languages and finds controls through `t`.
 */
export const test = base.extend<Options>({
  language: ['en', { option: true }],
  page: async ({ page, language }, provide) => {
    if (language !== 'en') {
      await page.addInitScript(
        ([key, value]) => {
          ;(globalThis as { __familyTreeLanguages?: string[] }).__familyTreeLanguages = ['en', 'ar']
          try {
            localStorage.setItem(key!, value!)
          } catch {
            // storage refused: the page then opens in English and the test says so
          }
        },
        [LANGUAGE_KEY, language],
      )
    }
    await provide(page)
  },
})

/** Items of a sentence the way the app joins them: "a, b" in English, "a، b" in Arabic (`formatList` in plain mode). */
export const joined = (...items: string[]) => items.join(languageOfProject() === 'ar' ? '، ' : ', ')

/** The arrow keys by where they point on the page: a page that reads right to left swaps them (spec section 13.2). */
export const arrowTowardEnd = () => (languageOfProject() === 'ar' ? 'ArrowLeft' : 'ArrowRight')
export const arrowTowardStart = () => (languageOfProject() === 'ar' ? 'ArrowRight' : 'ArrowLeft')
