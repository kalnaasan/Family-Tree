import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, test, words } from './fixtures.ts'
import { openWithTree } from './seed.ts'
import { addPerson, emptyTree } from '../src/domain/tree.ts'

const tree = () => addPerson(emptyTree(), { id: '00000000-0000-4000-8000-000000000001', firstName: 'Anna' })

const dialog = (page: Page) => page.getByRole('dialog', { name: words('app.settings') })
const tab = (page: Page, key: 'storage' | 'backup' | 'versions') =>
  dialog(page).getByRole('tab', { name: words(`settings.tab.${key}`) })

async function openSettings(page: Page) {
  await openWithTree(page, tree())
  await page.getByRole('button', { name: words('app.settings'), exact: true }).click()
  await expect(dialog(page)).toBeVisible()
}

test('Settings has a tab for storage, backup and previous versions, and one panel at a time', async ({ page }) => {
  await openSettings(page)
  await expect(dialog(page).getByRole('tablist', { name: words('settings.tabs') })).toBeVisible()
  await tab(page, 'storage').click()
  await expect(tab(page, 'storage')).toHaveAttribute('aria-selected', 'true')
  // the tree is saved in this browser only, and the page says so
  await expect(dialog(page).getByRole('tabpanel')).toContainText(words('settings.storageNote'))
  await expect(dialog(page).getByRole('button', { name: words('backup.export'), exact: true })).toHaveCount(0)

  await tab(page, 'backup').click()
  await expect(dialog(page).getByRole('button', { name: words('backup.export'), exact: true })).toBeVisible()
  await expect(dialog(page).getByRole('tabpanel')).toContainText(words('backup.explain'))

  await tab(page, 'versions').click()
  await expect(dialog(page).getByRole('heading', { name: words('restore.title') })).toBeVisible()
})

test('the tabs work from the keyboard: arrows move, Home and End jump, Escape closes', async ({ page }) => {
  await openSettings(page)
  await tab(page, 'storage').click()
  await tab(page, 'storage').focus()
  await page.keyboard.press('ArrowDown')
  await expect(tab(page, 'backup')).toBeFocused()
  await expect(tab(page, 'backup')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(tab(page, 'versions')).toBeFocused()
  await page.keyboard.press('ArrowDown') // wraps round
  await expect(page.getByRole('tab').first()).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: words('app.settings'), exact: true })).toBeFocused()
})

test('every tab passes axe', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSettings(page)
  for (const key of ['storage', 'backup', 'versions'] as const) {
    await tab(page, key).click()
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  }
})

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Settings fills the screen and nothing runs off it', async ({ page }) => {
    await openSettings(page)
    const box = (await dialog(page).boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(388)
    expect(box.height).toBeGreaterThanOrEqual(840)
    const scroll = await dialog(page).evaluate((el) => el.scrollWidth - el.clientWidth)
    expect(scroll).toBeLessThanOrEqual(0)
  })
})
