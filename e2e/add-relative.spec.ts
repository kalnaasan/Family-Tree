import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { capitalise } from '../src/i18n/format.ts'
import { expect, msg, test, words } from './fixtures.ts'
import { deletePerson, makeFocusPerson, openActionsMenu, openPerson, startAdd, panel, peopleList, personButton, submitButton } from './helpers.ts'
import { openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function people(...names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

/** Ben (1, male) with birth parents Karl (2, male) and Maria (3, female). */
function benWithTwoParents(): Tree {
  let tree = addPerson(emptyTree(), { id: id(1), firstName: 'Ben', gender: 'male' })
  tree = addPerson(tree, { id: id(2), firstName: 'Karl', gender: 'male' })
  tree = addPerson(tree, { id: id(3), firstName: 'Maria', gender: 'female' })
  return addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
}

const group = (page: Page, name: string) => panel(page).getByRole('region', { name })
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

async function openWith(page: Page, tree: Tree, name = 'Ben') {
  await openWithTree(page, tree)
  await openPerson(page, name)
}

test.describe('first person', () => {
  test('the empty state adds the first person, who becomes the Focus person and persists', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: words('empty.title') })).toBeVisible()
    await noViolations(page)

    await page.getByLabel(words('fields.firstName')).fill('Anna')
    await page.getByRole('button', { name: words('empty.add') }).click()
    await expect(panel(page).getByRole('heading', { name: 'Anna' })).toBeVisible()
    await expect(panel(page)).toContainText(words('person.focus'))
    await expect(page.locator('[data-person-id]')).toHaveCount(1)
    await noViolations(page)

    await expect(page.getByRole('status')).toHaveText(words('save.saved'))
    await page.reload()
    await expect(page.locator('[data-person-id]')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: words('empty.title') })).toHaveCount(0)
  })

  test('a first name is required', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: words('empty.add') }).click()
    await expect(page.getByText(words('person.errorFirstName'))).toBeVisible()
    await expect(page.locator('[data-person-id]')).toHaveCount(0)
  })
})

test.describe('parents', () => {
  test('a third birth parent is blocked with a message', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await startAdd(page, 'relation.father')
    await expect(page.getByRole('alert')).toContainText(words('addRelative.blockedParents', { name: 'Ben' }))
    await noViolations(page)
    await page.getByRole('button', { name: words('addForm.back'), exact: true }).click()
    await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
    await expect(peopleList(page)).toHaveCount(3)
  })

  test('with one parent, the partnership question defaults to current and shows a preview', async ({ page }) => {
    await openWith(page, addParentLink(people('Ben', 'Karl'), id(1), id(2)))
    await startAdd(page, 'relation.mother')
    await expect(page.getByRole('radio', { name: words('addForm.partnerCurrent') })).toBeChecked()
    await page.getByLabel(words('fields.firstName')).fill('Maria')
    await expect(page.getByText(words('preview.title'))).toBeVisible()
    await expect(page.getByText(words('preview.partnershipCurrentWith', { name: 'Karl' }))).toBeVisible()
    await noViolations(page)
    await submitButton(page, 'relation.mother').click()
    await expect(panel(page).getByRole('heading', { name: 'Maria' })).toBeVisible()
    await expect(group(page, words('panel.group.partners'))).toContainText('Karl')
  })
})

test.describe('siblings', () => {
  test('two parents: both or only one (a half-sibling)', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await startAdd(page, 'relation.brother')
    await expect(
      page.getByRole('radio', { name: words('addForm.sharesBoth', { first: 'Karl', second: 'Maria' }) }),
    ).toBeChecked()
    await page.getByLabel(words('fields.firstName')).fill('Tom')
    await page.getByRole('radio', { name: words('addForm.sharesOnly', { name: 'Karl' }) }).check()
    await expect(page.getByText(words('preview.halfSibling', { parent: 'Karl' }))).toBeVisible()
    await submitButton(page, 'relation.brother').click()

    await expect(panel(page).getByRole('heading', { name: 'Tom' })).toBeVisible()
    await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
    await expect(group(page, words('panel.group.parents'))).not.toContainText('Maria')
    await expect(group(page, words('panel.group.siblings'))).toContainText('Ben')
    await expect(group(page, words('panel.group.siblings'))).toContainText(words('panel.noteHalf'))
  })

  test('one parent: attached silently, without a question', async ({ page }) => {
    await openWith(page, addParentLink(people('Ben', 'Karl'), id(1), id(2)))
    await startAdd(page, 'relation.sister')
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel(words('fields.firstName')).fill('Anna')
    await submitButton(page, 'relation.sister').click()
    await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
  })

  test('no parents: an unnamed shared parent is created and can be renamed', async ({ page }) => {
    await openWith(page, people('Ben'))
    await startAdd(page, 'relation.sister')
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel(words('fields.firstName')).fill('Anna')
    await expect(page.getByText(words('preview.newParent', { name: words('person.unnamedParent') }))).toBeVisible()
    await submitButton(page, 'relation.sister').click()
    await expect(group(page, words('panel.group.parents'))).toContainText(words('person.unnamedParent'))

    await openPerson(page, words('person.unnamedParent'))
    await panel(page)
      .getByRole('button', { name: words('panel.edit') })
      .click()
    await page.getByLabel(words('fields.firstName')).fill('Karl')
    await panel(page)
      .getByRole('button', { name: words('common.save') })
      .click()
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeVisible()
    await expect(group(page, words('panel.group.children'))).toContainText('Ben')
    await expect(group(page, words('panel.group.children'))).toContainText('Anna')
  })
})

