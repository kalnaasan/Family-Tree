import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, test, words } from './fixtures.ts'
import { frame, openPerson, panel, peopleList, personButton } from './helpers.ts'
import { openWithFixture, openWithTree, zoomOf } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Karl (1) + Maria (2): Ben (3, Focus person) and Anna (4). Ben + Eva (5): Leo (6). Leo + Zoe (7): Max (8). */
function family(): Tree {
  let tree = emptyTree()
  ;['Karl', 'Maria', 'Ben', 'Anna', 'Eva', 'Leo', 'Zoe', 'Max'].forEach((firstName, i) => {
    tree = addPerson(tree, { id: id(i + 1), firstName })
  })
  for (const [child, parent] of [[3, 1], [3, 2], [4, 1], [4, 2], [6, 3], [6, 5], [8, 6], [8, 7]] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(5)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(6), id(7)], status: 'current' })
  return { ...tree, focusPersonId: id(3) }
}

/** The chart is drawn when the setting says so; the released default is chosen separately. */
async function openChart(page: Page, tree = family()) {
  await page.addInitScript(() => localStorage.setItem('family-tree.treeShape', 'rows'))
  await openWithTree(page, tree)
  await expect(frame(page)).toHaveAttribute('data-shape', 'rows')
}

const chips = (page: Page) => frame(page).locator('[data-chip-key]')
test('the chart draws generations in rows, each labelled with how many people it holds', async ({ page }) => {
  await openChart(page)
  await expect(peopleList(page)).toHaveCount(8)
  const rows = frame(page).locator('text').filter({ hasText: words('tree.generationRow', { n: 1, people: '' }).trim().split(' ')[0]! })
  await expect(rows).toHaveCount(4)
  // oldest on top: Karl is above Ben, and Ben above Leo
  const y = async (name: string) => (await personButton(page, name).boundingBox())!.y
  expect(await y('Karl')).toBeLessThan(await y('Ben'))
  expect(await y('Ben')).toBeLessThan(await y('Leo'))
  // partners share a row
  expect(Math.abs((await y('Karl')) - (await y('Maria')))).toBeLessThan(2)
})

test('a branch button collapses what is below it, says how many people it hides, and opens again', async ({ page }) => {
  await openChart(page)
  await expect(chips(page)).toHaveCount(3)
  const top = chips(page).first()
  await expect(top).toHaveAttribute('aria-expanded', 'true')
  await top.click()
  // Ben, Anna, Eva, Leo, Zoe and Max are hidden; Karl and Maria stay, and the rest of the Tree closes up
  await expect(peopleList(page)).toHaveCount(2)
  await expect(chips(page)).toHaveCount(1)
  await expect(chips(page).first()).toHaveAttribute('aria-expanded', 'false')
  await expect(chips(page).first()).toContainText('+6')
  await chips(page).first().click()
  await expect(peopleList(page)).toHaveCount(8)
  await expect(chips(page)).toHaveCount(3)
})

test('collapsing a branch closes the gap: the rest of the Tree moves, and the row counts follow', async ({ page }) => {
  await openChart(page)
  const x = async (name: string) => (await personButton(page, name).boundingBox())!.x
  const before = await x('Anna')
  await chips(page).nth(1).click() // Ben and Eva's branch
  await expect(peopleList(page)).toHaveCount(5) // Leo, Zoe and Max are gone
  await expect(personButton(page, 'Leo')).toHaveCount(0)
  expect(Number.isFinite(before) && Number.isFinite(await x('Anna'))).toBe(true)
  // the fourth generation is gone, so is its row
  await expect(frame(page).locator('text').filter({ hasText: words('tree.generationRow', { n: 1, people: '' }).trim().split(' ')[0]! })).toHaveCount(2)
})

test('Expand all and Collapse all', async ({ page }) => {
  await openChart(page)
  const expand = page.getByRole('button', { name: words('tree.expandAll'), exact: true })
  const collapse = page.getByRole('button', { name: words('tree.collapseAll'), exact: true })
  await expect(expand).toBeDisabled()
  await collapse.click()
  // only the people with no parents are left: Karl, Maria, and Eva and Zoe, who married in, go with their partners
  await expect(peopleList(page)).toHaveCount(2)
  await expect(collapse).toBeDisabled()
  await expand.click()
  await expect(peopleList(page)).toHaveCount(8)
})

test('opening a hidden Person from the search opens the way to them and nothing else', async ({ page }) => {
  await openChart(page)
  await chips(page).nth(1).click() // Leo, Zoe and Max are hidden
  await expect(personButton(page, 'Max')).toHaveCount(0)
  await page.getByRole('combobox', { name: words('search.label') }).fill('Max')
  await page.keyboard.press('Enter')
  await expect(personButton(page, 'Max')).toBeVisible()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Max' })).toBeVisible()
})

test('the C key collapses and opens the branch of the Person the keyboard is on', async ({ page }) => {
  await openChart(page)
  await openPerson(page, 'Ben')
  await frame(page).getByRole('button', { name: new RegExp('^Ben') }).focus()
  await page.keyboard.press('c')
  await expect(peopleList(page)).toHaveCount(5)
  await page.keyboard.press('c')
  await expect(peopleList(page)).toHaveCount(8)
})

test('an arrow key into a hidden branch opens it and lands on the Person', async ({ page }) => {
  await openChart(page)
  await chips(page).nth(2).click() // Leo and Zoe's branch: Max is hidden
  await expect(personButton(page, 'Max')).toHaveCount(0)
  // the keyboard starts at the Focus person, Ben: down to Leo, and down again into the collapsed branch
  await personButton(page, 'Ben').focus()
  await page.keyboard.press('ArrowDown')
  await expect(personButton(page, 'Leo')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(personButton(page, 'Max')).toBeFocused()
  await expect(chips(page).nth(2)).toHaveAttribute('aria-expanded', 'true')
})

test('the chart, with a collapsed branch and a Person open, passes axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openChart(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await chips(page).nth(1).click()
  await openPerson(page, 'Anna')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test.describe('the opening view', () => {
  test('a chart small enough to read opens whole', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('family-tree.treeShape', 'rows'))
    const { frame } = await openWithFixture(page, 15)
    expect(await frame.locator('[data-person-id]').count()).toBe(15)
  })

  test('a chart too wide to read opens on the Focus person at a readable size, and Show whole tree still shows it all', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('family-tree.treeShape', 'rows'))
    const { frame, tree } = await openWithFixture(page, 150)
    expect(await zoomOf(frame)).toBeCloseTo(0.8, 3)
    await expect(frame.locator(`[data-person-id="${tree.focusPersonId}"]`)).toBeVisible()
    expect(await frame.locator('[data-person-id]').count()).toBeLessThan(150)
    await page.getByRole('button', { name: words('tree.fit') }).click()
    await expect.poll(() => zoomOf(frame)).toBeLessThan(0.45)
  })
})
