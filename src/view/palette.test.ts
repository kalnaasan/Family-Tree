import { describe, expect, it } from 'vitest'
import type { Gender } from '../domain/schema.ts'
import { PALETTE } from './palette.ts'

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => {
    const value = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!
}

/** WCAG 2.x contrast ratio. */
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light! + 0.05) / (dark! + 0.05)
}

const genders: Gender[] = ['female', 'male', 'other', 'unknown']

describe('palette contrast (WCAG 2.2 AA, spec section 7)', () => {
  it('names and dates are at least 4.5:1 on the background', () => {
    expect(contrast(PALETTE.name, PALETTE.background)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(PALETTE.dates, PALETTE.background)).toBeGreaterThanOrEqual(4.5)
  })

  it('the initial is at least 4.5:1 on the medallion', () => {
    expect(contrast(PALETTE.name, PALETTE.medallion)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(genders)('the %s ring is at least 3:1 against the background and the medallion', (gender) => {
    expect(contrast(PALETTE.ring[gender], PALETTE.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(PALETTE.ring[gender], PALETTE.medallion)).toBeGreaterThanOrEqual(3)
  })

  it.each(genders)('the muted deceased %s ring is still at least 3:1', (gender) => {
    expect(contrast(PALETTE.ringDeceased[gender], PALETTE.background)).toBeGreaterThanOrEqual(3)
    expect(contrast(PALETTE.ringDeceased[gender], PALETTE.medallion)).toBeGreaterThanOrEqual(3)
  })

  it('the Focus ring, partner lines and hearts are at least 3:1', () => {
    for (const color of [PALETTE.focus, PALETTE.partner, PALETTE.partnerEnded, PALETTE.heart]) {
      expect(contrast(color, PALETTE.background)).toBeGreaterThanOrEqual(3)
    }
  })

  it('a deceased ring differs from the living one for every gender', () => {
    for (const gender of genders) expect(PALETTE.ringDeceased[gender]).not.toBe(PALETTE.ring[gender])
  })
})
