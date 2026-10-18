import { describe, expect, it } from 'vitest'
import { ar, en } from './messages.ts'

const PLURAL_FORMS = ['zero', 'one', 'two', 'few', 'many', 'other']

type Message = string | Record<string, string | undefined>
const texts = (message: Message): string[] => (typeof message === 'string' ? [message] : Object.values(message).filter((text): text is string => text !== undefined))
const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]!))
const union = (message: Message) => new Set(texts(message).flatMap((text) => [...placeholders(text)]))

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
    for (const [key, message] of Object.entries(ar)) {
      expect(typeof message, key).toBe(typeof (en as Record<string, unknown>)[key])
    }
  })

  it('use in each Arabic text only the placeholders of the English one, and keep every one of them but the count', () => {
    for (const [key, english] of Object.entries(en) as [string, Message][]) {
      const arabic = (ar as Record<string, Message>)[key]!
      const allowed = union(english)
      const required = new Set([...allowed].filter((name) => name !== 'count'))
      for (const text of texts(arabic)) {
        const used = placeholders(text)
        expect([...used].filter((name) => !allowed.has(name)), `${key}: ${text}`).toEqual([])
        // a plural form may leave out {count} ("شخص واحد"), but nothing else a sentence needs
        expect([...required].filter((name) => !used.has(name)), `${key}: ${text}`).toEqual([])
      }
    }
  })

  it('have no Arabic text that is still the English one, apart from what is written the same way in both', () => {
    const SAME = new Set(['fields.datePlaceholder', 'restore.line', 'restore.reasonNote', 'backup.confirm', 'backup.savedAndMissing', 'panel.addButton'])
    for (const [key, english] of Object.entries(en) as [string, Message][]) {
      if (SAME.has(key)) continue
      const arabic = (ar as Record<string, Message>)[key]!
      expect(texts(arabic).some((text) => /[A-Za-z]{4,}/.test(text.replace(/\{\w+\}/g, '')) && texts(english).includes(text)), key).toBe(false)
    }
  })

  it('write every Arabic text in Arabic: a letter outside the Arabic script is only a format, a key name or a unit', () => {
    // formats and key names (YYYY-MM-DD, the P and F keys, HEIC, JPEG, PNG, WebP, Enter, Home, Shift) may stay in Latin letters
    const ALLOWED = /^(?:YYYY|MM|DD|P|F|Enter|Home|Shift|HEIC|JPEG|PNG|WebP|[-+ ,.:;()0-9])*$/
    for (const [key, message] of Object.entries(ar) as [string, Message][]) {
      for (const text of texts(message)) {
        const latin = text.replace(/\{\w+\}/g, '').match(/[A-Za-z]+/g) ?? []
        for (const word of latin) expect(ALLOWED.test(word), `${key}: "${word}" in ${text}`).toBe(true)
      }
    }
  })
})
