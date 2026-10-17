import type { Person } from './schema.ts'

/** Letters that do not decompose into a base letter and an accent, with the plain letters people type for them. */
const PLAIN: Record<string, string> = { ß: 'ss', ø: 'o', æ: 'ae', œ: 'oe', đ: 'd', ł: 'l', ı: 'i' }

/**
 * Arabic letters that people write several ways and that decomposition does not already fold: alef wasla, alef
 * maqsura, ta marbuta, and the Persian kaf and ya typed on a Persian keyboard. Tatweel (a stretching line) is
 * dropped. The alefs with hamza or madda, and the hamza seats on waw and ya, are already plain letters once the
 * combining marks are taken off, as are the short vowels and shadda.
 */
const ARABIC: Record<string, string> = { ٱ: 'ا', ى: 'ي', ة: 'ه', ک: 'ك', ی: 'ي', ـ: '' }

/**
 * Lower case with the accents taken off, so "Élodie", "elodie" and "ELODIE" are the same word, and "Müller" is
 * "muller"; Arabic letters are folded the same way, so "أحمد" and "احمد", or "فاطمة" and "فاطمه", are the same word.
 * No transliteration: a Latin query never matches an Arabic name.
 */
export function normalizeName(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[ßøæœđłı]/g, (letter) => PLAIN[letter]!)
    .replace(/[ٱىةکیـ]/g, (letter) => ARABIC[letter]!)
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * A normalised name word without its Arabic article "ال" ("الحسن" → "حسن"), for ranking and for initials. The
 * article is not taken off a word that is just the article, or the article and one letter: that is not a word.
 */
export function withoutArticle(word: string): string {
  return word.startsWith('ال') && Array.from(word).length >= 4 ? word.slice(2) : word
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
    const startsWord = (w: string) => nameWords.some((n) => n.startsWith(w) || withoutArticle(n).startsWith(w))
    const rank = full.startsWith(typed) ? 0 : words.every(startsWord) ? 1 : 2
    ranked.push({ person, rank, order })
  })
  return ranked.sort((a, b) => a.rank - b.rank || a.order - b.order).map((r) => r.person)
}
