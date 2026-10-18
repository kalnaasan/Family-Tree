import AxeBuilder from '@axe-core/playwright'
import type { CDPSession, Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, test, words } from './fixtures.ts'
import { addButton, frame, panel, personButton } from './helpers.ts'
import { openWithFixture, openWithTree, zoomOf } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Ben (1) with parents Karl (2) and Maria (3) and partner Eva (4); Olaf (5) is no relative of Ben. */
function family(): Tree {
  let tree = ['Ben', 'Karl', 'Maria', 'Eva', 'Olaf'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  tree = addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
  return addPartnership(tree, { personIds: [id(1), id(4)], status: 'current' })
}

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const centre = async (locator: ReturnType<Page['locator']>) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const tapOn = async (page: Page, locator: ReturnType<Page['locator']>) => {
  const at = await centre(locator)
  await page.touchscreen.tap(at.x, at.y)
}

/** Real finger movements, which `page.touchscreen` cannot do: only Chromium has the protocol for them. */
class Fingers {
  private readonly cdp: CDPSession
  private constructor(cdp: CDPSession) {
    this.cdp = cdp
  }
  static async on(page: Page) {
    return new Fingers(await page.context().newCDPSession(page))
  }
  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) {
    return this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: i + 1 })),
    })
  }
  async drag(from: { x: number; y: number }, to: { x: number; y: number }) {
    await this.send('touchStart', [from])
    for (let step = 1; step <= 6; step++) {
      await this.send('touchMove', [
        { x: from.x + ((to.x - from.x) * step) / 6, y: from.y + ((to.y - from.y) * step) / 6 },
      ])
    }
    await this.send('touchEnd', [])
  }
  /** Two fingers either side of `middle`, `from` px apart, ending `to` px apart. */
  async pinch(middle: { x: number; y: number }, from: number, to: number) {
    const at = (gap: number) => [
      { x: middle.x - gap / 2, y: middle.y },
      { x: middle.x + gap / 2, y: middle.y },
    ]
    await this.send('touchStart', at(from))
    for (let step = 1; step <= 8; step++) await this.send('touchMove', at(from + ((to - from) * step) / 8))
    await this.send('touchEnd', [])
  }
}

test.beforeEach(({ browserName }, info) => {
  // dragging and pinching need Chromium's touch protocol; taps run everywhere
  if (info.title.includes('[fingers]')) test.skip(browserName !== 'chromium', 'needs the Chromium touch protocol')
})

test('a tap opens a short peek with the name, Add relative and Details, and the Person stays above it', async ({
  page,
}) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Ben' })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: words('panel.addRelative') })).toBeVisible()
  await expect(panel(page).getByRole('button', { name: words('panel.details') })).toBeVisible()
  await expect(addButton(panel(page), 'relation.father')).toHaveCount(0) // the details are not open

  const sheet = (await panel(page).boundingBox())!
  expect(sheet.height).toBeLessThan(190) // about 150 px
  await expect.poll(async () => (await personButton(page, 'Ben').boundingBox())!.y + 70).toBeLessThan(sheet.y)
})

test('tapping empty space dismisses the sheet', async ({ page }) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await expect(panel(page)).toBeVisible()
  const box = (await frame(page).boundingBox())!
  await page.touchscreen.tap(box.x + 20, box.y + box.height * 0.6)
  await expect(panel(page)).toHaveCount(0)
})

test('Details expands the sheet to about 62% and the view keeps the Person clear of it', async ({ page }) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await panel(page)
    .getByRole('button', { name: words('panel.details') })
    .tap()
  await expect(panel(page).getByRole('heading', { level: 3, name: words('panel.group.parents') })).toBeVisible()
  const sheet = (await panel(page).boundingBox())!
  expect(sheet.height).toBeGreaterThan(844 * 0.55)
  expect(sheet.height).toBeLessThan(844 * 0.7)
  await expect.poll(async () => (await personButton(page, 'Ben').boundingBox())!.y + 70).toBeLessThan(sheet.y)
})

