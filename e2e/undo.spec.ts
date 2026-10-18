import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, msg, startingWith, test, words } from './fixtures.ts'
import { addButton, openPerson, panel, peopleList, submitButton } from './helpers.ts'
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

const group = (page: Page, name: string) => panel(page).getByRole('region', { name })
const undoButton = (page: Page) =>
  page.getByRole('group', { name: words('history.group') }).getByRole('button', { name: words('history.undo') })
const redoButton = (page: Page) =>
  page.getByRole('group', { name: words('history.group') }).getByRole('button', { name: words('history.redo') })

test('undo of an add-relative takes the whole flow back, redo returns it', async ({ page }) => {
  await openWithTree(page, family())
  await expect(undoButton(page)).toBeDisabled()
  await openPerson(page, 'Ben')
  await addButton(panel(page), 'relation.sister').click()
  await page.getByLabel(words('fields.firstName')).fill('Anna')
  await page.getByRole('radio', { name: words('addForm.sharesOnly', { name: 'Karl' }) }).check()
  await submitButton(page, 'relation.sister').click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Anna'])

  await undoButton(page).click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
  await expect(
    page.getByText(
      words('toast.undid', {
        what: msg('step.addRelation', { relation: msg('relation.sister') }),
      }),
    ),
  ).toBeVisible()
  await expect(panel(page)).toHaveCount(0) // the open Person was Anna

  await redoButton(page).click()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Anna'])
  await expect(redoButton(page)).toBeDisabled()
})

test('Ctrl+Z and Ctrl+Shift+Z work from the keyboard, and not inside a text field', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Karl')
  const makeFocus = panel(page).getByRole('button', {
    name: words('panel.makeFocus'),
  })
  await makeFocus.click()
  await expect(makeFocus).toHaveCount(0) // Karl is the Focus person now

  await page.getByRole('group', { name: words('tree.label') }).focus()
  await page.keyboard.press('Control+z')
  await expect(page.getByText(words('toast.undid', { what: msg('step.changeFocus') }))).toBeVisible()
  await expect(makeFocus).toBeVisible()
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByText(words('toast.redid', { what: msg('step.changeFocus') }))).toBeVisible()
  await expect(makeFocus).toHaveCount(0)

  // in a text field the app leaves Ctrl+Z to the field
  await panel(page)
    .getByRole('button', { name: words('panel.edit') })
    .click()
  await page.getByLabel(words('fields.firstName')).fill('Karlchen')
  await page.keyboard.press('Control+z')
  await expect(page.getByLabel(words('fields.firstName'))).toBeVisible()
  await expect(page.getByText(startingWith(words('toast.undid', { what: '' }).trim()))).toHaveCount(0)
})

test('undo of a delete restores the Person, their links and Partnership', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page)
    .getByRole('button', { name: words('panel.delete', { name: 'Ben' }) })
    .click()
  await expect(
    page.getByText(
      words('toast.deletedWith', {
        name: 'Ben',
        parts: msg('toast.bothParts', {
          first: msg('toast.parentLinks', { count: 2 }),
          second: msg('toast.partnerships', { count: 1 }),
        }),
      }),
    ),
  ).toBeVisible()
  await expect(peopleList(page)).toHaveText(['Karl', 'Maria', 'Eva'])

  await page
    .getByRole('button', { name: words('history.undo') })
    .last()
    .click() // the toast's own Undo
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
  await openPerson(page, 'Ben')
  await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
  await expect(group(page, words('panel.group.parents'))).toContainText('Maria')
  await expect(group(page, words('panel.group.partners'))).toContainText('Eva')
})

test('the delete toast lasts about 8 seconds and loses its Undo after another change', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Eva')
  await panel(page)
    .getByRole('button', { name: words('panel.delete', { name: 'Eva' }) })
    .click()
  const toast = page.getByText(
    words('toast.deleted', { name: 'Eva' }).split('Eva')[0]!.trim()
      ? new RegExp('^' + words('toast.deleted', { name: 'Eva' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      : 'Eva',
  )
  await expect(toast).toBeVisible()
  await expect(page.getByRole('button', { name: words('history.undo') })).toHaveCount(2)

  await openPerson(page, 'Karl')
  await panel(page)
    .getByRole('button', { name: words('panel.makeFocus') })
    .click()
  await expect(page.getByRole('button', { name: words('history.undo') })).toHaveCount(1) // only the toolbar's
  await expect(toast).toBeVisible()

  await expect(toast).toBeHidden({ timeout: 10_000 })
})

test('history is memory only: a reload starts with nothing to undo', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await addButton(panel(page), 'relation.son').click()
  await page.getByLabel(words('fields.firstName')).fill('Leo')
  await page.getByRole('radio', { name: words('addForm.otherNobody') }).check()
  await submitButton(page, 'relation.son').click()
  await expect(undoButton(page)).toBeEnabled()
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))

  await page.reload()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva', 'Leo'])
  await expect(undoButton(page)).toBeDisabled()
  await expect(redoButton(page)).toBeDisabled()
})

test('an undo is saved: after Undo and a reload the Person is still gone', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await addButton(panel(page), 'relation.son').click()
  await page.getByLabel(words('fields.firstName')).fill('Leo')
  await page.getByRole('radio', { name: words('addForm.otherNobody') }).check()
  await submitButton(page, 'relation.son').click()
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))
  await undoButton(page).click()
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))
  await page.reload()
  await expect(peopleList(page)).toHaveText(['Ben', 'Karl', 'Maria', 'Eva'])
})

test('the history controls and the toast pass axe', async ({ page }) => {
  await openWithTree(page, family())
  await openPerson(page, 'Ben')
  await panel(page)
    .getByRole('button', { name: words('panel.delete', { name: 'Ben' }) })
    .click()
  await expect(page.getByText(startingWith(words('toast.deleted', { name: 'Ben' })))).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
