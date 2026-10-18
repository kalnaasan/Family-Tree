import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../src/domain/tree.ts'
import { generateTree } from '../src/layout/fixtures.ts'
import { displayName } from '../src/view/text.ts'
import { expect, test, words } from './fixtures.ts'
import { frame, openPerson, panel, personButton } from './helpers.ts'
import { openWithTree } from './seed.ts'

/**
 * Right-to-left with real Arabic (spec sections 13.2 and 13.7): the checks of `rtl.spec.ts`, which makes an English page
 * read right to left by hand, repeated here with the Language set to Arabic, so the Arabic text, the longer strings and
 * whatever the Language store does on a switch are exercised together. Runs in the Arabic projects only.
 */
const centreOf = async (locator: ReturnType<Page['locator']>) => {
  const box = (await locator.boundingBox())!
  return box.x + box.width / 2
}

/** Twelve people with Arabic first and last names, so the Arabic text and mixed lines are the ones drawn. */
const tree = () => generateTree(12, 1, { names: 'arabic' })
const first = () => displayName(tree().persons[0]!)

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

  test('the page is Arabic and reads right to left', async ({ page }) => {
    await openWithTree(page, tree())
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  })

  test('the zoom controls sit on the end side, the left', async ({ page }) => {
    await openWithTree(page, tree())
    expect(await centreOf(page.getByRole('button', { name: words('tree.zoomIn') }))).toBeLessThan(640)
  })

  test('the header reads from the right: the title is on the right and Settings on the left', async ({ page }) => {
    await openWithTree(page, tree())
    const title = page.getByRole('heading', { level: 1 })
    const settings = page.getByRole('button', { name: words('app.settings') })
    expect(await centreOf(title)).toBeGreaterThan(await centreOf(settings))
  })

  test('the Person panel is on the end side, the left', async ({ page }) => {
    await openWithTree(page, tree())
    await openPerson(page, first())
    expect(await centreOf(panel(page))).toBeLessThan(640)
  })

  test('only the Undo and Redo arrows are flipped', async ({ page }) => {
    await openWithTree(page, tree())
    const scale = (name: string) =>
      page
        .getByRole('button', { name })
        .locator('svg')
        .evaluate((svg) => getComputedStyle(svg).scale)
    expect(await scale(words('history.undo'))).toMatch(/^-1\b/)
    expect(await scale(words('history.redo'))).toMatch(/^-1\b/)
    expect(await scale(words('app.settings'))).toBe('none')
    expect(await scale(words('app.listView'))).toBe('none')
  })

  test("the list's closed triangle points the way the page reads", async ({ page }) => {
    await openWithTree(page, generateTree(60, 1))
    await page.getByRole('button', { name: words('app.listView') }).click()
    const glyph = page
      .getByRole('region', { name: words('list.title') })
      .getByRole('button', { expanded: false })
      .first()
      .locator('span')
    expect(await glyph.evaluate((span) => getComputedStyle(span).scale)).toMatch(/^-1\b/)
  })

  test('a toast stays in the middle of the screen', async ({ page }) => {
    await openWithTree(page, tree())
    await openPerson(page, first())
    await page.getByRole('button', { name: words('panel.makeFocus') }).click()
    await page
      .getByRole('group', { name: words('history.group') })
      .getByRole('button', { name: words('history.undo') })
      .click()
    const toast = page.locator('div[aria-live="polite"].fixed')
    await expect(toast).toContainText(words('toast.undid', { what: '' }).trim())
    expect(Math.abs((await centreOf(toast)) - 640)).toBeLessThan(2)
  })

  test('the sibling keys are swapped: ArrowLeft is next and ArrowRight is previous', async ({ page }) => {
    await openWithTree(page, threeSiblings())
    await personButton(page, 'Ben').focus()
    await page.keyboard.press('ArrowLeft')
    await expect(personButton(page, 'Anna')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(personButton(page, 'Ben')).toBeFocused()
    // Shift with an arrow pans the view whichever way the page reads: it does not move between people
    await page.keyboard.press('Shift+ArrowLeft')
    await expect(personButton(page, 'Ben')).toBeFocused()
  })

  test('names keep their own direction (dir auto), dates read left to right and line up with the page start', async ({
    page,
  }) => {
    await openWithTree(page, tree())
    await expect(page.getByRole('combobox', { name: words('search.label') })).toHaveAttribute('dir', 'auto')
    await openPerson(page, first())
    await expect(panel(page).getByRole('heading', { level: 2 })).toHaveAttribute('dir', 'auto')
    await panel(page)
      .getByRole('button', { name: words('panel.edit') })
      .click()
    await expect(panel(page).getByLabel(words('fields.firstName'))).toHaveAttribute('dir', 'auto')
    await expect(panel(page).getByLabel(words('fields.lastName'))).toHaveAttribute('dir', 'auto')
    for (const label of [words('fields.born'), words('fields.died')]) {
      await expect(panel(page).getByLabel(label)).toHaveAttribute('dir', 'ltr')
    }
    const born = panel(page).getByLabel(words('fields.born'))
    expect(await born.evaluate((input) => getComputedStyle(input).textAlign)).toBe('end')
  })

  test('axe finds nothing in Arabic: tree, open Person, list and Settings', async ({ page }) => {
    // axe must not sample a button halfway through its colour transition (it would read a blend, and a low contrast)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openWithTree(page, tree())
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await openPerson(page, first())
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: words('app.listView') }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await page.getByRole('button', { name: words('app.settings') }).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  })
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('nothing runs off the screen in Arabic, in the tree, the list or the open sheet', async ({ page }) => {
    await openWithTree(page, tree())
    const overflow = () =>
      page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page.getByRole('button', { name: words('app.listView') }).click()
    await expect(frame(page)).toHaveCount(0) // the list is showing, not the tree
    expect(await overflow()).toBeLessThanOrEqual(0)
    await page
      .getByRole('region', { name: words('list.title') })
      .getByRole('button', { name: / · / })
      .first()
      .tap()
    await expect(panel(page)).toBeVisible()
    expect(await overflow()).toBeLessThanOrEqual(0)
  })
})
