import { describe, expect, it } from 'vitest'
import { PERF_BUDGET } from '../config/perf-budget.ts'
import { addParentLink, addPerson } from '../domain/tree.ts'
import { generateTree } from './fixtures.ts'
import { layoutTree } from './layoutTree.ts'

/** Wall times of `run` over `repeats` runs, sorted, after one warm-up run. */
function timings(run: () => void, repeats: number): number[] {
  for (let i = 0; i < 5; i++) run() // let the JIT settle: small runs are very sensitive to it
  const times: number[] = []
  for (let i = 0; i < repeats; i++) {
    const start = performance.now()
    run()
    times.push(performance.now() - start)
  }
  return times.sort((a, b) => a - b)
}
const medianMs = (run: () => void, repeats = 15) => timings(run, repeats)[Math.floor(repeats / 2)]!
/** The fastest of many runs: the least noisy way to compare two similar durations. */
const bestMs = (run: () => void, repeats = 25) => timings(run, repeats)[0]!

// The budget (spec section 9) is for a phone at 4x CPU throttle. Node runs unthrottled, so the measured time
// multiplied by the throttle rate must stay inside the budget.
describe('layout compute budget', () => {
  it.each(PERF_BUDGET.sizes)('lays out %i people within the budget at 4x CPU throttle', (size) => {
    const tree = generateTree(size, 1)
    const ms = medianMs(() => layoutTree(tree))
    const throttled = ms * PERF_BUDGET.throttleCpuRate
    const budget = PERF_BUDGET.layoutComputeMs[size as keyof typeof PERF_BUDGET.layoutComputeMs]
    console.info(`layout ${size} people: ${ms.toFixed(1)} ms (${throttled.toFixed(0)} ms at throttle, budget ${budget} ms)`)
    expect(throttled,`${ms.toFixed(1)} ms measured, ${throttled.toFixed(0)} ms at throttle`).toBeLessThanOrEqual(
      PERF_BUDGET.layoutComputeMs[size as keyof typeof PERF_BUDGET.layoutComputeMs],
    )
  })

  it('relayouts faster with a warm start than from scratch after one edit', () => {
    const tree = generateTree(1000, 1)
    const first = layoutTree(tree)
    const newId = '00000000-0000-4000-8000-0000000fffff'
    const edited = addParentLink(addPerson(tree, { id: newId, firstName: 'New' }), newId, tree.persons[500]!.id)
    const cold = bestMs(() => layoutTree(edited))
    const warm = bestMs(() => layoutTree(edited, { previous: first }))
    console.info(`relayout 1000 people after one edit: ${cold.toFixed(1)} ms from scratch, ${warm.toFixed(1)} ms warm`)
    expect(warm).toBeLessThan(cold)
  })
})
