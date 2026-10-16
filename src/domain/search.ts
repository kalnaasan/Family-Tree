import type { Person } from './schema.ts'

/** Letters that do not decompose into a base letter and an accent, with the plain letters people type for them. */
const PLAIN: Record<string, string> = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd', ł: 'l', ı: 'i' }

/** Lower case with the accents taken off, so "Élodie", "elodie" and "ELODIE" are the same word, and "Müller" is "muller". */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßøæœđłı]/g, (letter) => PLAIN[letter]!)
    .replace(/\s+/g, ' ')
    .trim()
}

const fullNameOf = (person: Pick<Person, 'firstName' | 'lastName'>) =>
  normalizeName([person.firstName, person.lastName].filter(Boolean).join(' '))

/**
 * The Persons whose first or last name contains every word of `query` (spec section 11), best matches first: names
 * that start with what was typed, then names where each typed word starts a word, then any other containing match.
 * Within a rank, the order the Persons were added. An empty query matches nobody.
 */
export function searchPersons<T extends Pick<Person, 'firstName' | 'lastName'>>(persons: readonly T[], query: string): T[] {
  const typed = normalizeName(query)
  if (!typed) return []
  const words = typed.split(' ')
  const ranked: { person: T; rank: number; order: number }[] = []
  persons.forEach((person, order) => {
    const full = fullNameOf(person)
    if (!words.every((word) => full.includes(word))) return
    const nameWords = full.split(' ')
    const rank = full.startsWith(typed) ? 0 : words.every((w) => nameWords.some((n) => n.startsWith(w))) ? 1 : 2
    ranked.push({ person, rank, order })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((r) => r.person)
}
