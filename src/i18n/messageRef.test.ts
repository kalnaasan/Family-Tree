import { describe, expect, it } from 'vitest'
import { msg, renderMessage } from './messageRef.ts'
import type { MessageKey } from './messages.ts'

/** A translator over a few made-up keys, so the test does not depend on the real dictionary. */
const texts: Record<string, string> = {
  hello: 'Hello',
  greet: 'Hello, {name}',
  undid: 'Undid: {what}',
  delete: 'Delete {name}',
}
const t = (key: MessageKey, params: Record<string, string | number> = {}) =>
  (texts[key] ?? key).replace(/\{(\w+)\}/g, (placeholder, name: string) => (name in params ? String(params[name]) : placeholder))
const key = (name: string) => name as MessageKey

describe('message references', () => {
  it('renders a key, with its parameters', () => {
    expect(renderMessage(t, msg(key('hello')))).toBe('Hello')
    expect(renderMessage(t, msg(key('greet'), { name: 'Maria' }))).toBe('Hello, Maria')
  })

  it('renders a message that is a parameter of another, in the same language', () => {
    const undone = msg(key('undid'), { what: msg(key('delete'), { name: 'Ben' }) })
    expect(renderMessage(t, undone)).toBe('Undid: Delete Ben')
  })
})