test.describe('children', () => {
  test('without partners: a single-parent child, no question', async ({ page }) => {
    await openWith(page, people('Ben'))
    await startAdd(page, 'relation.son')
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel(words('fields.firstName')).fill('Leo')
    await submitButton(page, 'relation.son').click()
    await expect(panel(page).getByRole('heading', { name: 'Leo' })).toBeVisible()
    await expect(group(page, words('panel.group.parents'))).toContainText('Ben')
  })

  test('with partners: the latest current partner is the default; nobody is always offered', async ({ page }) => {
    let tree = people('Ben', 'Old', 'Eva')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'ended' })
    tree = addPartnership(tree, { personIds: [id(1), id(3)], status: 'current' })
    await openWith(page, tree)

    await startAdd(page, 'relation.daughter')
    await expect(page.getByRole('radio', { name: words('addForm.otherCurrent', { name: 'Eva' }) })).toBeChecked()
    await expect(page.getByRole('radio', { name: words('addForm.otherFormer', { name: 'Old' }) })).not.toBeChecked()
    await page.getByLabel(words('fields.firstName')).fill('Mia')
    await expect(
      page.getByText(
        words('preview.relationOfTwo', { who: 'Mia', relation: words('relation.daughter'), name: 'Ben', other: 'Eva' }),
      ),
    ).toBeVisible()
    await page.getByRole('radio', { name: words('addForm.otherNobody') }).check()
    await expect(
      page.getByText(words('preview.relationOf', { who: 'Mia', relation: words('relation.daughter'), name: 'Ben' }), {
        exact: true,
      }),
    ).toBeVisible()
    await noViolations(page)
    await submitButton(page, 'relation.daughter').click()
    await expect(panel(page).getByRole('heading', { name: 'Mia' })).toBeVisible()
    await expect(group(page, words('panel.group.parents'))).toContainText('Ben')
    await expect(group(page, words('panel.group.parents'))).not.toContainText('Eva')
  })
})

test.describe('partners', () => {
  test('current by default; ended shows as former', async ({ page }) => {
    await openWith(page, people('Ben'))
    await startAdd(page, 'relation.wife')
    await expect(page.getByRole('radio', { name: words('addForm.statusCurrent') })).toBeChecked()
    await expect(page.getByLabel(words('fields.gender'))).toHaveValue('female')
    await page.getByLabel(words('fields.firstName')).fill('Eva')
    await page.getByRole('radio', { name: words('addForm.statusEnded') }).check()
    await expect(page.getByText(words('preview.partnershipEnded'))).toBeVisible()
    await submitButton(page, 'relation.wife').click()
    await expect(group(page, words('panel.group.partners'))).toContainText('Ben')
    await expect(group(page, words('panel.group.partners'))).toContainText(words('panel.noteFormer'))
  })

  test('the gender a relation presets can be changed', async ({ page }) => {
    await openWith(page, people('Ben'))
    await startAdd(page, 'relation.husband')
    await expect(page.getByLabel(words('fields.gender'))).toHaveValue('male')
    await page.getByLabel(words('fields.gender')).selectOption('other')
    await page.getByLabel(words('fields.firstName')).fill('Alex')
    await submitButton(page, 'relation.husband').click()
    await panel(page)
      .getByRole('button', { name: words('panel.edit') })
      .click()
    await expect(page.getByLabel(words('fields.gender'))).toHaveValue('other')
  })
})

