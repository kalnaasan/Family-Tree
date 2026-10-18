import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
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

  test('axe finds nothing when reading right to left: tree, open Person, list and Settings', async ({ page }) => {
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
