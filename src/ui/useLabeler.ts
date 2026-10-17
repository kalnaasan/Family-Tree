import { useCallback } from 'react'
import { type Relationship, labelFor } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { useLanguageStore } from '../i18n/language.ts'

/**
 * The Relationship label of a Person in the language in use, or null (the Focus person, or nobody known). The
 * derivation hands out descriptors only; the words are made here, when they are drawn, so a language switch
 * redraws them without deriving the Tree again.
 */
export function useLabeler(relationships: ReadonlyMap<string, Relationship> | null) {
  const language = useLanguageStore((s) => s.language)
  return useCallback(
    (person: Pick<Person, 'id' | 'gender'>): string | null => {
      const relationship = relationships?.get(person.id)
      return relationship ? labelFor(relationship.descriptor, person.gender, language) : null
    },
    [relationships, language],
  )
}
