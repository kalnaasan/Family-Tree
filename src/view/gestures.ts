import type { TreeLayout } from '../layout/layoutTree.ts'
import { LOD_EDGES, type LodBucket } from './lod.ts'
import type { Point, View } from './viewport.ts'

/** Movement under this many pixels between press and release is a tap, not a drag (spec section 8). */
export const TAP_SLOP_PX = 8
/** Two taps this close in time and place are a double-tap. */
export const DOUBLE_TAP_MS = 300
export const DOUBLE_TAP_DISTANCE_PX = 30
/** The Person target is 48 px across down to the "initial only" bucket (spec section 12, point 2). */
export const TARGET_RADIUS_PX = 24
/** A tap that misses every Person in the "dot" bucket zooms to just inside the "initial only" bucket. */
export const ZOOM_OUT_OF_DOT = LOD_EDGES.initial * 1.2

export type PointerKind = 'mouse' | 'touch' | 'pen'

/** What a pointer event stream means. Positions are the pointer's own (client) coordinates. */
export type GestureAction =
  | { type: 'pan'; dx: number; dy: number }
  /** Zoom by `factor` about `anchor` (the fingers' previous midpoint), then pan by `dx`, `dy` (the midpoint's move). */
  | { type: 'pinch'; factor: number; anchor: Point; dx: number; dy: number }
  | { type: 'tap'; at: Point; double: boolean }

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Turns pointer events into pan, pinch and tap, without touching the DOM. One pointer drags; two pinch (and pan with
 * their midpoint); a press that barely moves is a tap, and two touch taps in quick succession are a double-tap. A
 * gesture that ever had two pointers down is never a tap.
 */
export class GestureTracker {
  private readonly pointers = new Map<number, Point>()
  private tap: { id: number; start: Point; kind: PointerKind } | null = null
  private lastTap: { at: Point; time: number } | null = null

  get active(): boolean {
    return this.pointers.size > 0
  }

  down(id: number, at: Point, kind: PointerKind): void {
    this.tap = this.pointers.size === 0 ? { id, start: at, kind } : null
    this.pointers.set(id, at)
  }

  move(id: number, at: Point): GestureAction | null {
    const previous = this.pointers.get(id)
    if (!previous) return null
    const ids = [...this.pointers.keys()]
    if (ids.length === 1) {
      this.pointers.set(id, at)
      return { type: 'pan', dx: at.x - previous.x, dy: at.y - previous.y }
    }
    if (id !== ids[0] && id !== ids[1]) {
      this.pointers.set(id, at)
      return null
    }
    const [a, b] = [this.pointers.get(ids[0]!)!, this.pointers.get(ids[1]!)!]
    this.pointers.set(id, at)
    const [na, nb] = [this.pointers.get(ids[0]!)!, this.pointers.get(ids[1]!)!]
    const before = distance(a, b)
    const from = midpoint(a, b)
    const to = midpoint(na, nb)
    return {
      type: 'pinch',
      factor: before < 1 ? 1 : distance(na, nb) / before,
      anchor: from,
      dx: to.x - from.x,
      dy: to.y - from.y,
    }
  }

  up(id: number, at: Point, time: number): GestureAction | null {
    const tap = this.tap
    this.pointers.delete(id)
    if (!tap || tap.id !== id) return null
    this.tap = null
    if (distance(at, tap.start) >= TAP_SLOP_PX) return null
    const last = this.lastTap
    const double =
      tap.kind !== 'mouse' && last !== null && time - last.time <= DOUBLE_TAP_MS && distance(at, last.at) <= DOUBLE_TAP_DISTANCE_PX
    this.lastTap = double ? null : { at, time }
    return { type: 'tap', at, double }
  }

  cancel(id: number): void {
    this.pointers.delete(id)
    if (this.tap?.id === id) this.tap = null
  }
}

export type TapTarget =
  | { type: 'person'; id: string }
  /** The "dot" level: nobody near the tap, so the view zooms in toward it. */
  | { type: 'zoom' }
  | { type: 'empty' }

/** The index of the Person nearest to a world point, if one is within `maxDistance` of it; else -1. */
export function nearestPerson(layout: Pick<TreeLayout, 'x' | 'y' | 'count'>, world: Point, maxDistance: number): number {
  let best = -1
  let bestSquared = maxDistance * maxDistance
  for (let i = 0; i < layout.count; i++) {
    const dx = layout.x[i]! - world.x
    const dy = layout.y[i]! - world.y
    const squared = dx * dx + dy * dy
    if (squared <= bestSquared) {
      best = i
      bestSquared = squared
    }
  }
  return best
}

/**
 * What a tap at `screen` (relative to the canvas) hits. A Person drawn under the finger wins; otherwise the nearest
 * Person within a 48 px target, which is how a small medallion stays tappable at low zoom; otherwise empty space,
 * which in the "dot" bucket means zoom in rather than dismiss.
 */
export function resolveTap(input: {
  drawnPersonId: string | null
  screen: Point
  view: View
  layout: Pick<TreeLayout, 'x' | 'y' | 'count' | 'ids'>
  bucket: LodBucket | undefined
}): TapTarget {
  const { drawnPersonId, screen, view, layout, bucket } = input
  if (drawnPersonId) return { type: 'person', id: drawnPersonId }
  const world = { x: (screen.x - view.x) / view.k, y: (screen.y - view.y) / view.k }
  const near = nearestPerson(layout, world, TARGET_RADIUS_PX / view.k)
  if (near >= 0) return { type: 'person', id: layout.ids[near]! }
  return bucket === 'dot' ? { type: 'zoom' } : { type: 'empty' }
}
