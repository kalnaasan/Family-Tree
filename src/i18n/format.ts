import type { Language } from './language.ts'

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
