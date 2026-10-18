import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addPerson, emptyTree } from '../src/domain/tree.ts'
import { frame, panel, personButton } from './helpers.ts'
import { openWithFixture, openWithTree, zoomOf } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function people(): Tree {
  const names: [string, string?][] = [['José', 'Álvarez'], ['Anna', 'Müller'], ['Karl', 'Keller'], ['Maria', 'Keller'], ['Zoe']]
  return names.reduce(
    (tree, [firstName, lastName], i) => addPerson(tree, { id: id(i + 1), firstName, ...(lastName ? { lastName } : {}) }),
    emptyTree(),
  )
}

const box = (page: Page) => page.getByRole('combobox', { name: 'Search people' })
const results = (page: Page) => page.getByRole('listbox', { name: 'Search results' }).getByRole('option')

test('finds people without regard to case or accents', async ({ page }) => {
  await openWithTree(page, people())
  await box(page).fill('JOSE')
  await expect(results(page)).toHaveText([/^José Álvarez/])
  await box(page).fill('muller')
  await expect(results(page)).toHaveText([/^Anna Müller/])
  await box(page).fill('álvarez')
  await expect(results(page)).toHaveText([/^José Álvarez/])
  await box(page).fill('keller')
  await expect(results(page)).toHaveCount(2)
  await box(page).fill('nobody')
  await expect(page.getByText('No one found').first()).toBeVisible()
})

test('keyboard only: type, arrow to a result, Enter opens that Person', async ({ page }) => {
  await openWithTree(page, people())
  await box(page).focus()
  await page.keyboard.type('kel')
  await expect(results(page)).toHaveCount(2)
  await expect(box(page)).toHaveAttribute('aria-expanded', 'true')
  await page.keyboard.press('ArrowDown')
  await expect(results(page).nth(1)).toHaveAttribute('aria-selected', 'true')
  await expect(box(page)).toHaveAttribute('aria-activedescendant', (await results(page).nth(1).getAttribute('id'))!)
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Maria Keller' })).toBeFocused()
  await expect(box(page)).toHaveValue('')
})

test('Escape closes the results, and again clears the text', async ({ page }) => {
  await openWithTree(page, people())
  await box(page).focus()
  await page.keyboard.type('kel')
  await expect(results(page)).toHaveCount(2)
  await page.keyboard.press('Escape')
  await expect(box(page)).toHaveAttribute('aria-expanded', 'false')
  await expect(box(page)).toHaveValue('kel')
  await page.keyboard.press('Escape')
  await expect(box(page)).toHaveValue('')
})

test('picking a far-away Person pans to them and keeps the zoom', async ({ page }) => {
  await openWithFixture(page, 300) // a big Tree opens on the Focus person at a readable zoom
  const zoom = await zoomOf(frame(page))
  await box(page).fill('P250')
  await results(page).first().click()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'P250' })).toBeVisible()
  const area = (await frame(page).boundingBox())!
  await expect
    .poll(async () => {
      const at = (await personButton(page, 'P250').boundingBox())!
      return Math.hypot(at.x + at.width / 2 - (area.x + area.width / 2), at.y + at.height / 2 - (area.y + area.height / 2))
    })
    .toBeLessThan(60)
  expect(await zoomOf(frame(page))).toBeCloseTo(zoom, 4)
})

test('the List view filters instead of popping up results', async ({ page }) => {
  await openWithTree(page, people())
  await page.getByRole('button', { name: 'List view' }).click()
  const search = page.getByRole('searchbox', { name: 'Search people' })
  const list = page.getByRole('region', { name: 'Family list' })
  await expect(list.getByRole('button')).toHaveCount(5)
  await search.fill('kel')
  await expect(list.getByRole('button')).toHaveText([/^Karl Keller/, /^Maria Keller/])
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await list.getByRole('button', { name: /^Maria Keller/ }).click()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Maria Keller' })).toBeVisible()
  await search.fill('qqq')
  await expect(list.getByText(/No one matches/)).toBeVisible()
  await search.fill('')
  await expect(list.getByRole('button')).toHaveCount(5)
})

test('axe finds nothing with the results open, in the tree and in the list', async ({ page }) => {
  // axe must not sample the List view button halfway through its colour transition (a blend reads as low contrast)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWithTree(page, people())
  await box(page).fill('kel')
  await expect(results(page)).toHaveCount(2)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await box(page).fill('')
  await page.getByRole('button', { name: 'List view' }).click()
  await page.getByRole('searchbox', { name: 'Search people' }).fill('kel')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('tap the box, type, tap a result: the Person opens in the sheet, in view above it', async ({ page }) => {
    await openWithTree(page, people())
    await box(page).tap()
    await box(page).fill('maria')
    await results(page).first().tap()
    await expect(panel(page).getByRole('heading', { level: 2, name: 'Maria Keller' })).toBeVisible()
    const sheet = (await panel(page).boundingBox())!
    await expect.poll(async () => (await personButton(page, 'Maria Keller').boundingBox())!.y + 70).toBeLessThan(sheet.y)
    // the results are big enough to tap
    await box(page).fill('kel')
    for (const option of await results(page).all()) expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  })
})
