import type { Point } from './viewport.ts'

/** Distance from the crown's centre to the bottom of the trunk, and the room under it for roots. */
export const TRUNK_HEIGHT = 200
export const ROOTS_DEPTH = 140
/** Drawn radius of a Person's medallion, in world units. */
export const NODE_RADIUS = 32

const round = (value: number) => Math.round(value * 10) / 10

/**
 * The outline of a tapered, bowed stroke from `p0` to `p3` through control points `c0`, `c1`, as a closed SVG
 * path. `w0` and `w1` are the widths at the two ends. Drawn as a filled shape so a branch can thin out.
 */
export function taperedPath(p0: Point, c0: Point, c1: Point, p3: Point, w0: number, w1: number, steps: number): string {
  const left: string[] = []
  const right: string[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    const x = u ** 3 * p0.x + 3 * u * u * t * c0.x + 3 * u * t * t * c1.x + t ** 3 * p3.x
    const y = u ** 3 * p0.y + 3 * u * u * t * c0.y + 3 * u * t * t * c1.y + t ** 3 * p3.y
    const dx = 3 * u * u * (c0.x - p0.x) + 6 * u * t * (c1.x - c0.x) + 3 * t * t * (p3.x - c1.x)
    const dy = 3 * u * u * (c0.y - p0.y) + 6 * u * t * (c1.y - c0.y) + 3 * t * t * (p3.y - c1.y)
    const length = Math.hypot(dx, dy) || 1
    const half = (w0 + (w1 - w0) * t) / 2
    left.push(`${round(x - (dy / length) * half)},${round(y + (dx / length) * half)}`)
    right.push(`${round(x + (dy / length) * half)},${round(y - (dx / length) * half)}`)
  }
  return `M${left.join('L')}L${right.reverse().join('L')}Z`
}

/** Unit vector pointing away from the crown's centre at angle `theta` (0 = straight up). */
export const outward = (theta: number): Point => ({ x: Math.sin(theta), y: -Math.cos(theta) })

/**
 * A branch from a parent to a child. Both ends leave along the radial direction, so branches bow outward like
 * boughs. Pass `fromTheta` as `0` for the trunk's top.
 */
export function boughPath(from: Point, fromTheta: number, to: Point, toTheta: number, w0: number, w1: number): string {
  const reach = 0.5 * Math.hypot(to.x - from.x, to.y - from.y)
  const a = outward(fromTheta)
  const b = outward(toTheta)
  return taperedPath(
    from,
    { x: from.x + a.x * reach, y: from.y + a.y * reach },
    { x: to.x - b.x * reach, y: to.y - b.y * reach },
    to,
    w0,
    w1,
    10,
  )
}

/** Branch width at a Person: thicker the more descendants they have. */
export const branchWidth = (weight: number, max: number) => Math.min(3 + weight * 1.2, max)

export function trunkPath(): string {
  return taperedPath(
    { x: 0, y: TRUNK_HEIGHT },
    { x: -20, y: TRUNK_HEIGHT * 0.67 },
    { x: 20, y: TRUNK_HEIGHT * 0.33 },
    { x: 0, y: 0 },
    56,
    40,
    14,
  )
}

export function rootPaths(): string[] {
  return [-1, -0.5, 0, 0.5, 1].map((side, i) =>
    taperedPath(
      { x: 0, y: TRUNK_HEIGHT },
      { x: side * 40, y: TRUNK_HEIGHT + 40 },
      { x: side * 110, y: TRUNK_HEIGHT + 80 },
      { x: side * 190, y: TRUNK_HEIGHT + 100 + (i % 2) * 20 },
      30,
      3,
      14,
    ),
  )
}

/** A small heart centred on the origin, about 20 units wide. */
export const HEART_PATH = 'M0,9C-14,-2 -9,-14 -4,-14C-1.5,-14 0,-12 0,-10C0,-12 1.5,-14 4,-14C9,-14 14,-2 0,9Z'
