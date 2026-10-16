import { describe, expect, it } from 'vitest'
import { HEART_PATH, boughPath, branchWidth, rootPaths, taperedPath, trunkPath } from './geometry.ts'

const points = (path: string) =>
  path
    .replace(/^M/, '')
    .replace(/Z$/, '')
    .split('L')
    .map((pair) => pair.split(',').map(Number) as [number, number])

describe('taperedPath', () => {
  it('is a closed outline with one point per side per step', () => {
    const path = taperedPath({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }, 10, 2, 6)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(points(path)).toHaveLength(2 * (6 + 1))
    expect(path).not.toContain('NaN')
  })

  it('starts as wide as w0 and ends as wide as w1', () => {
    const outline = points(taperedPath({ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 0, y: 30 }, 10, 2, 6))
    const first = outline[0]!
    const last = outline[outline.length - 1]!
    expect(Math.abs(first[0] - last[0])).toBeCloseTo(10)
    const midEnd = outline[6]!
    const midStart = outline[7]!
    expect(Math.abs(midEnd[0] - midStart[0])).toBeCloseTo(2)
  })
})

describe('boughPath', () => {
  it('survives two identical ends without NaN', () => {
    expect(boughPath({ x: 5, y: 5 }, 0, { x: 5, y: 5 }, 0, 8, 4)).not.toContain('NaN')
  })

  it('bows outward: a branch to the right of the crown leans right of the straight line', () => {
    const theta = Math.PI / 2
    const path = boughPath({ x: 100, y: 0 }, theta, { x: 100, y: -200 }, theta, 6, 6)
    const xs = points(path).map(([x]) => x)
    expect(Math.max(...xs)).toBeGreaterThan(110)
  })
})

describe('branchWidth', () => {
  it('thickens with descendants and stops at the maximum', () => {
    expect(branchWidth(1, 22)).toBeLessThan(branchWidth(10, 22))
    expect(branchWidth(10_000, 22)).toBe(22)
  })
})

describe('trunk, roots and heart', () => {
  it('draws one trunk and five roots', () => {
    expect(trunkPath().startsWith('M')).toBe(true)
    expect(rootPaths()).toHaveLength(5)
    expect(HEART_PATH.endsWith('Z')).toBe(true)
  })
})
