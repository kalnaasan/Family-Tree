import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../src/domain/tree.ts'
import { frame, openPerson, panel, peopleList, personButton } from './helpers.ts'
import { openWithFixture, openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/**
 * Karl (1) + Maria (2): Ben (3, born 1962, the Focus person) and Anna (4). Ben + Eva (5, current) and Zoe (6, ended):
 * Leo (7).
 */
function family(): Tree {
  const people: [string, 'male' | 'female', string?][] = [
    ['Karl', 'male'], ['Maria', 'female'], ['Ben', 'male', '1962'], ['Anna', 'female'],
    ['Eva', 'female'], ['Zoe', 'female'], ['Leo', 'male'],
  ]
  let tree = people.reduce(
    (t, [firstName, gender, birthDate], i) => addPerson(t, { id: id(i + 1), firstName, gender, birthDate }),
    emptyTree(),
  )
  for (const [child, parent] of [[3, 1], [3, 2], [4, 1], [4, 2], [7, 3], [7, 5]] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(5)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(6)], status: 'ended' })
  return { ...tree, focusPersonId: id(3) }
}

const announced = async (page: Page) => ((await frame(page).locator('[aria-live]').textContent()) ?? '').replace('​', '')
const noViolations = async (page: Page) => expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

/** Opens the app with the family drawn and the keyboard on Ben, the Focus person. */
async function start(page: Page) {
  await openWithTree(page, family())
  await personButton(page, 'Ben').focus()
}

