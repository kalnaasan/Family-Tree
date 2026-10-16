import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { openPerson, panel, peopleList, personButton } from './helpers.ts'
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
    await expect(page.getByRole('heading', { name: 'Start your family tree' })).toBeVisible()
    await noViolations(page)

    await page.getByLabel('First name').fill('Anna')
    await page.getByRole('button', { name: 'Add the first person' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Anna' })).toBeVisible()
    await expect(panel(page)).toContainText('Focus person')
    await expect(page.locator('[data-person-id]')).toHaveCount(1)
    await noViolations(page)

    await expect(page.getByRole('status')).toHaveText('Saved')
    await page.reload()
    await expect(page.locator('[data-person-id]')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Start your family tree' })).toHaveCount(0)
  })

  test('a first name is required', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Add the first person' }).click()
    await expect(page.getByText('Enter a first name')).toBeVisible()
    await expect(page.locator('[data-person-id]')).toHaveCount(0)
  })
})

test.describe('parents', () => {
  test('a third birth parent is blocked with a message', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await panel(page).getByRole('button', { name: 'Add father' }).click()
    await expect(page.getByRole('alert')).toContainText('already has two birth parents')
    await noViolations(page)
    await page.getByRole('button', { name: 'Back', exact: true }).click()
    await expect(group(page, 'Parents')).toContainText('Karl')
    await expect(peopleList(page)).toHaveCount(3)
  })

  test('with one parent, the partnership question defaults to current and shows a preview', async ({ page }) => {
    await openWith(page, addParentLink(people('Ben', 'Karl'), id(1), id(2)))
    await panel(page).getByRole('button', { name: 'Add mother' }).click()
    await expect(page.getByRole('radio', { name: 'Current partner' })).toBeChecked()
    await page.getByLabel('First name').fill('Maria')
    await expect(page.getByText('This will create:')).toBeVisible()
    await expect(page.getByText('A current partnership with Karl')).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Add mother' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Maria' })).toBeVisible()
    await expect(group(page, 'Partners')).toContainText('Karl')
  })
})

test.describe('siblings', () => {
  test('two parents: both or only one (a half-sibling)', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await panel(page).getByRole('button', { name: 'Add brother' }).click()
    await expect(page.getByRole('radio', { name: 'Both: Karl and Maria' })).toBeChecked()
    await page.getByLabel('First name').fill('Tom')
    await page.getByRole('radio', { name: 'Only Karl (half-sibling)' }).check()
    await expect(page.getByText('Half-sibling: shares only Karl as parent')).toBeVisible()
    await page.getByRole('button', { name: 'Add brother' }).click()

    await expect(panel(page).getByRole('heading', { name: 'Tom' })).toBeVisible()
    await expect(group(page, 'Parents')).toContainText('Karl')
    await expect(group(page, 'Parents')).not.toContainText('Maria')
    await expect(group(page, 'Siblings')).toContainText('Ben')
    await expect(group(page, 'Siblings')).toContainText('half')
  })

  test('one parent: attached silently, without a question', async ({ page }) => {
    await openWith(page, addParentLink(people('Ben', 'Karl'), id(1), id(2)))
    await panel(page).getByRole('button', { name: 'Add sister' }).click()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel('First name').fill('Anna')
    await page.getByRole('button', { name: 'Add sister' }).click()
    await expect(group(page, 'Parents')).toContainText('Karl')
  })

  test('no parents: an unnamed shared parent is created and can be renamed', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Add sister' }).click()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel('First name').fill('Anna')
    await expect(page.getByText(/A new parent, "Unnamed parent", of both/)).toBeVisible()
    await page.getByRole('button', { name: 'Add sister' }).click()
    await expect(group(page, 'Parents')).toContainText('Unnamed parent')

    await openPerson(page, 'Unnamed parent')
    await panel(page).getByRole('button', { name: 'Edit details' }).click()
    await page.getByLabel('First name').fill('Karl')
    await panel(page).getByRole('button', { name: 'Save' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeVisible()
    await expect(group(page, 'Children')).toContainText('Ben')
    await expect(group(page, 'Children')).toContainText('Anna')
  })
})

