import AxeBuilder from '@axe-core/playwright'
import { expect, test, words } from './fixtures.ts'
import { openWithFixture, zoomOf } from './seed.ts'

/** These are the artistic tree's opening and zoom rules (spec section 12); the chart's are in collapse.spec. */
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('family-tree.treeShape', 'crown'))
})

const MIN_READABLE = 0.8
const MAX_ZOOM = 2.5

const personCount = (frame: import('@playwright/test').Locator) => frame.locator('[data-person-id]').count()

for (const size of [15, 150, 500]) {
  test(`renders a ${size}-person fixture, with the right opening view`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    const { tree, frame } = await openWithFixture(page, size)

    expect(await personCount(frame)).toBeGreaterThan(0)
    if (size <= 150) {
      // fit-all: every Person is drawn
      expect(await personCount(frame)).toBe(size)
    } else {
      // opens on the Focus person at a readable zoom; the rest of the Tree is culled
      expect(await zoomOf(frame)).toBeCloseTo(MIN_READABLE, 3)
      const focus = frame.locator(`[data-person-id="${tree.focusPersonId}"]`)
      await expect(focus).toBeVisible()
      const box = (await focus.boundingBox())!
      const viewport = page.viewportSize()!
      expect(box.x).toBeGreaterThan(0)
      expect(box.x + box.width).toBeLessThan(viewport.width)
      expect(box.y + box.height).toBeLessThan(viewport.height)
      expect(await personCount(frame)).toBeLessThan(size)
    }
    expect(errors).toEqual([])
  })
}

test('the minimum zoom is fit-all and the maximum is 250%', async ({ page }) => {
  const { frame } = await openWithFixture(page, 150)
  const fit = await zoomOf(frame)

  await frame.focus()
  for (let i = 0; i < 4; i++) await page.keyboard.press('-')
  await page.waitForTimeout(300)
  expect(await zoomOf(frame)).toBeCloseTo(fit, 4)

  const box = (await frame.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.wheel(0, -30000)
  await expect.poll(() => zoomOf(frame)).toBe(MAX_ZOOM)

  await page.mouse.wheel(0, 60000)
  await expect.poll(() => zoomOf(frame)).toBeCloseTo(fit, 4)
})

test('Show whole tree is always available, even when the Tree opened on the Focus person', async ({ page }) => {
  const { frame } = await openWithFixture(page, 500)
  expect(await zoomOf(frame)).toBeCloseTo(MIN_READABLE, 3)
  await page.getByRole('button', { name: words('tree.fit') }).click()
  await expect.poll(() => zoomOf(frame)).toBeLessThan(MIN_READABLE / 2)
  await page.waitForTimeout(300) // let the animation finish
  const whole = await zoomOf(frame)
  await expect(frame).toHaveAttribute('data-lod', 'dot')
  await frame.focus()
  await page.keyboard.press('-')
  await page.waitForTimeout(300)
  expect(await zoomOf(frame)).toBeCloseTo(whole, 4)
  await page.getByRole('button', { name: words('tree.backToFocus') }).click()
  await expect.poll(() => zoomOf(frame)).toBeGreaterThanOrEqual(MIN_READABLE - 0.001)
})

test('keys: + and - zoom, 0 fits, Shift+arrows pan', async ({ page }) => {
  const { frame } = await openWithFixture(page, 150)
  const fit = await zoomOf(frame)
  const transform = () => frame.locator('svg > g').first().getAttribute('transform')

  await frame.focus()
  await page.keyboard.press('+')
  await expect.poll(() => zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)
  await page.keyboard.press('0')
  await expect.poll(() => zoomOf(frame)).toBeCloseTo(fit, 3)

  await page.keyboard.press('+')
  await expect.poll(() => zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)
  const before = await transform()
  await page.keyboard.press('Shift+ArrowRight')
  expect(await transform()).not.toBe(before)
})

test('dragging pans without any DOM change, and the mouse wheel zooms', async ({ page }) => {
  const { frame } = await openWithFixture(page, 15)
  const world = frame.locator('svg > g').first()
  await page.evaluate(() => {
    const w = window as unknown as { __mutations: number }
    w.__mutations = 0
    new MutationObserver((records) => {
      w.__mutations += records.length
    }).observe(document.querySelector('svg')!, { childList: true, subtree: true })
  })

  const before = await world.getAttribute('transform')
  const box = (await frame.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 15; i++) await page.mouse.move(x + i * 2, y + i)
  await page.mouse.up()
  await page.waitForTimeout(100)

  expect(await world.getAttribute('transform')).not.toBe(before)
  expect(await page.evaluate(() => (window as unknown as { __mutations: number }).__mutations)).toBe(0)

  const zoom = await zoomOf(frame)
  await page.mouse.wheel(0, -300)
  await expect.poll(() => zoomOf(frame)).toBeGreaterThan(zoom)
})

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' })

  test('view changes jump instead of animating', async ({ page }) => {
    const { frame } = await openWithFixture(page, 150)
    const fit = await zoomOf(frame)
    await frame.focus()
    await page.keyboard.press('+')
    // no polling: the new zoom is there as soon as the key press has been handled
    expect(await zoomOf(frame)).toBeCloseTo(fit * 1.25, 3)
    await page.getByRole('button', { name: words('tree.fit') }).click()
    expect(await zoomOf(frame)).toBeCloseTo(fit, 3)
  })
})

for (const size of [15, 150]) {
  test(`${size} people: no axe violations`, async ({ page }) => {
    await openWithFixture(page, size)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations).toEqual([])
  })
}

test('full detail: no axe violations when zoomed in on names and dates', async ({ page }) => {
  const { frame } = await openWithFixture(page, 500)
  await expect(frame.locator('text').first()).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
