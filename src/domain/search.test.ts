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
