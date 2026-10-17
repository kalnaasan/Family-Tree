import { describe, expect, it } from 'vitest'
import { ar, en } from './messages.ts'

const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

describe('the dictionaries', () => {
  it('have no Arabic key that English lacks', () => {
    const english = new Set(Object.keys(en))
    expect(Object.keys(ar).filter((key) => !english.has(key))).toEqual([])
  })

  // The Arabic dictionary is written by "Arabic interface text". Until then Arabic may lack keys (English is shown);
  // that ticket makes this file demand identical keys again, and types Arabic as complete.

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
