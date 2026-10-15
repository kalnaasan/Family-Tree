import { expect, it } from 'vitest'
import { PERF_BUDGET } from './perf-budget.ts'

it('matches the budget in spec section 9', () => {
  expect(PERF_BUDGET).toEqual({
    throttleCpuRate: 4,
    viewportWidth: 390,
    sizes: [200, 1000, 5000],
    panZoomFrameP95Ms: { 200: 16.7, 1000: 20, 5000: 33 },
    firstPaintMs: { 200: 1000, 1000: 2000, 5000: 5000 },
    layoutComputeMs: { 200: 50, 1000: 200, 5000: 1500 },
    editToRedrawMs: { 200: 100, 1000: 300, 5000: 1000 },
    domElementCap: 2500,
  })
})