test('the handle toggles the sheet, and Add relative opens the details at the first Add button', async ({ page }) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await panel(page)
    .getByRole('button', { name: words('panel.expandSheet') })
    .tap()
  await expect(panel(page).getByRole('button', { name: words('panel.collapseSheet') })).toBeVisible()
  await panel(page)
    .getByRole('button', { name: words('panel.collapseSheet') })
    .tap()
  await expect(panel(page).getByRole('button', { name: words('panel.addRelative') })).toBeVisible()
  await panel(page)
    .getByRole('button', { name: words('panel.addRelative') })
    .tap()
  await expect(addButton(panel(page), 'relation.father')).toBeFocused()
})

test('relatives stay bright and everyone else dims', async ({ page }) => {
  await openWithTree(page, family())
  const opacity = (name: string) =>
    personButton(page, name).locator('xpath=ancestor::*[@data-person-wrapper]').getAttribute('opacity')
  expect(await opacity('Olaf')).toBeNull()
  await tapOn(page, personButton(page, 'Ben'))
  await expect(panel(page)).toBeVisible()
  for (const relative of ['Ben', 'Karl', 'Maria', 'Eva']) expect(await opacity(relative)).toBeNull()
  expect(await opacity('Olaf')).toBe('0.35')
})

test('a chip in the details jumps to a relative and keeps the zoom', async ({ page }) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await panel(page)
    .getByRole('button', { name: words('panel.details') })
    .tap()
  const zoom = await zoomOf(frame(page))
  await panel(page).getByRole('button', { name: /^Karl/ }).tap()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Karl' })).toBeVisible()
  expect(await zoomOf(frame(page))).toBeCloseTo(zoom, 3)
})

test('the zoom, fit and Focus buttons are at least 44 px', async ({ page }) => {
  await openWithTree(page, family())
  for (const name of [words('tree.zoomIn'), words('tree.zoomOut'), words('tree.fit'), words('tree.backToFocus')]) {
    const box = (await frame(page).getByRole('button', { name }).boundingBox())!
    expect(box.width, name).toBeGreaterThanOrEqual(44)
    expect(box.height, name).toBeGreaterThanOrEqual(44)
  }
})

test('only the canvas turns off native touch gestures', async ({ page }) => {
  await openWithTree(page, family())
  const touchAction = (selector: string) =>
    page.evaluate((s) => getComputedStyle(document.querySelector(s)!).touchAction, selector)
  expect(await touchAction('[data-tree-frame] > div')).toBe('none')
  for (const selector of ['body', 'main', 'header']) expect(await touchAction(selector)).toBe('auto')
  await tapOn(page, personButton(page, 'Ben'))
  expect(await touchAction('aside')).toBe('auto')
})

test('a double-tap zooms in about the tap to a readable size, and another zooms back out to the whole tree', async ({
  page,
}) => {
  await openWithTree(page, family())
  const whole = await zoomOf(frame(page))
  expect(whole).toBeLessThan(0.8) // on a phone the whole tree is shown small
  const box = (await frame(page).boundingBox())!
  const doubleTap = async () => {
    await page.touchscreen.tap(box.x + 60, box.y + 60)
    await page.touchscreen.tap(box.x + 60, box.y + 60)
  }
  await doubleTap()
  await expect.poll(() => zoomOf(frame(page))).toBeCloseTo(0.8, 2)
  await doubleTap()
  await expect.poll(() => zoomOf(frame(page))).toBeCloseTo(whole, 2)
})

test('[fingers] one finger drags the tree', async ({ page }) => {
  await openWithTree(page, family())
  const fingers = await Fingers.on(page)
  const before = (await personButton(page, 'Ben').boundingBox())!
  const box = (await frame(page).boundingBox())!
  await fingers.drag({ x: box.x + 60, y: box.y + 100 }, { x: box.x + 160, y: box.y + 160 })
  await expect.poll(async () => (await personButton(page, 'Ben').boundingBox())!.x).toBeGreaterThan(before.x + 80)
  expect((await personButton(page, 'Ben').boundingBox())!.y).toBeGreaterThan(before.y + 40)
  await expect(panel(page)).toHaveCount(0) // a drag is not a tap
})

