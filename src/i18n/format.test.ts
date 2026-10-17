import { describe, expect, it } from 'vitest'
import { formatDateTime, formatNumber } from './format.ts'

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
})
