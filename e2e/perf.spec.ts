import { type Page, expect, test } from '@playwright/test'
import { PERF_BUDGET } from '../src/config/perf-budget.ts'
import { displayName } from '../src/view/text.ts'
import { LAYOUT_MEASURE } from '../src/layout/layoutClient.ts'
import { openPerson, panel } from './helpers.ts'
import { openWithFixture } from './seed.ts'

/**
 * The frame times are measured as the gaps between animation frames, which a headless browser paces at its own
 * refresh rate; this much is allowed on top of the budget for that pacing jitter, not for slow frames.
 */
const PACING_JITTER_MS = 2
const RUNS = 3

test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling goes through the Chrome DevTools Protocol')
// the biggest Tree takes a while to seed, load and measure at 4x throttle
test.setTimeout(180_000)

/**
 * `Emulation.setCPUThrottlingRate` slows the page's main thread (verified for this test: see the check below, and
 * docs/performance-testing.md). A rate of 4 means a CPU four times slower than this one.
 */
async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERF_BUDGET.throttleCpuRate })
  return cdp
}

test('the CPU throttle really slows the page down', async ({ page }) => {
  await page.goto('/')
  const spin = () =>
    page.evaluate(() => {
      const start = performance.now()
      let x = 0
      for (let i = 0; i < 2e7; i++) x += Math.sqrt(i)
      return { ms: performance.now() - start, x }
    })
  await spin() // warm up
  const normal = (await spin()).ms
  await throttle(page)
  const slowed = (await spin()).ms
  console.info(
    `CPU throttle check: ${normal.toFixed(0)} ms normal, ${slowed.toFixed(0)} ms at ${PERF_BUDGET.throttleCpuRate}x`,
  )
  expect(slowed).toBeGreaterThan(normal * 2.5)
})

/**
 * The same budget for the same Tree shape with Arabic names (spec section 13.7): longer strings and a script that is
 * measured and drawn differently, at the sizes of 1,000 people and up. No separate budget. The page itself stays English
 * and left to right here; right-to-left layout is checked in `rtl-arabic.spec.ts`.
 */
const VARIANTS = [
  ...PERF_BUDGET.sizes.map((size) => ({ size, names: 'default' as const, label: '' })),
  ...PERF_BUDGET.sizes
    .filter((size) => size >= 1000)
    .map((size) => ({ size, names: 'arabic' as const, label: ', Arabic names' })),
]

