import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Ben (1) with birth parents Karl (2) and Maria (3), and a current partner Eva (4). */
function family(): Tree {
  let tree = ['Ben', 'Karl', 'Maria', 'Eva'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  tree = addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
  return addPartnership(tree, { personIds: [id(1), id(4)], status: 'current' })
}

const peopleList = (page: Page) => page.getByRole('list', { name: 'People' }).getByRole('listitem')
const panel = (page: Page) => page.getByRole('complementary', { name: 'Person details' })
const group = (page: Page, name: string) => panel(page).getByRole('region', { name })
const undoButton = (page: Page) => page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Undo' })
const redoButton = (page: Page) => page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Redo' })

async function openPerson(page: Page, name: string) {
  await page.getByRole('list', { name: 'People' }).getByRole('button', { name, exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2, name })).toBeFocused()
}

test('undo of an add-relative takes the whole flow back, redo returns it', async ({ page }) => {
  await openWithTree(page, family())
  await expect(undoButton(page)).toBeDisabled()
  await openPerson(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Add sister' }).click()
  await page.getByLabel('First name').fill('Anna')
  await page.getByRole('radio', { name: 'Only Karl (half-sibling)' }).check()
  await page.getByRole('button', { name: 'Add sister' }).click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Anna'])

  await undoButton(page).click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
  await expect(page.getByText('Undid: Add sister')).toBeVisible()
  await expect(panel(page)).toHaveCount(0) // the open Person was Anna

  await redoButton(page).click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Anna'])
  await expect(redoButton(page)).toBeDisabled()
})

test('Ctrl+Z and Ctrl+Shift+Z work from the keyboard, and not inside a text field', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Karl')
  const makeFocus = panel(page).getByRole('button', { name: 'Make Focus person' })
  await makeFocus.click()
  await expect(makeFocus).toHaveCount(0) // Karl is the Focus person now

  await page.getByRole('group', { name: 'Family tree' }).focus()
  await page.keyboard.press('Control+z')
  await expect(page.getByText('Undid: Change Focus person')).toBeVisible()
  await expect(makeFocus).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByText('Redid: Change Focus person')).toBeVisible()
  await expect(makeFocus).toHaveCount(0)

  // in a text field the app leaves Ctrl+Z to the field
  await panel(page).getByRole('button', { name: 'Edit details' }).click()
  await page.getByLabel('First name').fill('Karlchen')
  await page.keyboard.press('Control+z')
  await expect(page.getByLabel('First name')).toBeVisible()
  await expect(page.getByText(/^Undid:/)).toHaveCount(0)
})

test('undo of a delete restores the Person, their links and Partnership', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Delete Ben' }).click()
  await expect(page.getByText('Deleted Ben, with 2 parent links and 1 partnership')).toBeVisible()
  await expect(peopleList(page)).toHaveText(['Karl', 'Maria', 'Eva'])

  await page.getByRole('button', { name: 'Undo' }).last().click() // the toast's own Undo
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
  await openPerson(page, 'Ben')
  await expect(group(page, 'Parents')).toContainText('Karl')
  await expect(group(page, 'Parents')).toContainText('Maria')
  await expect(group(page, 'Partners')).toContainText('Eva')
})

test('the delete toast lasts about 8 seconds and loses its Undo after another change', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Eva')
  await panel(page).getByRole('button', { name: 'Delete Eva' }).click()
  const toast = page.getByText(/^Deleted Eva/)
  await expect(toast).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(2)

  await openPerson(page, 'Karl')
  await panel(page).getByRole('button', { name: 'Make Focus person' }).click()
  await expect(page.getByRole('button', { name: 'Undo' })).toHaveCount(1) // only the toolbar's
  await expect(toast).toBeVisible()

  await expect(toast).toBeHidden({ timeout: 10_000 })
})

test('history is memory only: a reload starts with nothing to undo', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Add son' }).click()
  await page.getByLabel('First name').fill('Leo')
  await page.getByRole('radio', { name: 'Nobody / not recorded' }).check()
  await page.getByRole('button', { name: 'Add son' }).click()
  await expect(undoButton(page)).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText('Saved')

  await page.reload()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Leo'])
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()
})

test('an undo is saved: after Undo and a reload the Person is still gone', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Add son' }).click()
  await page.getByLabel('First name').fill('Leo')
  await page.getByRole('radio', { name: 'Nobody / not recorded' }).check()
  await page.getByRole('button', { name: 'Add son' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await undoButton(page).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
})

test('the history controls and the toast pass axe', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page).getByRole('button', { name: 'Delete Ben' }).click()
  await expect(page.getByText(/^Deleted Ben/)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