test.describe('the tree is one tab stop, and its people are named', () => {
  test('exactly one person is in the tab order, and Tab leaves the tree rather than visiting the others', async ({ page }) => {
    await openWithTree(page, family())
    await expect(frame(page).locator('[data-person-id][tabindex="0"]')).toHaveCount(1)
    await expect(frame(page).locator('[data-person-id][tabindex="-1"]')).toHaveCount(6)

    await page.locator('body').click({ position: { x: 1, y: 1 } })
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab')
      if ((await page.evaluate(() => document.activeElement?.getAttribute('data-person-id'))) === id(3)) break
    }
    await expect(personButton(page, 'Ben')).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeFocused() // not another person
  })

  test('each person is a button named like "Maria, mother, born 1962"', async ({ page }) => {
    await openWithTree(page, family())
    await expect(page.getByRole('button', { name: 'Ben, Focus person, born 1962' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Karl, father', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Maria, mother', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Eva, wife', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Zoe, ex-wife', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Leo, son', exact: true })).toBeVisible()
  })

  test('the tree has instructions, and decorative parts are hidden from assistive technology', async ({ page }) => {
    await openWithTree(page, family())
    await expect(frame(page)).toHaveAccessibleDescription(/Arrow keys move to a parent, child or sibling/)
    const snapshot = await frame(page).ariaSnapshot()
    expect(snapshot).toContain('button "Karl, father"')
    // the drawn names, dates, leaves, figures and hearts are not read out a second time
    expect(snapshot).not.toMatch(/text: (Karl|Ben|1962)/)
    expect(snapshot).not.toMatch(/\bimg\b|graphics/) // the drawing is not announced as one image holding the people
  })
})

test.describe('keys', () => {
  test('ArrowUp goes to a parent and announces it', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await expect(personButton(page, 'Karl')).toBeFocused()
    expect(await announced(page)).toBe('Karl, father of Ben, 2 children')
  })

  test('ArrowDown goes to a child, and back down the way we came up', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowDown')
    await expect(personButton(page, 'Leo')).toBeFocused()
    expect(await announced(page)).toBe('Leo, son of Ben')
    await page.keyboard.press('ArrowUp') // Ben (Leo's first parent)
    await page.keyboard.press('ArrowUp') // Karl
    await page.keyboard.press('ArrowDown') // back to Ben, the child we came from
    await expect(personButton(page, 'Ben')).toBeFocused()
  })

  test('ArrowRight and ArrowLeft walk the siblings and wrap round', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowRight')
    await expect(personButton(page, 'Anna')).toBeFocused()
    expect(await announced(page)).toBe('Anna, sister of Ben')
    await page.keyboard.press('ArrowRight')
    await expect(personButton(page, 'Ben')).toBeFocused() // wrapped
    await page.keyboard.press('ArrowLeft')
    await expect(personButton(page, 'Anna')).toBeFocused()
  })

  test('P goes to a partner; pressing it again cycles through every partner', async ({ page }) => {
    await start(page)
    await page.keyboard.press('p')
    await expect(personButton(page, 'Eva')).toBeFocused()
    expect(await announced(page)).toBe('Eva, wife of Ben, 1 child')
    await page.keyboard.press('p')
    await expect(personButton(page, 'Zoe')).toBeFocused()
    expect(await announced(page)).toBe('Zoe, ex-wife of Ben')
    await page.keyboard.press('Shift+P')
    await expect(personButton(page, 'Eva')).toBeFocused()
  })

  test('says so when there is nobody that way, and stays where it is', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp') // Karl has no recorded parents
    await page.keyboard.press('ArrowUp')
    expect(await announced(page)).toBe('Karl has no recorded parents')
    await expect(personButton(page, 'Karl')).toBeFocused()
  })

  test('Enter opens the person, Escape returns to them', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(personButton(page, 'Karl')).toBeFocused()
  })

  test('F makes the person the Focus person, and labels follow', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('f')
    expect(await announced(page)).toBe('Karl is now the Focus person')
    await expect(page.getByRole('button', { name: 'Karl, Focus person', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Ben, son, born 1962' })).toBeVisible()
  })

  test('Home returns to the Focus person from anywhere', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Home')
    await expect(personButton(page, 'Ben')).toBeFocused()
    expect(await announced(page)).toBe('Ben, Focus person')
  })

  test('the zoom and pan keys still work from a person', async ({ page }) => {
    await start(page)
    const zoom = async () => Number(await frame(page).getAttribute('data-zoom'))
    const before = await zoom()
    await page.keyboard.press('+')
    await expect.poll(zoom).toBeGreaterThan(before)
    await page.keyboard.press('0')
    await expect.poll(zoom).toBeCloseTo(before, 3)
    const transform = await frame(page).locator('svg > g').first().getAttribute('transform')
    await page.keyboard.press('Shift+ArrowRight')
    expect(await frame(page).locator('svg > g').first().getAttribute('transform')).not.toBe(transform)
    await expect(personButton(page, 'Ben')).toBeFocused() // Shift+arrow pans, it does not move between people
  })

  test('the buttons beside the tree keep Enter, F and the arrows', async ({ page }) => {
    await start(page)
    await page.getByRole('button', { name: 'Zoom in' }).focus()
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('f')
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeFocused()
    await expect(panel(page)).toHaveCount(0)
  })
})

test.describe('focus is visible, and the view follows it', () => {
  test('the keyboard ring shows on the focused person only', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await expect(personButton(page, 'Karl').locator('.cursor-ring')).toBeVisible()
    await expect(personButton(page, 'Ben').locator('.cursor-ring')).toBeHidden()
    await expect(personButton(page, 'Anna').locator('.cursor-ring')).toBeHidden()
  })

  test('a mouse click does not draw the keyboard ring', async ({ page }) => {
    await openWithTree(page, family())
    await personButton(page, 'Karl').click()
    await expect(personButton(page, 'Karl').locator('.cursor-ring')).toBeHidden()
  })

  test('on a big tree, moving keeps the person on screen', async ({ page }) => {
    await openWithFixture(page, 500)
    const focusId = (await page.evaluate(() => document.querySelector('[data-person-id][tabindex="0"]')?.getAttribute('data-person-id')))!
    await page.locator(`[data-person-id="${focusId}"]`).focus()
    const viewport = page.viewportSize()!
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('ArrowUp')
      await page.waitForTimeout(250)
      const box = (await page.locator('[data-person-id]:focus').boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)
    }
  })
})

