import { describe, expect, it } from 'vitest'
import { createTranslator } from './translate.ts'

const dictionaries = {
  en: { greeting: 'Hello', welcome: 'Welcome, {name}' },
  ar: { greeting: 'مرحبا', welcome: 'أهلا، {name}' },
}

describe('translator', () => {
  it('gives the text of a key in the language asked for', () => {
    expect(createTranslator('en', dictionaries)('greeting')).toBe('Hello')
    expect(createTranslator('ar', dictionaries)('greeting')).toBe('مرحبا')
  })

  it('fills in {name} style parameters, leaving an unknown one as it is', () => {
    const t = createTranslator('ar', dictionaries)
    expect(t('welcome', { name: 'ليلى' })).toBe('أهلا، ليلى')
    expect(t('welcome', {})).toBe('أهلا، {name}')
    expect(createTranslator('en', dictionaries)('welcome', { name: 'Maria' })).toBe('Welcome, Maria')
  })

  it('falls back to the English text when the language lacks the key, never showing the key', () => {
    const partial = { en: { greeting: 'Hello', farewell: 'Goodbye' }, ar: { greeting: 'مرحبا' } }
    const t = createTranslator('ar', partial)
    expect(t('greeting')).toBe('مرحبا')
    expect(t('farewell')).toBe('Goodbye')
  })

  describe('plurals', () => {
    const plurals = {
      en: { people: { one: '{count} person', other: '{count} people' } },
      ar: {
        people: {
          zero: 'لا أحد',
          one: 'شخص واحد',
          two: 'شخصان',
          few: '{count} أشخاص',
          many: '{count} شخصًا',
          other: '{count} شخص',
        },
      },
    }

    it('picks the English form from the count', () => {
      const t = createTranslator('en', plurals)
      expect(t('people', { count: 1 })).toBe('1 person')
      expect(t('people', { count: 0 })).toBe('0 people')
      expect(t('people', { count: 2 })).toBe('2 people')
    })

    it('picks each of the six Arabic forms from the count', () => {
      const t = createTranslator('ar', plurals)
      expect(t('people', { count: 0 })).toBe('لا أحد')
      expect(t('people', { count: 1 })).toBe('شخص واحد')
      expect(t('people', { count: 2 })).toBe('شخصان')
      expect(t('people', { count: 5 })).toBe('5 أشخاص')
      expect(t('people', { count: 11 })).toBe('11 شخصًا')
      expect(t('people', { count: 100 })).toBe('100 شخص')
    })
  })
})
