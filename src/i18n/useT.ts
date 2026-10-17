import { useMemo } from 'react'
import { type LanguageStore, useLanguageStore } from './language.ts'
import { DICTIONARIES, type MessageKey } from './messages.ts'
import { createTranslator } from './translate.ts'

/** `t('key', {params})` in the current Language; a component using it redraws when the Language changes. */
export function useT(store: LanguageStore = useLanguageStore) {
  const language = store((s) => s.language)
  return useMemo(() => createTranslator<MessageKey>(language, DICTIONARIES), [language])
}