for (const { size, names, label } of VARIANTS) {
  test.describe(`${size} people at ${PERF_BUDGET.throttleCpuRate}x CPU throttle, ${PERF_BUDGET.viewportWidth} px wide${label}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: PERF_BUDGET.viewportWidth, height: 844 })
    })

    test('first paint, layout and edit to redraw are within the budget', async ({ page }) => {
      const { tree } = await openWithFixture(page, size, { names })
      await throttle(page)

      // Reload under throttle. A script that runs before the page notes when the first Person appears.
      await page.addInitScript(() => {
        const w = window as unknown as { __firstPerson?: number }
        const watch = new MutationObserver(() => {
          if (w.__firstPerson === undefined && document.querySelector('[data-person-wrapper]')) {
            w.__firstPerson = performance.now()
            watch.disconnect()
          }
        })
        watch.observe(document, { childList: true, subtree: true })
      })
      // each figure is the median of three runs: one run of a small Tree is mostly noise
      const firstPaints: number[] = []
      const layouts: number[] = []
      for (let run = 0; run < RUNS; run++) {
        await page.reload()
        await expect(page.locator('[data-person-wrapper]').first()).toBeVisible({ timeout: 60_000 })
        firstPaints.push(await page.evaluate(() => (window as unknown as { __firstPerson: number }).__firstPerson))
        layouts.push(
          await page.evaluate(
            (name) => Math.max(...performance.getEntriesByName(name).map((entry) => entry.duration)),
            LAYOUT_MEASURE,
          ),
        )
      }

      // edit -> redraw: from the click on Save until the new name is on the screen
      const focus = tree.persons.find((p) => p.id === tree.focusPersonId)!
      await openPerson(page, displayName(focus)) // with Arabic names the button starts with the last name too
      // on a phone the panel opens as a short peek; the details come with a tap
      await panel(page).getByRole('button', { name: 'Details' }).click()
      const edits: number[] = []
      for (let run = 0; run < RUNS; run++) {
        const name = `Zacharias${run}`
        await panel(page).getByRole('button', { name: 'Edit details' }).click()
        await panel(page).getByLabel('First name').fill(name)
        await page.evaluate((shownName) => {
          const w = window as unknown as { __edit: Promise<number> }
          let clicked = 0
          document.addEventListener('click', () => (clicked = performance.now()), { capture: true, once: true })
          w.__edit = new Promise<number>((resolve) => {
            const watch = new MutationObserver(() => {
              if (!clicked) return
              const shown = [...document.querySelectorAll('[data-person-wrapper]')].some((el) =>
                el.textContent?.includes(shownName),
              )
              if (!shown) return
              watch.disconnect()
              // the frame after the DOM change is what the user sees
              requestAnimationFrame(() => resolve(performance.now() - clicked))
            })
            watch.observe(document, { childList: true, subtree: true, characterData: true })
          })
        }, name)
        await panel(page).getByRole('button', { name: 'Save' }).click()
        edits.push(await page.evaluate(() => (window as unknown as { __edit: Promise<number> }).__edit))
      }
      const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!
      const firstPaint = median(firstPaints)
      const layoutMs = median(layouts)
      const editToRedraw = median(edits)

      const budget = {
        firstPaint: PERF_BUDGET.firstPaintMs[size],
        layout: PERF_BUDGET.layoutComputeMs[size],
        edit: PERF_BUDGET.editToRedrawMs[size],
      }
      console.info(
        `${size} people${label}: first paint ${firstPaint.toFixed(0)} ms (budget ${budget.firstPaint}), layout ${layoutMs.toFixed(0)} ms (budget ${budget.layout}), edit to redraw ${editToRedraw.toFixed(0)} ms (budget ${budget.edit})`,
      )
      expect(firstPaint).toBeLessThanOrEqual(budget.firstPaint)
      expect(layoutMs).toBeLessThanOrEqual(budget.layout)
      expect(editToRedraw).toBeLessThanOrEqual(budget.edit)
    })

    test('pan and zoom frame time is within the budget', async ({ page }) => {
      const { frame } = await openWithFixture(page, size, { names })
      await throttle(page)

      await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __sampling: boolean; __long: number[] }
        w.__frames = []
        w.__long = []
        w.__sampling = true
        new PerformanceObserver((list) => w.__long.push(...list.getEntries().map((e) => e.duration))).observe({
          type: 'longtask',
          buffered: false,
        })
        const tick = (time: number) => {
          w.__frames.push(time)
          if (w.__sampling) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })

      const box = (await frame.boundingBox())!
      const x = box.x + box.width / 2
      const y = box.y + box.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      for (let i = 1; i <= 80; i++) {
        await page.mouse.move(x + Math.sin(i / 8) * 120, y + Math.cos(i / 8) * 160)
        await page.waitForTimeout(16)
      }
      await page.mouse.up()
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, i < 20 ? -120 : 120)
        await page.waitForTimeout(16)
      }

      const { frames, long } = await page.evaluate(() => {
        const w = window as unknown as { __frames: number[]; __sampling: boolean; __long: number[] }
        w.__sampling = false
        return { frames: w.__frames, long: w.__long }
      })
      const gaps = frames
        .slice(1)
        .map((time, i) => time - frames[i]!)
        .sort((a, b) => a - b)
      const p95 = gaps[Math.floor(gaps.length * 0.95)]!
      const budget = PERF_BUDGET.panZoomFrameP95Ms[size]
      console.info(
        `pan/zoom at ${size} people${label}: ${gaps.length} frames, p95 ${p95.toFixed(1)} ms (budget ${budget} ms), ${long.length} long tasks, longest ${Math.max(0, ...long).toFixed(0)} ms`,
      )
      expect(gaps.length).toBeGreaterThan(100)
      expect(p95).toBeLessThanOrEqual(budget + PACING_JITTER_MS)
    })
  })
}

test('does the CPU throttle reach a Web Worker? (recorded, not asserted)', async ({ page }) => {
  await page.goto('/')
  const spinInWorker = () =>
    page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          const code =
            'onmessage=()=>{const s=performance.now();let x=0;for(let i=0;i<2e7;i++)x+=Math.sqrt(i);postMessage(performance.now()-s+x*0)}'
          const worker = new Worker(URL.createObjectURL(new Blob([code])))
          worker.onmessage = (event) => resolve(event.data as number)
          worker.postMessage(0)
        }),
    )
  await spinInWorker()
  const normal = await spinInWorker()
  await throttle(page)
  const slowed = await spinInWorker()
  console.info(
    `Worker throttle check: ${normal.toFixed(0)} ms normal, ${slowed.toFixed(0)} ms at ${PERF_BUDGET.throttleCpuRate}x`,
  )
})

test('a Tree above 1,000 people is laid out in a Web Worker', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await openWithFixture(page, PERF_BUDGET.workerLayoutAbove + 200)
  await expect.poll(() => workers.length).toBeGreaterThan(0)
  expect(workers.some((url) => /layoutWorker/i.test(url))).toBe(true)
})

test('a Tree up to 1,000 people is laid out on the page itself', async ({ page }) => {
  const workers: string[] = []
  page.on('worker', (worker) => workers.push(worker.url()))
  await openWithFixture(page, 300)
  expect(workers).toEqual([])
})
