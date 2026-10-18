import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, test, words } from './fixtures.ts'
import { openPerson, panel, peopleList } from './helpers.ts'
import { openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function people(...names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

const group = (page: Page, name: string) => panel(page).getByRole('region', { name })
const menuButton = (page: Page, name: string) =>
  panel(page).getByRole('button', { name: words('panel.linkMenuAria', { name }), exact: true })
const menuItem = (page: Page, key: 'panel.editLink' | 'panel.removeLink') =>
  page.getByRole('menuitem', { name: words(key), exact: true })
const dialog = (page: Page) => page.getByRole('dialog')
const undo = (page: Page) =>
  page.getByRole('group', { name: words('history.group') }).getByRole('button', { name: words('history.undo') })

async function openWith(page: Page, tree: Tree, name = 'Ben') {
  await openWithTree(page, tree)
  await openPerson(page, name)
}

const withFather = () => addParentLink(people('Ben', 'Karl'), id(1), id(2))

test('remove a Parent link: both people stay, the toast says so, Undo brings it back', async ({ page }) => {
  await openWith(page, withFather())
  await menuButton(page, 'Karl').click()
  await menuItem(page, 'panel.removeLink').click()

  await expect(page.getByText(words('toast.removedLink', { first: 'Ben', second: 'Karl' }))).toBeVisible()
  await expect(group(page, words('panel.group.parents'))).not.toContainText('Karl')
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Ben' })).toBeFocused()
  await expect(peopleList(page)).toHaveCount(2)
  await undo(page).click()
  await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
})

test('change a kind to adoptive and to step: the chip follows, focus returns to its menu', async ({ page }) => {
  await openWith(page, withFather())
  await menuButton(page, 'Karl').click()
  await menuItem(page, 'panel.editLink').click()
  await dialog(page).getByRole('radio', { name: words('editLink.adoptive') }).check()
  await dialog(page).getByRole('button', { name: words('common.save') }).click()
  await expect(dialog(page)).toBeHidden()
  await expect(menuButton(page, 'Karl')).toBeFocused()
  await expect(group(page, words('panel.group.parents'))).toContainText('Karl')

  await menuButton(page, 'Karl').click()
  await menuItem(page, 'panel.editLink').click()
  await dialog(page).getByRole('radio', { name: words('editLink.step') }).check()
  await dialog(page).getByRole('button', { name: words('common.save') }).click()
  await expect(group(page, words('panel.group.parents'))).toContainText(words('panel.noteStep'))
  await undo(page).click()
  await expect(group(page, words('panel.group.parents'))).not.toContainText(words('panel.noteStep'))
})

test('mark a Partnership ended with dates; Cancel changes nothing', async ({ page }) => {
  await openWith(page, addPartnership(people('Anna', 'Ben'), { personIds: [id(1), id(2)], status: 'current' }), 'Anna')
  await menuButton(page, 'Ben').click()
  await menuItem(page, 'panel.editLink').click()
  await dialog(page).getByRole('radio', { name: words('addForm.statusEnded') }).check()
  await dialog(page).getByLabel(words('editLink.start')).fill('1990')
  await dialog(page).getByLabel(words('editLink.end')).fill('2010-06')
  await dialog(page).getByRole('button', { name: words('common.cancel') }).click()
  await expect(group(page, words('panel.group.partners'))).not.toContainText(words('panel.noteFormer'))

  await menuButton(page, 'Ben').click()
  await menuItem(page, 'panel.editLink').click()
  await dialog(page).getByRole('radio', { name: words('addForm.statusEnded') }).check()
  await dialog(page).getByLabel(words('editLink.end')).fill('2010-13')
  await dialog(page).getByRole('button', { name: words('common.save') }).click()
  await expect(dialog(page).getByLabel(words('editLink.end'))).toHaveAttribute('aria-invalid', 'true')
  await dialog(page).getByLabel(words('editLink.end')).fill('2010-06')
  await dialog(page).getByRole('button', { name: words('common.save') }).click()
  await expect(group(page, words('panel.group.partners'))).toContainText(words('panel.noteFormer'))
})

test('the open menu and the open dialog have no axe violations', async ({ page }) => {
  await openWith(page, withFather())
  await menuButton(page, 'Karl').click()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await menuItem(page, 'panel.editLink').click()
  await expect(dialog(page)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the menu button and its items are at least 44 px', async ({ page }) => {
    await openWithTree(page, withFather())
    await openPerson(page, 'Ben')
    await panel(page).getByRole('button', { name: words('panel.details') }).click()
    const button = menuButton(page, 'Karl')
    await button.click()
    for (const target of [button, menuItem(page, 'panel.editLink'), menuItem(page, 'panel.removeLink')]) {
      const box = (await target.boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })
})
