import type { Plural } from './translate.ts'

/**
 * The interface text. English is where the keys are made; Arabic is typed from it, so the build fails when Arabic
 * lacks a key, has an extra one, or gives a plural message fewer than all six forms (spec section 13.1).
 * Interface text moves in here in the ticket "Move interface text into the dictionary".
 */
export const en = {
  'settings.language': 'Language',
  'language.auto': 'Same as the browser',
} satisfies Record<string, string | Plural>

export type MessageKey = keyof typeof en

type ArabicOf<T> = { [K in keyof T]: T[K] extends string ? string : Required<Plural> }

/** A draft in Modern Standard Arabic; the owner reviews every string before Arabic is offered (spec section 13.8). */
export const ar: ArabicOf<typeof en> = {
  'settings.language': 'اللغة',
  'language.auto': 'مثل المتصفح',
}

export const DICTIONARIES = { en, ar }
