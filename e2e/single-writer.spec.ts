import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addPerson, emptyTree } from '../src/domain/tree.ts'
import { openPerson, panel, personButton } from './helpers.ts'
import { openWithTree } from './seed.ts'

const ANNA = '00000000-0000-4000-8000-000000000001'
const BEN = '00000000-0000-4000-8000-000000000002'

function pair(): Tree {
  let tree = emptyTree()
  tree = addPerson(tree, { id: ANNA, firstName: 'Anna' })
  tree = addPerson(tree, { id: BEN, firstName: 'Ben' })
  return tree
}

const banner = (page: Page) => page.getByText(/Read-only: this tree is being edited in another tab/)
const takeOverButton = (page: Page) => page.getByRole('button', { name: 'Take over editing' })

/** Two tabs of the same browser on the same Tree: the first one edits. */
async function twoTabs(firstTab: Page) {
  const first = firstTab
  await openWithTree(first, pair())
  const second = await first.context().newPage()
  await second.goto('/')
  await expect(personButton(second, 'Anna')).toBeVisible()
  return { first, second }
}

test('the second tab is read-only: it cannot change anything', async ({ page }) => {
  const { first, second } = await twoTabs(page)

  await expect(banner(second)).toBeVisible()
  await expect(takeOverButton(second)).toBeVisible()
  await expect(banner(first)).toHaveCount(0)

  // the editing tab keeps its controls, the other one has none
  await openPerson(first, 'Anna')
  await expect(panel(first).getByRole('button', { name: 'Edit details' })).toBeVisible()

  await openPerson(second, 'Anna')
  await expect(panel(second).getByRole('button', { name: 'Edit details' })).toHaveCount(0)
  await expect(panel(second).getByRole('button', { name: 'Delete Anna' })).toHaveCount(0)
  await expect(panel(second).getByRole('button', { name: 'Add father' })).toHaveCount(0)
  await expect(second.getByRole('button', { name: 'Undo' })).toBeDisabled()
  await expect(second.getByRole('status')).toHaveText('Read-only')

  // keyboard undo does nothing either
  await second.keyboard.press('Control+z')
  await expect(personButton(second, 'Anna')).toBeVisible()
})

test('reloading the read-only tab shows what the editing tab saved, and it stays read-only', async ({ page }) => {
  const { first, second } = await twoTabs(page)
  await openPerson(first, 'Anna')
  await first.getByRole('button', { name: 'Edit details' }).click()
  await first.getByLabel('First name').fill('Anna-Lena')
  await first.getByRole('button', { name: 'Save' }).click()
  await expect(first.getByRole('status')).toHaveText('Saved')

  // a reload of the read-only tab shows what the editing tab saved, and is still read-only
  await second.reload()
  await expect(personButton(second, 'Anna-Lena')).toBeVisible()
  await expect(banner(second)).toBeVisible()
})

test('taking over flips the roles', async ({ page }) => {
  const { first, second } = await twoTabs(page)

  // an edit in the first tab that the second tab does not show (no live sync)
  await openPerson(first, 'Ben')
  await first.getByRole('button', { name: 'Edit details' }).click()
  await first.getByLabel('First name').fill('Benno')
  await first.getByRole('button', { name: 'Save' }).click()
  await expect(personButton(second, 'Ben')).toBeVisible()

  await takeOverButton(second).click()

  // the second tab edits now, with the latest saved Tree
  await expect(banner(second)).toHaveCount(0)
  await expect(personButton(second, 'Benno')).toBeVisible()
  await openPerson(second, 'Anna')
  await expect(panel(second).getByRole('button', { name: 'Edit details' })).toBeVisible()

  // and the first tab only looks
  await expect(banner(first)).toBeVisible()
  await expect(takeOverButton(first)).toBeVisible()
  await expect(first.getByRole('status')).toHaveText('Read-only')
  await openPerson(first, 'Anna')
  await expect(panel(first).getByRole('button', { name: 'Edit details' })).toHaveCount(0)

  // the roles can flip back
  await takeOverButton(first).click()
  await expect(banner(first)).toHaveCount(0)
  await expect(banner(second)).toBeVisible()
})

test('a change typed just before the takeover is not lost', async ({ page }) => {
  const { first, second } = await twoTabs(page)
  await openPerson(first, 'Ben')
  await first.getByRole('button', { name: 'Edit details' }).click()
  await first.getByLabel('First name').fill('Benedikt')
  // saved by the form, but the autosave of it is still waiting when the other tab takes over
  await first.getByRole('button', { name: 'Save' }).click()
  await takeOverButton(second).click()
  await expect(personButton(second, 'Benedikt')).toBeVisible()
})

test('the read-only state is announced to assistive technology', async ({ page }) => {
  const { first, second } = await twoTabs(page)
  const message = second.locator('p[aria-live="polite"]')
  await expect(message).toContainText('Read-only')

  // a tab that becomes read-only (its role was taken) announces it the same way
  await takeOverButton(second).click()
  await expect(banner(second)).toHaveCount(0)
  await expect(first.locator('p[aria-live="polite"]')).toContainText('Read-only')

  const results = await new AxeBuilder({ page: first }).analyze()
  expect(results.violations).toEqual([])
})

test('a tab opened after the editing one was closed edits', async ({ page }) => {
  const { first, second } = await twoTabs(page)
  await expect(banner(second)).toBeVisible()
  await first.close()
  const third = await second.context().newPage()
  await third.goto('/')
  await expect(personButton(third, 'Anna')).toBeVisible()
  await expect(banner(third)).toHaveCount(0)
})
