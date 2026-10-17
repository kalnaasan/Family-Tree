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

/** Text for a key in one language (spec section 13.1). */
export function createTranslator<K extends string>(language: Language, dictionaries: Dictionaries<K>) {
  return (key: K, params: Params = {}): string => {
    const own = dictionaries[language]?.[key]
    const message = own ?? dictionaries.en[key]
    const text =
      typeof message === 'string'
        ? message
        : (message[new Intl.PluralRules(own === undefined ? 'en' : language).select(Number(params.count))] ?? message.other)
    return text.replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder))
  }
}