test.describe('children', () => {
  test('without partners: a single-parent child, no question', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Add son' }).click()
    await expect(page.getByRole('radio')).toHaveCount(0)
    await page.getByLabel('First name').fill('Leo')
    await page.getByRole('button', { name: 'Add son' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Leo' })).toBeVisible()
    await expect(group(page, 'Parents')).toContainText('Ben')
  })

  test('with partners: the latest current partner is the default; nobody is always offered', async ({ page }) => {
    let tree = people('Ben', 'Old', 'Eva')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'ended' })
    tree = addPartnership(tree, { personIds: [id(1), id(3)], status: 'current' })
    await openWith(page, tree)

    await panel(page).getByRole('button', { name: 'Add daughter' }).click()
    await expect(page.getByRole('radio', { name: 'Eva (current partner)' })).toBeChecked()
    await expect(page.getByRole('radio', { name: 'Old (former partner)' })).not.toBeChecked()
    await page.getByLabel('First name').fill('Mia')
    await expect(page.getByText('Mia, daughter of Ben and Eva')).toBeVisible()
    await page.getByRole('radio', { name: 'Nobody / not recorded' }).check()
    await expect(page.getByText('Mia, daughter of Ben', { exact: true })).toBeVisible()
    await noViolations(page)
    await page.getByRole('button', { name: 'Add daughter' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Mia' })).toBeVisible()
    await expect(group(page, 'Parents')).toContainText('Ben')
    await expect(group(page, 'Parents')).not.toContainText('Eva')
  })
})

test.describe('partners', () => {
  test('current by default; ended shows as former', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Add wife' }).click()
    await expect(page.getByRole('radio', { name: 'Current' })).toBeChecked()
    await expect(page.getByLabel('Gender')).toHaveValue('female')
    await page.getByLabel('First name').fill('Eva')
    await page.getByRole('radio', { name: 'Ended' }).check()
    await expect(page.getByText('An ended partnership')).toBeVisible()
    await page.getByRole('button', { name: 'Add wife' }).click()
    await expect(group(page, 'Partners')).toContainText('Ben')
    await expect(group(page, 'Partners')).toContainText('former')
  })

  test('the gender a relation presets can be changed', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Add husband' }).click()
    await expect(page.getByLabel('Gender')).toHaveValue('male')
    await page.getByLabel('Gender').selectOption('other')
    await page.getByLabel('First name').fill('Alex')
    await page.getByRole('button', { name: 'Add husband' }).click()
    await panel(page).getByRole('button', { name: 'Edit details' }).click()
    await expect(page.getByLabel('Gender')).toHaveValue('other')
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
      if (focused === name || focused.startsWith(`${name},`)) return
    }
    throw new Error(`Tab never reached "${name}"`)
  }

  test('the whole flow: open a Person, add a relative, add another, with no mouse', async ({ page }) => {
    await openWithTree(page, people('Ben'))
    await page.locator('body').click({ position: { x: 1, y: 1 } })

    await tabTo(page, 'Ben')
    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeFocused()

    await tabTo(page, 'Add son')
    await page.keyboard.press('Enter')
    await expect(page.getByLabel('First name')).toBeFocused()
    await page.keyboard.type('Leo')
    await page.keyboard.press('Enter') // implicit form submit
    await expect(panel(page).getByRole('heading', { name: 'Leo' })).toBeFocused()

    await tabTo(page, 'Add wife')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Zoe')
    await tabTo(page, 'Current') // Tab lands on the checked radio; arrow keys move within the group
    await page.keyboard.press('ArrowDown')
    await expect(page.getByRole('radio', { name: 'Ended' })).toBeChecked()
    await tabTo(page, 'Add wife')
    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Zoe' })).toBeFocused()

    await expect(peopleList(page)).toHaveText(['Ben', 'Leo', 'Zoe'])
  })

  test('Escape steps back from a form, then closes the panel and returns to the tree', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Add son' }).click()
    await expect(page.getByLabel('First name')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(panel(page)).toHaveCount(0)
    await expect(personButton(page, 'Ben')).toBeFocused() // back where the keyboard was
  })

  test('the panel passes axe', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await noViolations(page)
    await panel(page).getByRole('button', { name: 'Add sister' }).click()
    await noViolations(page)
  })
})

test.describe('the tree and the panel', () => {
  test('clicking a Person opens them with a ring; clicking empty space closes the panel', async ({ page }) => {
    await openWithTree(page, benWithTwoParents())
    await page.locator(`[data-person-id="${id(1)}"]`).click()
    await expect(panel(page).getByRole('heading', { name: 'Ben' })).toBeVisible()
    await expect(page.locator(`[data-person-id="${id(1)}"] circle[stroke-dasharray]`)).toHaveCount(1)

    const frame = (await page.getByRole('group', { name: 'Family tree' }).boundingBox())!
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
    await group(page, 'Parents').getByRole('button', { name: /Karl/ }).click()
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeFocused()
    await expect(group(page, 'Children')).toContainText('Ben')
  })
})

test.describe('edit, Focus person and delete', () => {
  test('edits a Person, with date validation', async ({ page }) => {
    await openWith(page, people('Ben'))
    await panel(page).getByRole('button', { name: 'Edit details' }).click()
    await page.getByLabel('Last name (optional)').fill('Keller')
    await page.getByLabel('Born (optional)').fill('soon')
    await panel(page).getByRole('button', { name: 'Save' }).click()
    await expect(page.getByText('Use YYYY, YYYY-MM or YYYY-MM-DD').first()).toBeVisible()
    await noViolations(page)
    await page.getByLabel('Born (optional)').fill('1962-04')
    await panel(page).getByRole('button', { name: 'Save' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Ben Keller' })).toBeVisible()
    await expect(panel(page)).toContainText('1962')
  })

  test('changes the Focus person, and relationship labels follow', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await expect(group(page, 'Parents')).toContainText('father')
    await openPerson(page, 'Karl')
    await panel(page).getByRole('button', { name: 'Make Focus person' }).click()
    await expect(panel(page)).toContainText('Focus person')
    await expect(panel(page).getByRole('button', { name: 'Make Focus person' })).toHaveCount(0)
    await expect(group(page, 'Children')).toContainText('son')
    await expect(page.getByRole('status')).toHaveText('Saved')
    await page.reload()
    await openPerson(page, 'Karl')
    await expect(panel(page)).toContainText('Focus person')
  })

  test('deleting says what went with the Person', async ({ page }) => {
    await openWith(page, benWithTwoParents())
    await panel(page).getByRole('button', { name: 'Delete Ben' }).click()
    await expect(page.getByText('Deleted Ben, with 2 parent links')).toBeVisible()
    await expect(panel(page)).toHaveCount(0)
    await expect(peopleList(page)).toHaveText(['Karl', 'Maria'])
  })
})
