import type { Page } from '@playwright/test'
import type { MessageKey } from '../src/i18n/messages.ts'
import { capitalise } from '../src/i18n/format.ts'
import { expect, joined, words } from './fixtures.ts'

export const frame = (page: Page) => page.getByRole('group', { name: words('tree.label') })

/** The people drawn in the tree, in the order they were added. Their text is their name (and years, if known). */
export const peopleList = (page: Page) => frame(page).locator('[data-person-wrapper]')

export const panel = (page: Page) => page.getByRole('complementary', { name: words('panel.label') })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A Person's button in the tree. Their accessible name starts with their name: "Maria, mother, born 1962". */
export const personButton = (page: Page, name: string) =>
  frame(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(${joined('', '').trim()}|$)`) })

/** Opens a Person the keyboard way: focus them and press Enter. The panel's heading then has focus. */
export async function openPerson(page: Page, name: string) {
  await personButton(page, name).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2, name })).toBeFocused()
}

/** Which section's Add button opens the dialog for each relation. */
const SECTION: Record<string, 'parents' | 'partners' | 'children' | 'siblings'> = {
  father: 'parents', mother: 'parents', parent: 'parents',
  husband: 'partners', wife: 'partners', partner: 'partners',
  son: 'children', daughter: 'children', child: 'children',
  brother: 'siblings', sister: 'siblings', sibling: 'siblings',
}

/** The Add button of one section of a Person's panel ("Add parent", "Add partner", "Add child", "Add sibling"). */
export const sectionAddButton = (page: Page, section: 'parents' | 'partners' | 'children' | 'siblings') =>
  panel(page).getByRole('button', { name: words(`panel.addTo.${section}`), exact: true })

/**
 * Opens the relative dialog from the section's Add button, chooses the relation and how to add them ("Create a new
 * person" unless `method` is "link"), and goes on to the details. Exact: in Arabic "ابن" (son) is the start of "ابنة" (daughter).
 */
export async function startAdd(page: Page, relation: MessageKey, method: 'create' | 'link' = 'create') {
  await sectionAddButton(page, SECTION[relation.replace('relation.', '')]!).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('radio', { name: capitalise(words(relation)), exact: true }).check()
  if (method === 'link') await dialog.getByRole('radio', { name: words('relDialog.link'), exact: false }).check()
  await dialog.getByRole('button', { name: words('common.continue'), exact: true }).click()
}

/** Opens the Person's "More actions" menu in the panel. */
export const openActionsMenu = (page: Page) =>
  panel(page).getByRole('button', { name: new RegExp('^' + words('panel.moreActions', { name: '' }).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }).click()

/** "Make Focus person" from the panel's menu. */
export async function makeFocusPerson(page: Page) {
  await openActionsMenu(page)
  await page.getByRole('menuitem', { name: words('panel.makeFocus') }).click()
}

/** Deletes the open Person: the menu, then the confirmation. */
export async function deletePerson(page: Page, name: string) {
  await openActionsMenu(page)
  await page.getByRole('menuitem', { name: words('panel.delete', { name }) }).click()
  await page.getByRole('dialog').getByRole('button', { name: words('panel.delete', { name }), exact: true }).click()
}

/** The submit button of the add-a-relative form. */
export const submitButton = (page: Page, relation: MessageKey) =>
  page.getByRole('dialog').getByRole('button', { name: words('addForm.submit', { relation: words(relation) }), exact: true })
