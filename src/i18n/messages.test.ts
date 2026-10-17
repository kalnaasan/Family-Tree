import { describe, expect, it } from 'vitest'
import { ar, en } from './messages.ts'

const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

describe('the dictionaries', () => {
  it('have the same keys in English and Arabic', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort())
  })

  it('give every Arabic plural message all six forms, and say which key is wrong when one is missing', () => {
    for (const [key, message] of Object.entries(ar)) {
      if (typeof message === 'string') continue
      expect(Object.keys(message).sort(), key).toEqual([...PLURAL_FORMS].sort())
    }
  })

  it('have a plural message in Arabic exactly where English has one', () => {
    for (const [key, message] of Object.entries(en)) {
      expect(typeof (ar as Record<string, unknown>)[key], key).toBe(typeof message)
    }
  })
})
