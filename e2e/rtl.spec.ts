import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../src/domain/tree.ts'
import { generateTree } from '../src/layout/fixtures.ts'
import { frame, openPerson, panel, personButton } from './helpers.ts'
import { openWithTree } from './seed.ts'

/**
 * Right-to-left (spec section 13.2). Arabic is not offered yet, so the page is made to read right to left by setting
 * `dir` on it, which is all the layout depends on; the key swap, which follows the Language, is a unit test.
 */
const readRightToLeft = (page: Page, dir: 'rtl' | 'ltr' = 'rtl') =>
  page.evaluate((value) => document.documentElement.setAttribute('dir', value), dir)

const centreOf = async (locator: ReturnType<Page['locator']>) => {
  const box = (await locator.boundingBox())!
  return box.x + box.width / 2
}

const tree = () => generateTree(12, 1)

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Karl (1) and Maria (2), and their children in the order they were added: Ben (3, the Focus person), Anna (4), Zoe (5). */
function threeSiblings(): Tree {
  let family = ['Karl', 'Maria', 'Ben', 'Anna', 'Zoe'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  for (const child of [3, 4, 5]) family = addParentLink(addParentLink(family, id(child), id(1)), id(child), id(2))
  return { ...family, focusPersonId: id(3) }
}

test.describe('desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } })

  test('the zoom controls sit on the end side: the right in English, the left when reading right to left', async ({ page }) => {
    await openWithTree(page, tree())
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    expect(await centreOf(zoomIn)).toBeGreaterThan(640)
    await readRightToLeft(page)
    expect(await centreOf(zoomIn)).toBeLessThan(640)
  })

  test('the header reads from the right: the title is on the right and Settings on the left', async ({ page }) => {
    await openWithTree(page, tree())
    const title = page.getByRole('heading', { level: 1 })
    const settings = page.getByRole('button', { name: 'Settings' })
    expect(await centreOf(title)).toBeLessThan(await centreOf(settings))
    await readRightToLeft(page)
    expect(await centreOf(title)).toBeGreaterThan(await centreOf(settings))
  })

  test('the Person panel moves to the end side: the left when reading right to left', async ({ page }) => {
    await openWithTree(page, tree())
    await openPerson(page, 'P1')
    expect(await centreOf(panel(page))).toBeGreaterThan(640)
    await readRightToLeft(page)
    expect(await centreOf(panel(page))).toBeLessThan(640)
  })

  test('only the Undo and Redo arrows are flipped', async ({ page }) => {
    await openWithTree(page, tree())
    // Tailwind flips with the CSS `scale` property: "-1 1" is mirrored left to right, "none" is as drawn
    const scale = (name: string) =>
      page.getByRole('button', { name }).locator('svg').evaluate((svg) => getComputedStyle(svg).scale)
    expect(await scale('Undo')).toBe('none')
    await readRightToLeft(page)
    expect(await scale('Undo')).toMatch(/^-1\b/)
    expect(await scale('Redo')).toMatch(/^-1\b/)
    expect(await scale('Settings')).toBe('none')
    expect(await scale('List view')).toBe('none')
  })

  test('the tree itself is not mirrored: the same people are in the same places', async ({ page }) => {
    await openWithTree(page, tree())
    const place = () => personButton(page, 'P1').boundingBox()
    const before = await place()
    await readRightToLeft(page)
    const after = await place()
    expect(after!.x).toBeCloseTo(before!.x, 0)
    expect(after!.y).toBeCloseTo(before!.y, 0)
  })

  test('the list\'s closed triangle points the way the page reads', async ({ page }) => {
    await openWithTree(page, generateTree(60, 1))
    await page.getByRole('button', { name: 'List view' }).click()
    const glyph = () =>
      page
        .getByRole('button', { name: /^Expand / })
        .first()
        .locator('span')
        .evaluate((span) => getComputedStyle(span).scale)
    expect(await glyph()).toBe('none')
    await readRightToLeft(page)
    expect(await glyph()).toMatch(/^-1\b/)
  })

  test('a toast stays in the middle of the screen in both directions', async ({ page }) => {
    await openWithTree(page, tree())
    await openPerson(page, 'P1')
    await page.getByRole('button', { name: 'Make Focus person' }).click()
    await page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Undo' }).click()
    const toast = page.locator('div[aria-live="polite"].fixed')
    await expect(toast).toContainText('Undid:')
    expect(Math.abs((await centreOf(toast)) - 640)).toBeLessThan(2)
    await readRightToLeft(page)
    expect(Math.abs((await centreOf(toast)) - 640)).toBeLessThan(2)
  })

  test('the sibling keys follow the direction: ArrowRight is next, and under right-to-left ArrowLeft is', async ({ page }) => {
    await openWithTree(page, threeSiblings())
    await personButton(page, 'Ben').focus()
    await page.keyboard.press('ArrowRight')
    await expect(personButton(page, 'Anna')).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(personButton(page, 'Ben')).toBeFocused()
    await readRightToLeft(page)
    await page.keyboard.press('ArrowLeft')
    await expect(personButton(page, 'Anna')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(personButton(page, 'Ben')).toBeFocused()
    // Shift with an arrow pans the view whichever way the page reads: it does not move between people
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(personButton(page, 'Ben')).toBeFocused()
  })

  test('names keep their own direction (dir auto) and dates read left to right but line up with the page start', async ({ page }) => {
    await openWithTree(page, tree())
    await expect(page.getByRole('combobox', { name: 'Search people' })).toHaveAttribute('dir', 'auto')
    await openPerson(page, 'P1')
    await expect(panel(page).getByRole('heading', { level: 2 })).toHaveAttribute('dir', 'auto')
    await panel(page).getByRole('button', { name: 'Edit details' }).click()
    await expect(panel(page).getByLabel('First name')).toHaveAttribute('dir', 'auto')
    await expect(panel(page).getByLabel('Last name (optional)')).toHaveAttribute('dir', 'auto')
    for (const label of ['Born (optional)', 'Died (optional)']) {
      await expect(panel(page).getByLabel(label)).toHaveAttribute('dir', 'ltr')
    }
    // lined up with the start of the page: the field reads left to right, so that is its start when the page does too,
    // and its end (the right edge) when the page reads right to left
    const born = panel(page).getByLabel('Born (optional)')
    const alignment = () => born.evaluate((input) => getComputedStyle(input).textAlign)
    expect(await alignment()).toBe('start')
    await readRightToLeft(page)
    expect(await alignment()).toBe('end')
  })

  test('axe finds nothing when reading right to left: tree, open Person, list and Settings', async ({ page }) => {
    // axe must not sample a button halfway through its colour transition (it would read a blend, and a low contrast)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openWithTree(page, tree())
    await readRightToLeft(page)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await openPerson(page, 'P1')
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'List view' }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: 'Settings' }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('nothing runs off the screen when reading right to left, in the tree, the list or the open sheet', async ({ page }) => {
    await openWithTree(page, tree())
    await readRightToLeft(page)
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(frame(page)).toHaveCount(0) // the list is showing, not the tree
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('region', { name: 'Family list' }).getByRole('button', { name: /^P\d+ ·/ }).first().tap()
    await expect(panel(page)).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})
