import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import type { MessageKey } from '../src/i18n/messages.ts'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, test, words } from './fixtures.ts'
import { openPerson, panel, peopleList, startAdd } from './helpers.ts'
import { openWithTree } from './seed.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

function people(...names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

const group = (page: Page, name: string) => panel(page).getByRole('region', { name })
const option = (page: Page, name: string) => page.getByRole('option', { name: new RegExp(name) })
const undo = (page: Page) =>
  page.getByRole('group', { name: words('history.group') }).getByRole('button', { name: words('history.undo') })
const link = (page: Page, relation: MessageKey) =>
  page.getByRole('button', { name: words('link.submit', { relation: words(relation) }), exact: true })

async function openWith(page: Page, tree: Tree, name = 'Ben') {
  await openWithTree(page, tree)
  await openPerson(page, name)
}

test('link an existing father: the panel and the tree show him, Undo takes it back', async ({ page }) => {
  await openWith(page, people('Ben', 'Karl'))
  await startAdd(page, 'relation.father', 'link')
  await option(page, 'Karl').click()
  await expect(page.getByText(words('preview.linkTitle'))).toBeVisible()
  await link(page, 'relation.father').click()

  await expect(panel(page).getByRole('heading', { level: 2, name: 'Ben' })).toBeFocused()
  await expect(group(page, words('panel.group.parents'))).toContainText('Karl')
  await expect(peopleList(page)).toHaveCount(2)
  await undo(page).click()
  await expect(group(page, words('panel.group.parents'))).not.toContainText('Karl')
  await expect(peopleList(page)).toHaveCount(2)
})

test('link an existing child and an existing partner', async ({ page }) => {
  await openWith(page, people('Anna', 'Cora', 'Ben'), 'Anna')
  await startAdd(page, 'relation.child', 'link')
  await option(page, 'Cora').click()
  await link(page, 'relation.child').click()
  await expect(group(page, words('panel.group.children'))).toContainText('Cora')

  await startAdd(page, 'relation.partner', 'link')
  await option(page, 'Ben').click()
  await page.getByRole('radio', { name: words('addForm.statusEnded') }).check()
  await link(page, 'relation.partner').click()
  await expect(group(page, words('panel.group.partners'))).toContainText('Ben')
  await expect(group(page, words('panel.group.partners'))).toContainText(words('panel.noteFormer'))
  await undo(page).click()
  await expect(group(page, words('panel.group.partners'))).not.toContainText('Ben')
})

test('link an existing half-sibling', async ({ page }) => {
  let tree = people('Ben', 'Karl', 'Maria', 'Eva')
  tree = addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
  await openWith(page, tree)
  await startAdd(page, 'relation.sister', 'link')
  await option(page, 'Eva').click()
  await page.getByRole('radio', { name: words('addForm.sharesOnly', { name: 'Karl' }) }).check()
  await expect(page.getByText(words('preview.halfSibling', { parent: 'Karl' }))).toBeVisible()
  await link(page, 'relation.sister').click()
  await expect(group(page, words('panel.group.siblings'))).toContainText('Eva')
  await expect(group(page, words('panel.group.siblings'))).toContainText(words('panel.noteHalf'))
})

test('people who cannot be linked are disabled with their reason, and the open picker has no axe violations', async ({
  page,
}) => {
  await openWith(page, addParentLink(people('Ben', 'Karl', 'Maria'), id(1), id(2)))
  await startAdd(page, 'relation.father', 'link')
  await expect(option(page, 'Karl')).toHaveAttribute('aria-disabled', 'true')
  await expect(option(page, 'Karl')).toContainText(words('link.reason.already-linked'))
  await expect(option(page, 'Maria')).toHaveAttribute('aria-disabled', 'false')
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await panel(page).getByRole('combobox', { name: words('link.search') }).fill('zzz')
  await expect(panel(page).getByText(words('link.noMatch'))).toBeVisible()
})

test('the picker finds people by an Arabic or a Latin name', async ({ page }) => {
  const tree = ['Ben', 'كريم', 'Maria', 'ليلى'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  await openWith(page, tree)
  await startAdd(page, 'relation.father', 'link')
  const search = panel(page).getByRole('combobox', { name: words('link.search') })
  await search.fill('كري')
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(option(page, 'كريم')).toBeVisible()
  await search.fill('mar')
  await expect(page.getByRole('option')).toHaveCount(1)
  await expect(option(page, 'Maria')).toBeVisible()
  await search.fill('')
  await expect(option(page, 'ليلى')).toBeVisible()
  await expect(option(page, 'Maria')).toBeVisible()
  await option(page, 'كريم').click()
  await link(page, 'relation.father').click()
  await expect(group(page, words('panel.group.parents'))).toContainText('كريم')
})

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('the rows of the picker are at least 44 px high', async ({ page }) => {
    await openWithTree(page, people('Ben', 'Karl', 'Maria'))
    await openPerson(page, 'Ben')
    await panel(page).getByRole('button', { name: words('panel.details') }).click()
    await startAdd(page, 'relation.father', 'link')
    for (const name of ['Karl', 'Maria']) {
      const box = (await option(page, name).boundingBox())!
      expect(box.height, name).toBeGreaterThanOrEqual(44)
    }
  })
  test('nothing runs off the screen with the picker open and a person chosen', async ({ page }) => {
    await openWithTree(page, people('Ben', 'Karl', 'Maria'))
    await openPerson(page, 'Ben')
    await panel(page).getByRole('button', { name: words('panel.details') }).click()
    // scrollWidth does not see content pushed past the left edge of a right-to-left page, so the boxes are checked too
    const fits = async () => {
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      for (const target of [panel(page).getByRole('combobox'), panel(page).getByRole('listbox'), page.getByText(words('preview.linkTitle'))]) {
        if (!(await target.count())) continue
        const box = (await target.first().boundingBox())!
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(390)
      }
    }
    await startAdd(page, 'relation.father', 'link')
    await fits()
    await option(page, 'Karl').click()
    await expect(page.getByText(words('preview.linkTitle'))).toBeVisible()
    await fits()
  })
})
