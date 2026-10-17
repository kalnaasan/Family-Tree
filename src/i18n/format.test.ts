import { describe, expect, it } from 'vitest'
import { capitalise, formatDateTime, formatList, formatNumber, isolate } from './format.ts'

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/

describe('dates and numbers', () => {
  it('writes a date and time in English', () => {
    expect(formatDateTime('2026-03-05T14:30:00Z', 'en', 'UTC')).toBe('Mar 5, 2026, 2:30 PM')
  })

  it('writes Arabic dates with Western digits and the Gregorian calendar', () => {
    const text = formatDateTime('2026-03-05T14:30:00Z', 'ar', 'UTC')!
    expect(text).toContain('2026')
    expect(text).toContain('30')
    expect(text).not.toMatch(ARABIC_INDIC_DIGITS)
    expect(text).not.toContain('1447') // the Hijri year of that day
  })

  it('has no date to write for something that is not a date', () => {
    expect(formatDateTime('not a date', 'en')).toBeNull()
  })

  it('writes big numbers with Western digits in every language', () => {
    expect(formatNumber(5000, 'en')).toBe('5,000')
    expect(formatNumber(5000, 'ar')).not.toMatch(ARABIC_INDIC_DIGITS)
    expect(formatNumber(5000, 'ar')).toContain('5')
  })

  describe('lists', () => {
    it('joins names with commas, or with "and" when asked', () => {
      expect(formatList(['Ana', 'Ben', 'Cy'], 'en')).toBe('Ana, Ben, Cy')
      expect(formatList(['a parent link', 'a partnership'], 'en', 'and')).toBe('a parent link and a partnership')
      expect(formatList([], 'en')).toBe('')
      expect(formatList(['Ana'], 'en')).toBe('Ana')
    })

    it('uses the Arabic comma, with no "and" between the parts, and the Arabic conjunction when asked', () => {
      expect(formatList(['أحمد', 'ليلى', 'خالد'], 'ar')).toBe('أحمد، ليلى، خالد')
      expect(formatList(['أحمد', 'ليلى'], 'ar', 'and')).toMatch(/^أحمد و ?ليلى$/)
    })
  })

  it('capitalises the first letter, and leaves a language without case alone', () => {
    expect(capitalise('father')).toBe('Father')
    expect(capitalise('half-sister')).toBe('Half-sister')
    expect(capitalise('أب')).toBe('أب')
    expect(capitalise('')).toBe('')
  })

  it('isolates a piece of text from the direction of the sentence around it', () => {
    // first-strong isolate ... pop isolate: an English detail inside an Arabic sentence keeps its own order and punctuation
    expect(isolate('not-json')).toBe('\u2068not-json\u2069')
  })
})
