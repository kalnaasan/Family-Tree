import { expect, test } from '@playwright/test'
import { test as bilingual } from './fixtures.ts'

/** The Language (spec sections 13.1 and 13.7): a few literal Arabic strings, `lang` and `dir`, a live switch, and the release gate. */
const openSettings = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()

test.describe('as released, Arabic is not offered', () => {
  test('an Arabic browser and an Arabic setting in storage both still get English, and Settings has no language choice', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ar-EG' })
    const page = await context.newPage()
    await page.addInitScript(() => localStorage.setItem('family-tree.language', 'ar'))
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.getByRole('heading', { name: 'Family Tree', exact: true })).toBeVisible()
    await openSettings(page, 'Settings')
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').getByLabel('Language')).toHaveCount(0)
    await context.close()
  })
})

bilingual.describe('with Arabic offered', () => {
  bilingual.use({ language: 'ar' })

  bilingual('the page is Arabic, reads right to left and uses the Arabic words', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'شجرة العائلة', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'الإعدادات', exact: true })).toBeVisible()
    await expect(page.getByText('ابدأ شجرة عائلتك')).toBeVisible()
  })

  bilingual('switching in Settings is live, with no reload, and is remembered', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('family-tree.language'))
    await page.goto('/')
    // set after the init script cleared it: the page starts from the browser (English here) and Arabic is chosen
    await openSettings(page, 'Settings')
    await page.getByRole('dialog').getByLabel(/^(Language|اللغة)$/).selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.getByRole('heading', { name: 'Family Tree', exact: true })).toBeVisible()
    await page.getByRole('dialog').getByLabel(/^(Language|اللغة)$/).selectOption('ar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'شجرة العائلة', exact: true })).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('family-tree.language'))).toBe('ar')
  })
})
