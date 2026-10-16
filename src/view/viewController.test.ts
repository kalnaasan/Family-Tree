import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewController } from './viewController.ts'
import { MAX_ZOOM, fitView, zoomLimits } from './viewport.ts'

const size = { width: 400, height: 300 }
const bounds = { x0: -500, y0: 0, x1: 500, y1: 500 }

function setup(reducedMotion = false) {
  const changes: number[] = []
  const controller = new ViewController({
    onChange: (view) => changes.push(view.k),
    prefersReducedMotion: () => reducedMotion,
  })
  controller.configure(size, bounds)
  return { controller, changes }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('ViewController', () => {
  it('is not ready until it has a size', () => {
    const controller = new ViewController({ onChange: () => {}, prefersReducedMotion: () => false })
    expect(controller.ready).toBe(false)
    controller.configure(size, bounds)
    expect(controller.ready).toBe(true)
  })

  it('takes its zoom limits from the Tree and the screen', () => {
    const { controller } = setup()
    expect(controller.zoomRange).toEqual(zoomLimits(bounds, size))
  })

  it('jump stays inside the zoom limits', () => {
    const { controller } = setup()
    controller.jump({ x: 0, y: 0, k: 99 })
    expect(controller.view.k).toBe(MAX_ZOOM)
    controller.jump({ x: 0, y: 0, k: 0.00001 })
    expect(controller.view.k).toBe(controller.zoomRange.min)
  })

  it('lowers the minimum zoom when the Tree gets bigger, leaving the view where it is', () => {
    const { controller } = setup()
    controller.jump(fitView(bounds, size))
    const before = controller.view.k
    const minBefore = controller.zoomRange.min
    controller.configure(size, { x0: -5000, y0: 0, x1: 5000, y1: 4000 })
    expect(controller.zoomRange.min).toBeLessThan(minBefore)
    expect(controller.view.k).toBe(before)
  })

  it('raises a view that is now below the minimum zoom when the Tree gets smaller', () => {
    const { controller } = setup()
    controller.jump({ x: 0, y: 0, k: controller.zoomRange.min })
    controller.configure(size, { x0: -100, y0: 0, x1: 100, y1: 100 })
    expect(controller.zoomRange.min).toBeGreaterThan(0.368)
    expect(controller.view.k).toBeGreaterThanOrEqual(controller.zoomRange.min)
  })

  it('only notifies when the view actually changes', () => {
    const { controller, changes } = setup()
    controller.jump({ x: 10, y: 10, k: 1 })
    const count = changes.length
    controller.jump({ x: 10, y: 10, k: 1 })
    expect(changes).toHaveLength(count)
  })

  it('panBy moves the view by the given pixels', () => {
    const { controller } = setup()
    controller.jump({ x: 0, y: 0, k: 1 })
    const { x, y } = controller.view
    controller.panBy(30, -20)
    expect(controller.view.x - x).toBeCloseTo(30)
    expect(controller.view.y - y).toBeCloseTo(-20)
  })

  describe('with reduced motion', () => {
    it('every change jumps: no animation frames are needed', () => {
      const { controller } = setup(true)
      controller.jump({ x: 0, y: 0, k: 1 })
      controller.zoomBy(1.25)
      expect(controller.view.k).toBeCloseTo(1.25)
      controller.fit()
      expect(controller.view).toEqual(fitView(bounds, size))
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('without reduced motion', () => {
    it('animates a zoom step and ends exactly on the target', () => {
      const { controller } = setup()
      controller.jump({ x: 0, y: 0, k: 1 })
      controller.zoomBy(1.25)
      expect(controller.view.k).toBe(1)
      vi.advanceTimersByTime(90)
      expect(controller.view.k).toBeGreaterThan(1)
      expect(controller.view.k).toBeLessThan(1.25)
      vi.advanceTimersByTime(200)
      expect(controller.view.k).toBeCloseTo(1.25)
    })

    it('a drag stops a running animation', () => {
      const { controller } = setup()
      controller.jump({ x: 0, y: 0, k: 1 })
      controller.zoomBy(2)
      vi.advanceTimersByTime(40)
      controller.panBy(5, 5)
      const k = controller.view.k
      vi.advanceTimersByTime(500)
      expect(controller.view.k).toBe(k)
    })

    it('dispose stops a running animation', () => {
      const { controller } = setup()
      controller.jump({ x: 0, y: 0, k: 1 })
      controller.zoomBy(2)
      controller.dispose()
      vi.advanceTimersByTime(500)
      expect(controller.view.k).toBe(1)
    })
  })
})