test.describe('List view', () => {
  test('shows the same people as nested, collapsible lists, with the same labels', async ({ page }) => {
    await openWithTree(page, family())
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(page.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('group', { name: 'Family tree' })).toHaveCount(0)

    const list = page.getByRole('region', { name: 'Family list' })
    await expect(list.getByRole('button', { name: /^Karl · father/ })).toBeVisible()
    await expect(list.getByRole('button', { name: /^Ben · Focus person · 1962/ })).toContainText('with Eva, Zoe (former)')
    await expect(list.getByRole('button', { name: /^Leo · son/ })).toBeVisible()

    const collapse = list.getByRole('button', { name: "Collapse Karl's family" })
    await expect(collapse).toHaveAttribute('aria-expanded', 'true')
    await collapse.click()
    await expect(list.getByRole('button', { name: /^Anna/ })).toHaveCount(1) // only Maria's pointer is left
    await list.getByRole('button', { name: "Expand Karl's family" }).click()
    await expect(list.getByRole('button', { name: /^Anna · sister/ })).toBeVisible()
  })

  test('has the same add and edit actions: open a person, add a relative, edit, all from the list', async ({ page }) => {
    await openWithTree(page, family())
    await page.getByRole('button', { name: 'List view' }).click()
    const list = page.getByRole('region', { name: 'Family list' })

    await list.getByRole('button', { name: /^Leo · son/ }).click()
    await expect(panel(page).getByRole('heading', { name: 'Leo' })).toBeFocused()
    await panel(page).getByRole('button', { name: 'Add daughter' }).click()
    await page.getByLabel('First name').fill('Mia')
    await page.getByRole('radio', { name: 'Nobody / not recorded' }).count()
    await page.getByRole('button', { name: 'Add daughter' }).click()
    await expect(panel(page).getByRole('heading', { name: 'Mia' })).toBeVisible()
    await expect(list.getByRole('button', { name: /^Mia/ })).toBeVisible()

    await panel(page).getByRole('button', { name: 'Edit details' }).click()
    await page.getByLabel('Last name (optional)').fill('Keller')
    await panel(page).getByRole('button', { name: 'Save' }).click()
    await expect(list.getByRole('button', { name: /^Mia Keller/ })).toBeVisible()
  })

  test('the list is marked with the open person, and switching back returns to the tree', async ({ page }) => {
    await openWithTree(page, family())
    await page.getByRole('button', { name: 'List view' }).click()
    const list = page.getByRole('region', { name: 'Family list' })
    await list.getByRole('button', { name: /^Anna/ }).first().click()
    await expect(list.getByRole('button', { name: /^Anna · sister/ })).toHaveAttribute('aria-current', 'true')
    await page.getByRole('button', { name: 'List view' }).click()
    await expect(frame(page)).toBeVisible()
    await expect(peopleList(page)).toHaveCount(7)
  })

  test('is operable with the keyboard alone', async ({ page }) => {
    await openWithTree(page, family())
    await page.getByRole('button', { name: 'List view' }).focus()
    await page.keyboard.press('Enter')
    const list = page.getByRole('region', { name: 'Family list' })
    await list.getByRole('button', { name: "Collapse Karl's family" }).focus()
    await page.keyboard.press('Enter')
    await expect(list.getByRole('button', { name: "Expand Karl's family" })).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter') // Karl
    await expect(panel(page).getByRole('heading', { name: 'Karl' })).toBeFocused()
  })
})

test.describe('axe', () => {
  test('the tree, with a person focused by keyboard', async ({ page }) => {
    await start(page)
    await page.keyboard.press('ArrowUp')
    await noViolations(page)
  })

  test('the tree with the panel open', async ({ page }) => {
    await openWithTree(page, family())
    await openPerson(page, 'Ben')
    await noViolations(page)
  })

  test('the List view, with and without the panel', async ({ page }) => {
    await openWithTree(page, family())
    await page.getByRole('button', { name: 'List view' }).click()
    await noViolations(page)
    await page.getByRole('region', { name: 'Family list' }).getByRole('button', { name: /^Leo ·(?! also)/ }).click()
    await noViolations(page)
  })
})
