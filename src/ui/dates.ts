import { useCallback } from 'react'
import { formatDateTime } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { useT } from '../i18n/useT.ts'

/** "Mar 5, 2026, 2:30 PM" in the Language and the reader's own time zone; "an unknown date" if it is not a date. */
export function useWhen(): (iso: string) => string {
  const language = useLanguageStore((s) => s.language)
  const t = useT()
  return useCallback((iso) => formatDateTime(iso, language) ?? t('date.unknown'), [language, t])
}
