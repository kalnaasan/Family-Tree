import { type Page, expect } from '@playwright/test'

export const frame = (page: Page) => page.getByRole('group', { name: 'Family tree' })

/** The people drawn in the tree, in the order they were added. Their text is their name (and years, if known). */
export const peopleList = (page: Page) => frame(page).locator('[data-person-wrapper]')

export const panel = (page: Page) => page.getByRole('complementary', { name: 'Person details' })

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** A Person's button in the tree. Their accessible name starts with their name: "Maria, mother, born 1962". */
export const personButton = (page: Page, name: string) =>
  frame(page).getByRole('button', { name: new RegExp(`^${escapeRegExp(name)}(,|$)`) })

/** Opens a Person the keyboard way: focus them and press Enter. The panel's heading then has focus. */
export async function openPerson(page: Page, name: string) {
  await personButton(page, name).focus()
  await page.keyboard.press('Enter')
  await expect(panel(page).getByRole('heading', { level: 2, name })).toBeFocused()
}
