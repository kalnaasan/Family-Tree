import type { Language } from './language.ts'

export type Params = Record<string, string | number>

/** One text per plural form, chosen from `count` with `Intl.PluralRules`. English needs `one` and `other`; Arabic all six. */
export interface Plural {
  zero?: string
  one?: string
  two?: string
  few?: string
  many?: string
  other: string
}

export type Message = string | Plural

/**
 * English is complete; another language may lack a key at run time (the type check of the real dictionaries
 * makes that impossible there), and then the English text is shown.
 */
export type Dictionaries<K extends string> = { en: Record<K, Message> } & Partial<
  Record<Language, Partial<Record<K, Message>>>
>

/** Making an `Intl.PluralRules` is slow, and a list can ask for hundreds of plurals. */
const pluralRules = new Map<string, Intl.PluralRules>()
function pluralRulesFor(language: string): Intl.PluralRules {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(language)
    pluralRules.set(language, rules)
  }
  return rules
}

/** Text for a key in one language (spec section 13.1). */
export function createTranslator<K extends string>(language: Language, dictionaries: Dictionaries<K>) {
  return (key: K, params: Params = {}): string => {
    const own = dictionaries[language]?.[key]
    const message = own ?? dictionaries.en[key]
    let text: string
    if (typeof message === 'string') {
      text = message
    } else {
      // a plural message with no number would quietly pick "other" and read "1 people": a mistake in the caller
      if (typeof params.count !== 'number' || Number.isNaN(params.count)) {
        throw new Error(`The plural message "${key}" needs a numeric count`)
      }
      text = message[pluralRulesFor(own === undefined ? 'en' : language).select(params.count)] ?? message.other
    }
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder))
  }
}
