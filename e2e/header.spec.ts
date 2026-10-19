import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../src/domain/tree.ts'
import { capitalise } from '../src/i18n/format.ts'
import { expect, test, words } from './fixtures.ts'
import { frame, openPerson, panel, peopleList } from './helpers.ts'
import { openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Karl (1) and Maria (2), parents of Ben (3, the Focus person). */
function family(): Tree {
  let tree = emptyTree()
  for (const [n, firstName] of [[1, 'Karl'], [2, 'Maria'], [3, 'Ben']] as const) tree = addPerson(tree, { id: id(n), firstName })
  return { ...addParentLink(addParentLink(tree, id(3), id(1)), id(3), id(2)), focusPersonId: id(3) }
}

const treeButton = (page: Page) => page.getByRole('button', { name: words('app.treeView'), exact: true })
const listButton = (page: Page) => page.getByRole('button', { name: words('app.listView'), exact: true })

test('the Tree and List views are one switch, and the open Person stays open across it', async ({ page }) => {
  await openWithTree(page, family())
  await expect(treeButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'false')
  await openPerson(page, 'Karl')

  await listButton(page).click()
  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true')
  await expect(frame(page)).toHaveCount(0)
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Karl' })).toBeVisible()
  // pressing the pressed one again changes nothing
  await listButton(page).click()
  await expect(listButton(page)).toHaveAttribute('aria-pressed', 'true')

  await treeButton(page).click()
  await expect(frame(page)).toBeVisible()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Karl' })).toBeVisible()
})

test('Add person adds a relative of the Focus person: choose how, then the details', async ({ page }) => {
  await openWithTree(page, family())
  await page.getByRole('button', { name: words('app.addPerson'), exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: new RegExp('Ben') })).toBeVisible()
  // with no kind given, the first step asks who they are to Ben
  await dialog.getByRole('radio', { name: capitalise(words('relation.child')), exact: true }).first().check()
  await dialog
    .getByRole('group', { name: words('relDialog.relation') })
    .getByRole('radio', { name: capitalise(words('relation.daughter')), exact: true })
    .check()
  await dialog.getByRole('button', { name: words('common.continue'), exact: true }).click()
  await page.getByLabel(words('fields.firstName')).fill('Mia')
  await dialog.getByRole('button', { name: words('addForm.submit', { relation: words('relation.daughter') }), exact: true }).click()

  await expect(panel(page).getByRole('heading', { level: 2, name: 'Mia' })).toBeVisible()
  await expect(peopleList(page)).toHaveCount(4)
})

test('Add person can be closed with Escape and gives the keyboard back to the button', async ({ page }) => {
  await openWithTree(page, family())
  const add = page.getByRole('button', { name: words('app.addPerson'), exact: true })
  await add.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(add).toBeFocused()
})

test('the header, the dialog and the switch pass axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openWithTree(page, family())
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: words('app.addPerson'), exact: true }).click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('the header fits, the view switch and Add person stay reachable, and nothing runs off the screen', async ({ page }) => {
    await openWithTree(page, family())
    await expect(treeButton(page)).toBeVisible()
    await expect(listButton(page)).toBeVisible()
    await expect(page.getByRole('button', { name: words('app.addPerson'), exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: words('app.settings'), exact: true })).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
