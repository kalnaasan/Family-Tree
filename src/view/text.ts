import type { Person } from '../domain/schema.ts'
import { normalizeName, withoutArticle } from '../domain/search.ts'
import { formatList } from '../i18n/format.ts'
import type { Language } from '../i18n/languageType.ts'
import type { Translate } from '../i18n/messageRef.ts'

const MAX_NAME_LENGTH = 18

let segmenter: Intl.Segmenter | undefined

/**
 * The letters of a text as a reader counts them: a letter with its accent or vowel marks is one ("مُ" is two code
 * points and one letter), an emoji is one. Cutting between them would leave a mark with nothing to sit on.
 */
function letters(text: string): string[] {
  segmenter ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  return Array.from(segmenter.segment(text), (part) => part.segment)
}

/** "First Last", shortened at whole letters with an ellipsis so a long name cannot overlap its neighbours. */
export function displayName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  const parts = letters(full)
  return parts.length <= MAX_NAME_LENGTH ? full : `${parts.slice(0, MAX_NAME_LENGTH - 1).join('').trimEnd()}…`
}

/**
 * The first letter of the first name for the medallion, in capitals where the script has them. A leading Arabic
 * article "ال" is skipped when more letters follow, so "الحسن" shows "ح" and not the "ا" every such name would share.
 */
export function initialOf(person: Pick<Person, 'firstName'>): string {
  const name = person.firstName.trim()
  const parts = letters(name)
  const firstWord = normalizeName(name.split(/\s+/)[0] ?? '')
  const skip = withoutArticle(firstWord) !== firstWord ? 2 : 0
  return (parts[skip] ?? parts[0] ?? '?').toUpperCase()
}

/** The direction a name reads, from the first letter that has one: not the page's, because the name is the Person's own. */
export function directionOf(text: string): 'ltr' | 'rtl' {
  for (const character of text) {
    if (/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(character)) return 'rtl'
    if (/\p{L}/u.test(character)) return 'ltr'
  }
  return 'ltr'
}

/** Years only, from partial ISO dates: "1962", "1930–2001", "d. 2001" ("ت. 2001"). Empty when nothing is known. */
export function lifeSpan(person: Pick<Person, 'birthDate' | 'deathDate'>, t: Translate): string {
  const birth = person.birthDate?.slice(0, 4)
  const death = person.deathDate?.slice(0, 4)
  if (birth && death) return `${birth}–${death}`
  if (death) return t('life.died', { year: death })
  return birth ?? ''
}

/** The words a sentence is made of: the translator and the Language it speaks (for the list separators). */
export interface Words {
  t: Translate
  language: Language
}

/**
 * What a screen reader says for a Person: "Maria Keller, mother, born 1962" (spec section 7). The Focus person has
 * no Relationship label, so they are named as such. Full name, not the shortened one drawn in the tree.
 */
export function personAriaLabel(
  person: Pick<Person, 'firstName' | 'lastName' | 'birthDate' | 'deathDate' | 'deceased'>,
  relationship: string | null,
  isFocus: boolean,
  { t, language }: Words,
): string {
  const birth = person.birthDate?.slice(0, 4)
  const death = person.deathDate?.slice(0, 4)
  const dates =
    birth || death
      ? [birth && t('person.born', { year: birth }), death && t('person.died', { year: death })]
      : [person.deceased && t('person.deceased')]
  return formatList(
    [
      [person.firstName, person.lastName].filter(Boolean).join(' '),
      isFocus ? t('person.focus') : relationship,
      ...dates,
    ].filter((part): part is string => Boolean(part)),
    language,
  )
}

/** A stable 32-bit hash of an id, used to give each Person their own leaves. */
export function hashId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return hash >>> 0
}
