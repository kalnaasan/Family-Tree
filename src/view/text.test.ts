import { describe, expect, it } from 'vitest'
import { displayName, hashId, initialOf, lifeSpan } from './text.ts'

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
