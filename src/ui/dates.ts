import { formatDateTime } from '../i18n/format.ts'
import type { Language } from '../i18n/language.ts'

/** "Mar 5, 2026, 2:30 PM" in the Language and the reader's own time zone. */
export function formatWhen(iso: string, language: Language): string {
  return formatDateTime(iso, language) ?? 'an unknown date'
}
