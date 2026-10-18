import type { Locator, Page } from '@playwright/test'
import type { MessageKey } from '../src/i18n/messages.ts'
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

/** The "+ relation" button in a Person's panel. Exact: in Arabic "ابن" (son) is the start of "ابنة" (daughter). */
export const addButton = (panelOrPage: Locator | Page, relation: MessageKey) =>
  panelOrPage.getByRole('button', { name: words('panel.addAria', { relation: words(relation) }), exact: true })

/** The submit button of the add-a-relative form. */
export const submitButton = (page: Page, relation: MessageKey) =>
  page.getByRole('button', { name: words('addForm.submit', { relation: words(relation) }), exact: true })
