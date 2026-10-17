import { useCallback } from 'react'
import { type Relationship, labelFor } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { type LanguageStore, useLanguageStore } from '../i18n/language.ts'

/**
 * The Relationship label of a Person in the language in use, or null (the Focus person, or nobody known). The
 * derivation hands out descriptors only; the words are made here, when they are drawn, so a language switch
 * redraws them without deriving the Tree again. The function is the same until the descriptors or the language
 * change, so a memoised list is drawn again only when it must be.
 */
export function useLabeler(
  relationships: ReadonlyMap<string, Relationship> | null,
  store: LanguageStore = useLanguageStore,
) {
  const language = store((s) => s.language)
  return useCallback(
    (person: Pick<Person, 'id' | 'gender'>): string | null => {
      const relationship = relationships?.get(person.id)
      return relationship ? labelFor(relationship.descriptor, person.gender, language) : null
    },
    [relationships, language],
  )
}
