import { describe, expect, it } from 'vitest'
import {
  DOUBLE_TAP_MS,
  GestureTracker,
  TAP_SLOP_PX,
  TARGET_RADIUS_PX,
  ZOOM_OUT_OF_DOT,
  nearestPerson,
  resolveTap,
} from './gestures.ts'
import { LOD_EDGES, lodBucket } from './lod.ts'

describe('GestureTracker: one pointer', () => {
  it('drags by the movement since the last event', () => {
    const g = new GestureTracker()
    g.down(1, { x: 10, y: 10 }, 'touch')
    expect(g.move(1, { x: 15, y: 8 })).toEqual({ type: 'pan', dx: 5, dy: -2 })
    expect(g.move(1, { x: 20, y: 8 })).toEqual({ type: 'pan', dx: 5, dy: 0 })
  })

  it('a press that moves less than the slop is a tap', () => {
    const g = new GestureTracker()
    g.down(1, { x: 10, y: 10 }, 'touch')
    g.move(1, { x: 14, y: 10 })
    expect(g.up(1, { x: 14, y: 10 }, 0)).toEqual({ type: 'tap', at: { x: 14, y: 10 }, double: false })
  })

  it('a press that moves the slop or more is a drag, not a tap', () => {
    const g = new GestureTracker()
    g.down(1, { x: 10, y: 10 }, 'touch')
    g.move(1, { x: 10 + TAP_SLOP_PX, y: 10 })
    expect(g.up(1, { x: 10 + TAP_SLOP_PX, y: 10 }, 0)).toBeNull()
  })

  it('an unknown pointer does nothing', () => {
    expect(new GestureTracker().move(9, { x: 1, y: 1 })).toBeNull()
  })

  it('a cancelled press is no tap', () => {
    const g = new GestureTracker()
    g.down(1, { x: 0, y: 0 }, 'touch')
    g.cancel(1)
    expect(g.active).toBe(false)
    expect(g.up(1, { x: 0, y: 0 }, 0)).toBeNull()
  })
})

describe('GestureTracker: double-tap', () => {
  const tapAt = (g: GestureTracker, id: number, x: number, time: number, kind: 'touch' | 'mouse' = 'touch') => {
    g.down(id, { x, y: 0 }, kind)
    return g.up(id, { x, y: 0 }, time)
  }

  it('two touch taps close in time and place are a double-tap, and a third starts over', () => {
    const g = new GestureTracker()
    expect(tapAt(g, 1, 100, 0)).toMatchObject({ double: false })
    expect(tapAt(g, 2, 110, DOUBLE_TAP_MS)).toMatchObject({ double: true })
    expect(tapAt(g, 3, 110, DOUBLE_TAP_MS + 50)).toMatchObject({ double: false })
  })

  it('taps too late or too far apart are two single taps', () => {
    const g = new GestureTracker()
    tapAt(g, 1, 100, 0)
    expect(tapAt(g, 2, 100, DOUBLE_TAP_MS + 1)).toMatchObject({ double: false })
    expect(tapAt(g, 3, 200, DOUBLE_TAP_MS + 50)).toMatchObject({ double: false })
  })

  it('a mouse never double-taps', () => {
    const g = new GestureTracker()
    tapAt(g, 1, 100, 0, 'mouse')
    expect(tapAt(g, 2, 100, 50, 'mouse')).toMatchObject({ double: false })
  })
})

describe('GestureTracker: two pointers', () => {
  const pinching = () => {
    const g = new GestureTracker()
    g.down(1, { x: 100, y: 100 }, 'touch')
    g.down(2, { x: 200, y: 100 }, 'touch')
    return g
  }

  it('spreading the fingers zooms in about their previous midpoint', () => {
    const g = pinching()
    expect(g.move(2, { x: 300, y: 100 })).toEqual({ type: 'pinch', factor: 2, anchor: { x: 150, y: 100 }, dx: 50, dy: 0 })
  })

  it('moving both fingers together pans without zooming', () => {
    const g = pinching()
    // the events arrive one finger at a time, so the steps zoom a little and cancel out
    const steps = [g.move(1, { x: 100, y: 130 }), g.move(2, { x: 200, y: 130 })]
    const pinches = steps.flatMap((s) => (s?.type === 'pinch' ? [s] : []))
    expect(pinches.reduce((product, s) => product * s.factor, 1)).toBeCloseTo(1, 1)
    expect(pinches.reduce((sum, s) => sum + s.dy, 0)).toBeCloseTo(30)
  })

  it('pinching closed zooms out', () => {
    const g = pinching()
    expect(g.move(1, { x: 150, y: 100 })).toMatchObject({ type: 'pinch', factor: 0.5 })
  })

  it('is never a tap, even when the fingers barely moved', () => {
    const g = pinching()
    expect(g.up(2, { x: 200, y: 100 }, 0)).toBeNull()
    expect(g.up(1, { x: 100, y: 100 }, 1)).toBeNull()
  })

  it('the finger left on the glass carries on as a drag', () => {
    const g = pinching()
    g.up(2, { x: 200, y: 100 }, 0)
    expect(g.move(1, { x: 110, y: 100 })).toEqual({ type: 'pan', dx: 10, dy: 0 })
  })

  it('a third finger is ignored', () => {
    const g = pinching()
    g.down(3, { x: 0, y: 0 }, 'touch')
    expect(g.move(3, { x: 50, y: 50 })).toBeNull()
  })
})

describe('tap targets', () => {
  const layout = { count: 3, ids: ['a', 'b', 'c'], x: Float32Array.from([0, 1000, 2000]), y: Float32Array.from([0, 0, 0]) }
  const at = (x: number, k: number, drawnPersonId: string | null = null) =>
    resolveTap({ drawnPersonId, screen: { x, y: 0 }, view: { x: 0, y: 0, k }, layout, bucket: lodBucket(k) })

  it('finds the nearest Person only within the world distance', () => {
    expect(nearestPerson(layout, { x: 990, y: 0 }, 20)).toBe(1)
    expect(nearestPerson(layout, { x: 900, y: 0 }, 20)).toBe(-1)
  })

  it('a drawn Person under the finger wins', () => {
    expect(at(500, 1, 'c')).toEqual({ type: 'person', id: 'c' })
  })

  it('the target is 48 px on screen at any zoom: a finger 20 px off still hits at 30% zoom', () => {
    const k = 0.3
    expect(at(1000 * k + TARGET_RADIUS_PX - 4, k)).toEqual({ type: 'person', id: 'b' })
    expect(at(1000 * k + TARGET_RADIUS_PX + 6, k)).toEqual({ type: 'empty' })
  })

  it('in the dot bucket a miss zooms in, a near hit selects', () => {
    const k = 0.05
    expect(lodBucket(k)).toBe('dot')
    expect(at(1000 * k + 10, k)).toEqual({ type: 'person', id: 'b' })
    expect(at(500 * k, k)).toEqual({ type: 'zoom' })
  })

  it('zooming out of the dot lands inside the initial-only bucket', () => {
    expect(lodBucket(ZOOM_OUT_OF_DOT)).toBe('initial')
    expect(ZOOM_OUT_OF_DOT).toBeGreaterThan(LOD_EDGES.initial)
  })
})
