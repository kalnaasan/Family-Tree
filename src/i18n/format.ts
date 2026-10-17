import type { Language } from './languageType.ts'

/**
 * Western digits and the Gregorian calendar in every language, whatever the browser's region: `ar-EG` would give
 * Arabic-Indic digits, and some engines give a Hijri calendar for `ar-SA` (spec section 13.5).
 */
const localeOf = (language: Language) => `${language}-u-ca-gregory-nu-latn`

// making an Intl formatter is slow, and a list of Snapshots formats many dates on every draw
const dateFormats = new Map<string, Intl.DateTimeFormat>()
const numberFormats = new Map<string, Intl.NumberFormat>()

function dateFormat(language: Language, timeZone: string | undefined): Intl.DateTimeFormat {
  const id = `${language}|${timeZone ?? ''}`
  let format = dateFormats.get(id)
  if (!format) {
    format = new Intl.DateTimeFormat(localeOf(language), { dateStyle: 'medium', timeStyle: 'short', timeZone })
    dateFormats.set(id, format)
  }
  return format
}

/** "Mar 5, 2026, 2:30 PM" in the Language and the reader's own time zone (or `timeZone`); null for something that is not a date. */
export function formatDateTime(iso: string, language: Language, timeZone?: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return dateFormat(language, timeZone).format(date)
}

export function formatNumber(value: number, language: Language): string {
  let format = numberFormats.get(language)
  if (!format) {
    format = new Intl.NumberFormat(localeOf(language))
    numberFormats.set(language, format)
  }
  return format.format(value)
}

const conjunctions = new Map<Language, Intl.ListFormat>()

/** What separates the parts of a plain list. */
const SEPARATOR: Record<Language, string> = { en: ', ', ar: '، ' }

/**
 * "Ana, Ben, Cy": the parts joined with the separator of the Language (Arabic writes "،"). With `'and'` the last two
 * are joined by the Language's own word for it ("a and b"; Arabic "و"). A plain list never gets an "and" of its own,
 * because `Intl.ListFormat` would put one before every part in Arabic.
 */
export function formatList(items: readonly string[], language: Language, join: 'plain' | 'and' = 'plain'): string {
  if (join === 'plain') return items.join(SEPARATOR[language])
  let format = conjunctions.get(language)
  if (!format) {
    format = new Intl.ListFormat(language, { type: 'conjunction', style: 'long' })
    conjunctions.set(language, format)
  }
  return format.format(items)
}

/** "Father" from "father"; text in a script without case (Arabic) comes back unchanged. */
export function capitalise(text: string): string {
  const [first = '', ...rest] = Array.from(text)
  return first.toLocaleUpperCase() + rest.join('')
}

/**
 * Text that keeps its own direction inside a sentence of the other one: an English rule name (`not-json`) in an
 * Arabic sentence would otherwise pull the punctuation around it into the wrong place. Invisible in English.
 */
export const isolate = (text: string): string => `⁨${text}⁩`
