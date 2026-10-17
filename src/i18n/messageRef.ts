import type { MessageKey } from './messages.ts'

/** A parameter of a message: text, a number, or another message (rendered in the same language first). */
export type MessageParam = string | number | MessageRef

/**
 * A message that is not yet words: a key and its parameters. Pure code (the history, `addRelative`, `navigation`)
 * and the toast carry these instead of English sentences, and the interface turns them into words when it draws
 * them, so what is on screen follows a language switch (spec section 13.1).
 */
export interface MessageRef {
  key: MessageKey
  params?: Record<string, MessageParam>
}

export const msg = (key: MessageKey, params?: Record<string, MessageParam>): MessageRef =>
  params ? { key, params } : { key }

const isMessageRef = (value: MessageParam): value is MessageRef => typeof value === 'object'

type Translate = (key: MessageKey, params?: Record<string, string | number>) => string

/** The words of a message in the language `t` speaks. */
export function renderMessage(t: Translate, ref: MessageRef): string {
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(ref.params ?? {})) {
    params[name] = isMessageRef(value) ? renderMessage(t, value) : value
  }
  return t(ref.key, params)
}
