import { describe, expect, it } from 'vitest'
import { ARABIC_PENDING, ar, en } from './messages.ts'

const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

describe('the dictionaries', () => {
  it('have no Arabic key that English lacks', () => {
    const english = new Set(Object.keys(en))
    expect(Object.keys(ar).filter((key) => !english.has(key))).toEqual([])
  })

  // The Arabic dictionary is written by "Arabic interface text". Until then the keys it still lacks are listed in
  // ARABIC_PENDING (English is shown for them); the list must be exactly what is missing, so a new key cannot be left
  // out of Arabic unnoticed, and the list shrinks to nothing as the Arabic is written.
  it('list exactly the Arabic keys that are still missing', () => {
    const missing = Object.keys(en).filter((key) => !(key in ar))
    expect([...ARABIC_PENDING].sort()).toEqual(missing.sort())
  })

  it('give every Arabic plural message all six forms, and say which key is wrong when one is missing', () => {
    for (const [key, message] of Object.entries(ar)) {
      if (typeof message === 'string') continue
      expect(Object.keys(message).sort(), key).toEqual([...PLURAL_FORMS].sort())
    }
  })

  it('have a plural message in Arabic exactly where English has one', () => {
    for (const [key, message] of Object.entries(ar)) {
      expect(typeof message, key).toBe(typeof (en as Record<string, unknown>)[key])
    }
  })
})
