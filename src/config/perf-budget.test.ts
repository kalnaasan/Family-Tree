import { expect, it } from 'vitest'
import { PERF_BUDGET } from './perf-budget.ts'

it('defines every budget metric for every size', () => {
  for (const size of PERF_BUDGET.sizes) {
    expect(PERF_BUDGET.panZoomFrameP95Ms[size]).toBeGreaterThan(0)
    expect(PERF_BUDGET.firstPaintMs[size]).toBeGreaterThan(0)
    expect(PERF_BUDGET.layoutComputeMs[size]).toBeGreaterThan(0)
    expect(PERF_BUDGET.editToRedrawMs[size]).toBeGreaterThan(0)
  }
})
