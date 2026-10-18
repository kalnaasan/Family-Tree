import type { Person } from '../domain/schema.ts'
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
  const word = letters(person.firstName.trim().split(/\s+/)[0] ?? '').filter((letter) => letter !== TATWEEL)
  return (word[hasArticle(word) ? 2 : 0] ?? word[0] ?? '?').toUpperCase()
}

const TATWEEL = 'ـ'
/** The first code point of a letter: its base, without the vowel marks that follow it. */
const baseOf = (letter: string | undefined) => (letter === undefined ? '' : String.fromCodePoint(letter.codePointAt(0)!))

/**
 * Whether the first word (as letters, without tatweel) starts with the article "ال": a plain alef (or alef wasla) and
 * a lam, and at least two letters after them. Read from the written letters, not the search-normalised ones: there
 * "أ" and "إ" lose their hamza, so a name like "ألين" or "إلياس" would look like it had the article, and it has not.
 */
function hasArticle(word: readonly string[]): boolean {
  return (baseOf(word[0]) === 'ا' || baseOf(word[0]) === 'ٱ') && baseOf(word[1]) === 'ل' && word.length >= 4
}

/** Scripts written from right to left. A presentation form of Arabic letters is in the Arabic script too. */
const RIGHT_TO_LEFT =
  /[\p{Script=Arabic}\p{Script=Hebrew}\p{Script=Thaana}\p{Script=Syriac}\p{Script=Nko}\p{Script=Adlam}\p{Script=Samaritan}\p{Script=Mandaic}\p{Script=Hanifi_Rohingya}\p{Script=Mende_Kikakui}]/u
const LETTER = /\p{L}/u

/** The direction a name reads, from the first letter that has one: not the page's, because the name is the Person's own. */
export function directionOf(text: string): 'ltr' | 'rtl' {
  for (const character of text) {
    if (RIGHT_TO_LEFT.test(character)) return 'rtl'
    if (LETTER.test(character)) return 'ltr'
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