test('[fingers] a small wobble under the tap slop still opens the Person', async ({ page }) => {
  await openWithTree(page, family())
  const fingers = await Fingers.on(page)
  const at = await centre(personButton(page, 'Ben'))
  await fingers.drag(at, { x: at.x + 5, y: at.y + 3 })
  await expect(panel(page)).toBeVisible()
})

test('[fingers] spreading two fingers zooms in, pinching them together zooms out', async ({ page }) => {
  await openWithTree(page, family())
  const fingers = await Fingers.on(page)
  await page.getByRole('button', { name: words('tree.zoomOut') }).tap()
  await page.getByRole('button', { name: words('tree.zoomOut') }).tap()
  const start = await zoomOf(frame(page))
  const box = (await frame(page).boundingBox())!
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await fingers.pinch(middle, 60, 180)
  await expect.poll(() => zoomOf(frame(page))).toBeGreaterThan(start * 2)
  const zoomed = await zoomOf(frame(page))
  await fingers.pinch(middle, 180, 60)
  await expect.poll(() => zoomOf(frame(page))).toBeLessThan(zoomed / 2)
  await expect(panel(page)).toHaveCount(0) // a pinch is not a tap
})

test('[fingers] swiping the handle up expands the sheet, swiping down peeks, and again dismisses', async ({ page }) => {
  await openWithTree(page, family())
  const fingers = await Fingers.on(page)
  await tapOn(page, personButton(page, 'Ben'))
  const handle = await centre(panel(page).getByRole('button', { name: words('panel.expandSheet') }))
  await fingers.drag(handle, { x: handle.x, y: handle.y - 120 })
  await expect(panel(page).getByRole('heading', { level: 3, name: words('panel.group.parents') })).toBeVisible()

  const expanded = await centre(panel(page).getByRole('button', { name: words('panel.collapseSheet') }))
  await fingers.drag(expanded, { x: expanded.x, y: expanded.y + 120 })
  await expect(panel(page).getByRole('button', { name: words('panel.details') })).toBeVisible()

  const peek = await centre(panel(page).getByRole('button', { name: words('panel.expandSheet') }))
  await fingers.drag(peek, { x: peek.x, y: peek.y + 120 })
  await expect(panel(page)).toHaveCount(0)
})

test('at the "dot" level a tap near a Person opens them and a tap in empty space zooms in toward it', async ({
  page,
}) => {
  await openWithFixture(page, 400)
  await page.getByRole('button', { name: words('tree.fit') }).tap()
  await expect(frame(page)).toHaveAttribute('data-lod', 'dot')
  const box = (await frame(page).boundingBox())!

  const zoom = await zoomOf(frame(page))
  await page.touchscreen.tap(box.x + 4, box.y + 4) // the far corner of the screen: nobody within reach
  await expect.poll(() => zoomOf(frame(page))).toBeGreaterThan(zoom * 2)
  await expect(panel(page)).toHaveCount(0)

  await page.getByRole('button', { name: words('tree.fit') }).tap()
  await expect(frame(page)).toHaveAttribute('data-lod', 'dot')
  // the dot nearest the middle of the screen: one at the edge can sit under a floating control (they swap sides in Arabic)
  const dots = await frame(page).locator('[data-person-id]').all()
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  let at = await centre(dots[0]!)
  for (const dot of dots) {
    const here = await centre(dot)
    if (Math.hypot(here.x - middle.x, here.y - middle.y) < Math.hypot(at.x - middle.x, at.y - middle.y)) at = here
  }
  await page.touchscreen.tap(at.x + 6, at.y + 6) // a finger that is not quite on the dot
  await expect(panel(page)).toBeVisible()
})

test('axe finds nothing with the sheet at its peek or expanded', async ({ page }) => {
  await openWithTree(page, family())
  await tapOn(page, personButton(page, 'Ben'))
  await expect(panel(page)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await panel(page)
    .getByRole('button', { name: words('panel.details') })
    .tap()
  await expect(panel(page).getByRole('heading', { level: 3, name: words('panel.group.parents') })).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
