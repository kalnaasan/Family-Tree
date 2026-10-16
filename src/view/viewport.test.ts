import { describe, expect, it } from 'vitest'
import {
  MAX_ZOOM,
  READABLE_ZOOM,
  ZOOM_FLOOR,
  centerOn,
  clampView,
  fitView,
  fitZoom,
  growRect,
  openingView,
  rectContains,
  visibleRect,
  worldCenter,
  zoomAt,
  zoomLimits,
} from './viewport.ts'

const size = { width: 400, height: 300 }
const bounds = { x0: -500, y0: 0, x1: 500, y1: 500 }

describe('zoom limits', () => {
  it('the minimum zoom is the fit-all zoom and the maximum is 250%', () => {
    const limits = zoomLimits(bounds, size)
    expect(limits.min).toBeCloseTo(fitZoom(bounds, size))
    expect(limits.min).toBeCloseTo((400 - 32) / 1000)
    expect(limits.max).toBe(MAX_ZOOM)
    expect(MAX_ZOOM).toBe(2.5)
  })

  it('is floored at about 3% for a huge Tree', () => {
    const huge = { x0: -100000, y0: 0, x1: 100000, y1: 90000 }
    expect(zoomLimits(huge, size).min).toBe(ZOOM_FLOOR)
  })

  it('never magnifies when fitting a tiny Tree', () => {
    const tiny = { x0: -50, y0: 0, x1: 50, y1: 50 }
    expect(fitZoom(tiny, size)).toBe(1)
  })
})

describe('opening view', () => {
  it('opens a Tree of up to 150 people fit-all, whatever the Focus person', () => {
    const view = openingView({ count: 150, bounds, focus: { x: 300, y: 400 }, size })
    expect(view).toEqual(fitView(bounds, size))
    expect(view.k).toBeCloseTo(zoomLimits(bounds, size).min)
  })

  it('opens a bigger Tree on the Focus person at a readable zoom', () => {
    const focus = { x: 300, y: 400 }
    const view = openingView({ count: 151, bounds, focus, size })
    expect(view.k).toBe(READABLE_ZOOM)
    expect(worldCenter(view, size).x).toBeCloseTo(focus.x)
    expect(worldCenter(view, size).y).toBeCloseTo(focus.y)
  })

  it('falls back to fit-all when a big Tree has no Focus person', () => {
    expect(openingView({ count: 500, bounds, size })).toEqual(fitView(bounds, size))
  })

  it('never opens below the minimum zoom', () => {
    const wide = { x0: -5000, y0: 0, x1: 5000, y1: 4000 }
    const view = openingView({ count: 500, bounds: wide, focus: { x: 0, y: 0 }, size })
    expect(view.k).toBeGreaterThanOrEqual(zoomLimits(wide, size).min)
  })
})

describe('zoomAt', () => {
  const limits = zoomLimits(bounds, size)

  it('keeps the world point under the anchor where it is', () => {
    const view = centerOn({ x: 0, y: 250 }, 0.6, size)
    const anchor = { x: 120, y: 80 }
    const before = { x: (anchor.x - view.x) / view.k, y: (anchor.y - view.y) / view.k }
    const next = zoomAt(view, 1.7, anchor, limits)
    expect(next.k).toBeCloseTo(0.6 * 1.7)
    expect((anchor.x - next.x) / next.k).toBeCloseTo(before.x)
    expect((anchor.y - next.y) / next.k).toBeCloseTo(before.y)
  })

  it('stops at the limits', () => {
    const view = centerOn({ x: 0, y: 250 }, 1, size)
    expect(zoomAt(view, 100, { x: 0, y: 0 }, limits).k).toBe(MAX_ZOOM)
    expect(zoomAt(view, 0.0001, { x: 0, y: 0 }, limits).k).toBe(limits.min)
  })
})

describe('clampView', () => {
  const limits = zoomLimits(bounds, size)

  it('leaves a view near the Tree alone', () => {
    const view = centerOn({ x: 100, y: 200 }, 0.5, size)
    expect(clampView(view, bounds, size, limits)).toEqual(view)
  })

  it('pulls a view that has been dragged far away back to the Tree', () => {
    const view = centerOn({ x: 90000, y: -90000 }, 0.5, size)
    const clamped = clampView(view, bounds, size, limits)
    const center = worldCenter(clamped, size)
    expect(center.x).toBeLessThanOrEqual(bounds.x1 + size.width / 4 / 0.5 + 1e-6)
    expect(center.y).toBeGreaterThanOrEqual(bounds.y0 - size.height / 4 / 0.5 - 1e-6)
    expect(clamped.k).toBe(0.5)
  })

  it('clamps the zoom into the limits', () => {
    expect(clampView({ x: 0, y: 0, k: 50 }, bounds, size, limits).k).toBe(MAX_ZOOM)
  })
})

describe('rects', () => {
  it('visibleRect is the inverse of the view', () => {
    const view = centerOn({ x: 10, y: 20 }, 2, size)
    const rect = visibleRect(view, size)
    expect((rect.x0 + rect.x1) / 2).toBeCloseTo(10)
    expect((rect.y0 + rect.y1) / 2).toBeCloseTo(20)
    expect(rect.x1 - rect.x0).toBeCloseTo(size.width / 2)
  })

  it('growRect grows every side by a share of the size', () => {
    const grown = growRect({ x0: 0, y0: 0, x1: 100, y1: 50 }, 0.5)
    expect(grown).toEqual({ x0: -50, y0: -25, x1: 150, y1: 75 })
    expect(rectContains(grown, { x0: 0, y0: 0, x1: 100, y1: 50 })).toBe(true)
    expect(rectContains({ x0: 0, y0: 0, x1: 100, y1: 50 }, grown)).toBe(false)
  })
})
