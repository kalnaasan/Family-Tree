import { expect, test } from '@playwright/test'
import { PERF_BUDGET } from '../src/config/perf-budget.ts'
import { openWithFixture } from './seed.ts'

/**
 * The frame times are measured as the gaps between animation frames, which a headless browser paces at its own
 * refresh rate; this much is allowed on top of the budget for that pacing jitter, not for slow frames.
 */
const PACING_JITTER_MS = 2

test.skip(({ browserName }) => browserName !== 'chromium', 'CPU throttling goes through the Chrome DevTools Protocol')

test('pan and zoom frame time at 200 people is within the budget at 4x CPU throttle', async ({ page, context }) => {
  await page.setViewportSize({ width: PERF_BUDGET.viewportWidth, height: 844 })
  const { frame } = await openWithFixture(page, 200)

  const cdp = await context.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: PERF_BUDGET.throttleCpuRate })

  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __sampling: boolean }
    w.__frames = []
    w.__sampling = true
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

  const frames = await page.evaluate(() => {
    const w = window as unknown as { __frames: number[]; __sampling: boolean }
    w.__sampling = false
    return w.__frames
  })
  const gaps = frames
    .slice(1)
    .map((time, i) => time - frames[i]!)
    .sort((a, b) => a - b)
  const p95 = gaps[Math.floor(gaps.length * 0.95)]!
  const budget = PERF_BUDGET.panZoomFrameP95Ms[200]
  console.info(`pan/zoom at 200 people: ${gaps.length} frames, p95 ${p95.toFixed(1)} ms (budget ${budget} ms)`)
  expect(gaps.length).toBeGreaterThan(100)
  expect(p95).toBeLessThanOrEqual(budget + PACING_JITTER_MS)
})
