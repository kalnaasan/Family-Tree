import { describe, expect, it } from 'vitest'
import { displayName, hashId, initialOf, lifeSpan, personAriaLabel } from './text.ts'

describe('personAriaLabel', () => {
  const maria = { firstName: 'Maria', lastName: 'Keller', birthDate: '1962-04-17', deceased: false }

  it('reads like "Maria Keller, mother, born 1962"', () => {
    expect(personAriaLabel(maria, 'mother', false)).toBe('Maria Keller, mother, born 1962')
  })
  it('names the Focus person as such, who has no Relationship label', () => {
    expect(personAriaLabel(maria, null, true)).toBe('Maria Keller, Focus person, born 1962')
  })
  it('leaves out what is not known', () => {
    expect(personAriaLabel({ firstName: 'Maria', deceased: false }, null, false)).toBe('Maria')
    expect(personAriaLabel({ firstName: 'Maria', deceased: false }, 'Relative', false)).toBe('Maria, Relative')
  })
  it('says when they died, or only that they are deceased', () => {
    expect(personAriaLabel({ ...maria, deathDate: '2001-09', deceased: true }, 'mother', false)).toBe(
      'Maria Keller, mother, born 1962, died 2001',
    )
    expect(personAriaLabel({ firstName: 'Maria', deathDate: '2001', deceased: true }, null, false)).toBe('Maria, died 2001')
    expect(personAriaLabel({ firstName: 'Maria', deceased: true }, null, false)).toBe('Maria, deceased')
  })
  it('uses the whole name, not the shortened one drawn in the tree', () => {
    const long = { firstName: 'Maximiliana-Theodora', lastName: 'von Hohenzollern', deceased: false }
    expect(personAriaLabel(long, null, false)).toBe('Maximiliana-Theodora von Hohenzollern')
  })
})

describe('displayName', () => {
  it('joins first and last name', () => {
    expect(displayName({ firstName: 'Maria', lastName: 'Keller' })).toBe('Maria Keller')
  })
  it('works without a last name', () => {
    expect(displayName({ firstName: 'Maria' })).toBe('Maria')
  })
  it('shortens a long name with an ellipsis', () => {
    const name = displayName({ firstName: 'Maximiliana-Theodora', lastName: 'von Hohenzollern' })
    expect(Array.from(name)).toHaveLength(18)
    expect(name.endsWith('…')).toBe(true)
  })
  it('does not cut a character in half', () => {
    const name = displayName({ firstName: '😀'.repeat(30) })
    expect(Array.from(name)).toHaveLength(18)
  })
})

describe('initialOf', () => {
  it('is the upper-cased first letter', () => {
    expect(initialOf({ firstName: 'maria' })).toBe('M')
    expect(initialOf({ firstName: 'élodie' })).toBe('É')
  })
  it('does not break on a surrogate pair', () => {
    expect(initialOf({ firstName: '😀 smile' })).toBe('😀')
  })
  it('has a fallback for a blank name', () => {
    expect(initialOf({ firstName: '  ' })).toBe('?')
  })
})

describe('lifeSpan', () => {
  it.each([
    [{}, ''],
    [{ birthDate: '1962' }, '1962'],
    [{ birthDate: '1962-04' }, '1962'],
    [{ birthDate: '1962-04-17' }, '1962'],
    [{ birthDate: '1930', deathDate: '2001-09' }, '1930–2001'],
    [{ deathDate: '2001' }, 'd. 2001'],
  ])('%j gives "%s"', (person, expected) => {
    expect(lifeSpan(person)).toBe(expected)
  })
})

describe('hashId', () => {
  it('is stable and spreads different ids', () => {
    expect(hashId('abc')).toBe(hashId('abc'))
    expect(hashId('abc')).not.toBe(hashId('abd'))
  })
})
