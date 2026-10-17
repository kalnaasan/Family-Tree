import { describe, expect, it } from 'vitest'
import { normalizeName, searchPersons } from './search.ts'

const person = (firstName: string, lastName?: string) => ({ firstName, ...(lastName ? { lastName } : {}) })
const names = (found: { firstName: string; lastName?: string }[]) => found.map((p) => [p.firstName, p.lastName].filter(Boolean).join(' '))

describe('normalizeName', () => {
  it('ignores case and accents', () => {
    expect(normalizeName('Élodie')).toBe('elodie')
    expect(normalizeName('ÉLODIE')).toBe('elodie')
    expect(normalizeName('Müller')).toBe('muller')
    expect(normalizeName('Søren Ægir')).toBe('soren aegir')
    expect(normalizeName('Straße')).toBe('strasse')
    expect(normalizeName('Łukasz Đorđe')).toBe('lukasz dorde')
  })

  it('treats a letter plus a combining accent like the precomposed letter', () => {
    expect(normalizeName('José')).toBe(normalizeName('José'))
  })

  it('collapses runs of spaces', () => {
    expect(normalizeName('  Anna   Maria ')).toBe('anna maria')
  })
})

describe('searchPersons', () => {
  const people = [
    person('Maria', 'Keller'),
    person('José', 'Álvarez'),
    person('Karl', 'Keller'),
    person('Anna', 'Müller'),
    person('Kelly'),
    person('Maria Elena', 'Ruiz'),
  ]

  it('finds a first or a last name', () => {
    expect(names(searchPersons(people, 'karl'))).toEqual(['Karl Keller'])
    expect(names(searchPersons(people, 'ruiz'))).toEqual(['Maria Elena Ruiz'])
  })

  it('matches without regard to case or accents, in either direction', () => {
    expect(names(searchPersons(people, 'JOSE'))).toEqual(['José Álvarez'])
    expect(names(searchPersons(people, 'josé'))).toEqual(['José Álvarez'])
    expect(names(searchPersons(people, 'alvarez'))).toEqual(['José Álvarez'])
    expect(names(searchPersons(people, 'MULLER'))).toEqual(['Anna Müller'])
    expect(names(searchPersons(people, 'müller'))).toEqual(['Anna Müller'])
  })

  it('needs every typed word, in any order', () => {
    expect(names(searchPersons(people, 'keller maria'))).toEqual(['Maria Keller'])
    expect(names(searchPersons(people, 'maria zzz'))).toEqual([])
  })

  it('matches inside a name, ranking where the name starts with the typed text first', () => {
    // "kel": the whole name Kelly starts with it, ahead of two last names that do; "ell" starts no word at all
    expect(names(searchPersons(people, 'kel'))).toEqual(['Kelly', 'Maria Keller', 'Karl Keller'])
    expect(names(searchPersons(people, 'ell'))).toEqual(['Maria Keller', 'Karl Keller', 'Kelly'])
    // "ar" starts no word here (alvarez has it in the middle), so all four are the same rank and keep the order added
    expect(names(searchPersons(people, 'ar'))).toEqual(['Maria Keller', 'José Álvarez', 'Karl Keller', 'Maria Elena Ruiz'])
  })

  it('puts a name that starts with the text before one that only has a word starting with it', () => {
    expect(names(searchPersons([person('Anna', 'Keller'), person('Keller', 'Zoe')], 'keller'))).toEqual(['Keller Zoe', 'Anna Keller'])
  })

  it('an empty or blank query matches nobody', () => {
    expect(searchPersons(people, '')).toEqual([])
    expect(searchPersons(people, '   ')).toEqual([])
  })

  it('keeps the order the Persons were added within a rank', () => {
    const same = [person('Eva', 'Berg'), person('Eve', 'Berg'), person('Eva', 'Berger')]
    expect(names(searchPersons(same, 'berg'))).toEqual(['Eva Berg', 'Eve Berg', 'Eva Berger'])
  })
})

describe('Arabic names', () => {
  it.each([
    ['أحمد', 'احمد'], // alef with hamza above
    ['إبراهيم', 'ابراهيم'], // alef with hamza below
    ['آمنة', 'امنه'], // alef with madda, and ta marbuta
    ['ٱبن', 'ابن'], // alef wasla
    ['فاطمة', 'فاطمه'], // ta marbuta
    ['على', 'علي'], // alef maqsura
    ['مؤمن', 'مومن'], // hamza on waw
    ['عائشة', 'عايشه'], // hamza on ya, and ta marbuta
    ['كريـــم', 'كريم'], // tatweel
    ['مُحَمَّد', 'محمد'], // short vowels and shadda
    ['کریم', 'كريم'], // Persian kaf and ya
    ['ﻣﺤﻤﺪ', 'محمد'], // presentation forms, as pasted from a PDF
    ['ﻻ', 'لا'], // the lam-alef ligature
  ])('folds %s to %s', (typed, folded) => {
    expect(normalizeName(typed)).toBe(folded)
  })

  it('finds a name whichever way its letters were typed', () => {
    const people = [person('أحمد'), person('فاطمة'), person('عائشة')]
    expect(names(searchPersons(people, 'احمد'))).toEqual(['أحمد'])
    expect(names(searchPersons(people, 'فاطمه'))).toEqual(['فاطمة'])
    expect(names(searchPersons(people, 'عايشة'))).toEqual(['عائشة'])
  })

  it('never finds an Arabic name from Latin letters, or the reverse (no transliteration)', () => {
    expect(searchPersons([person('محمد')], 'mohammed')).toEqual([])
    expect(searchPersons([person('Maria')], 'مريم')).toEqual([])
    // a Person who needs both has both: each part is searched in the script it is written in
    const both = [person('محمد', 'Smith')]
    expect(searchPersons(both, 'smith')).toHaveLength(1)
    expect(searchPersons(both, 'محمد')).toHaveLength(1)
  })

  describe('the article "ال"', () => {
    it('is ignored for ranking: a name word that starts with it counts as starting with what follows', () => {
      // "بحسن" holds حسن in the middle; "الحسن" is the article plus حسن, so it comes first although added later
      const people = [person('بحسن'), person('الحسن')]
      expect(names(searchPersons(people, 'حسن'))).toEqual(['الحسن', 'بحسن'])
    })

    it('still matches when the article is typed', () => {
      const people = [person('بحسن'), person('الحسن')]
      expect(names(searchPersons(people, 'الحسن'))).toEqual(['الحسن'])
    })

    it('is not taken off a word that is just the article, or the article and one letter', () => {
      // "الف" is ال + ف: one letter is not a word on its own, so ف in it is only a containing match
      const people = [person('بف'), person('الف')]
      expect(names(searchPersons(people, 'ف'))).toEqual(['بف', 'الف'])
    })

    it('matches both ways: typing the article finds a name stored without it, and the reverse', () => {
      expect(names(searchPersons([person('حسن')], 'الحسن'))).toEqual(['حسن'])
      expect(names(searchPersons([person('الأحمد')], 'احمد'))).toEqual(['الأحمد'])
      expect(names(searchPersons([person('حسن'), person('الحسن')], 'الحسن'))).toEqual(['الحسن', 'حسن'])
    })

    it('does not change the stored name', () => {
      expect(normalizeName('الحسن')).toBe('الحسن')
    })
  })
})