test.describe('keyboard only', () => {
  /** Presses Tab until the focused element is named `name` (its aria-label or its text). */
  async function tabTo(page: Page, name: string) {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press('Tab')
      const focused = await page.evaluate(() => {
        const el = document.activeElement
        const label = el instanceof HTMLInputElement ? el.labels?.[0]?.textContent : null
        return el?.getAttribute('aria-label') ?? label?.trim() ?? el?.textContent?.trim() ?? ''
      })
      if (focused === name || focused.startsWith(`${name},`) || focused.startsWith(`${name}،`)) return
    }
    throw new Error(`Tab never reached "${name}"`)
  }

  test('the whole flow: open a Person, add a relative, add another, with no mouse', async ({ page }) => {
    await openWithTree(page, people('Ben'))
    await page.locator('body').click({ position: { x: 1, y: 1 } })

    await tabTo(page, 'Ben')
    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeFocused()

    await tabTo(page, words('panel.addTo.children'))
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog').getByRole('radio', { name: capitalise(words('relation.child')), exact: true })).toBeFocused()
    await page.keyboard.press('ArrowDown') // the arrows move within the group: son
    await page.keyboard.press('Enter') // implicit submit of the first step: Continue
    await expect(page.getByLabel(words('fields.firstName'))).toBeFocused()
    await page.keyboard.type('Leo')
    await page.keyboard.press('Enter') // implicit form submit
    await expect(panel(page).getByRole('heading', { name: 'Leo' })).toBeFocused()

    await tabTo(page, words('panel.addTo.partners'))
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('ArrowDown') // partner, husband, wife
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zoe')
    await tabTo(page, words('addForm.statusCurrent')) // Tab lands on the checked radio; arrow keys move within the group
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: words('addForm.statusEnded') })).toBeChecked()
    await tabTo(page, words('addForm.submit', { relation: words('relation.wife') }))
    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Zoe' })).toBeFocused()

    await expect(peopleList(page)).toHaveText(['Ben', 'Leo', 'Zoe'])
  })

  test('Escape steps back from a form, then closes the panel and returns to the tree', async ({ page }) => {
    await openWith(page, people('Ben'))
    await startAdd(page, 'relation.son')
    await expect(page.getByLabel(words('fields.firstName'))).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(personButton(page, 'Ben')).toBeFocused() // back where the keyboard was
  })

  test('the panel passes axe', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await noViolations(page)
    await startAdd(page, 'relation.sister')
    await noViolations(page)
  })
})

test.describe('the tree and the panel', () => {
  test('clicking a Person opens them with a ring; clicking empty space closes the panel', async ({ page }) => {
    await openWithTree(page, benWithTwoParents())
    await page.locator(`[data-person-id="${id(1)}"]`).click()
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeVisible()
    await expect(page.locator(`[data-person-id="${id(1)}"] circle[stroke-dasharray]`)).toHaveCount(1)

    const frame = (await page.getByRole('group', { name: words('tree.label') }).boundingBox())!
    await page.mouse.click(frame.x + 6, frame.y + 6)
    await expect(panel(page)).toHaveCount(0)
  })

  test('dragging the tree does not open anybody', async ({ page }) => {
    await openWithTree(page, benWithTwoParents())
    const person = (await page.locator(`[data-person-id="${id(1)}"]`).boundingBox())!
    await page.mouse.move(person.x + person.width / 2, person.y + person.height / 2)
    await page.mouse.down()
    await page.mouse.move(person.x + person.width / 2 + 60, person.y + person.height / 2 + 20, { steps: 6 })
    await page.mouse.up()
    await expect(panel(page)).toHaveCount(0)
  })

  test('a relative in the panel jumps to them', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await group(page, words('panel.group.parents')).getByRole('button', { name: /^Karl/ }).click()
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeFocused()
    await expect(group(page, words('panel.group.children'))).toContainText('Ben')
  })
})

test.describe('edit, Focus person and delete', () => {
  test('edits a Person, with date validation', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page)
      .getByRole('button', { name: words('panel.edit') })
      .click()
    await page.getByLabel(words('fields.lastName')).fill('Keller')
    await page.getByLabel(words('fields.born')).fill('soon')
    await panel(page)
      .getByRole('button', { name: words('common.save') })
      .click()
    await expect(page.getByText(words('person.dateHelp')).first()).toBeVisible()
    await noViolations(page)
    await page.getByLabel(words('fields.born')).fill('1962-04')
    await panel(page)
      .getByRole('button', { name: words('common.save') })
      .click()
    await expect(panel(page).getByRole('heading', { name: 'Ben Keller' })).toBeVisible()
    await expect(panel(page)).toContainText('1962')
  })

  test('changes the Focus person, and relationship labels follow', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await expect(group(page, words('panel.group.parents'))).toContainText(words('relation.father'))
    await openPerson(page, 'Karl')
    await makeFocusPerson(page)
    await expect(panel(page)).toContainText(words('person.focus'))
    await openActionsMenu(page)
    await expect(page.getByRole('menuitem', { name: words('panel.makeFocus') })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: new RegExp(words('panel.delete', { name: '' }).trim()) })).toHaveCount(1)
    await page.keyboard.press('Escape')
    await expect(group(page, words('panel.group.children'))).toContainText(words('relation.son'))
    await expect(page.getByRole('status')).toHaveText(words('save.saved'))
    await page.reload()
    await openPerson(page, 'Karl')
    await expect(panel(page)).toContainText(words('person.focus'))
  })

  test('deleting says what went with the Person', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await deletePerson(page, 'Ben')
    await expect(
      page.getByText(words('toast.deletedWith', { name: 'Ben', parts: msg('toast.parentLinks', { count: 2 }) })),
    ).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await expect(peopleList(page)).toHaveText(['Karl', 'Maria'])
  })
})
