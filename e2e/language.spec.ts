import { expect, test } from '@playwright/test'
import { test as bilingual } from './fixtures.ts' // `language` stays English here: the page starts English and Arabic is chosen

/** The Language (spec sections 13.1 and 13.7): a few literal Arabic strings, `lang` and `dir`, a live switch, and the release gate. */
const openSettings = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('button', { name, exact: true }).click()

test.describe('as released, Arabic is not offered', () => {
  test('an Arabic browser and an Arabic setting in storage both still get English, and Settings has no language choice', async ({
    browser,
  }) => {
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

/** The build with Arabic offered (`.env.arabic`), which is what the Arabic projects test. */
bilingual.describe('with Arabic offered', () => {
  bilingual.use({ baseURL: 'http://localhost:4174' })

  bilingual(
    'an Arabic setting makes the page Arabic, reading right to left, with the Arabic words',
    async ({ page }) => {
      await page.addInitScript(() => localStorage.setItem('family-tree.language', 'ar'))
      await page.goto('/')
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
      await expect(page.getByRole('heading', { name: 'شجرة العائلة', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'الإعدادات', exact: true })).toBeVisible()
      await expect(page.getByText('ابدأ شجرة عائلتك')).toBeVisible()
    },
  )

  bilingual('switching in Settings is live, with no reload, and is remembered after one', async ({ page }) => {
    await page.goto('/') // an English browser and nothing stored: English
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await openSettings(page, 'Settings')
    await page.getByRole('dialog').getByRole('combobox', { name: 'Language' }).selectOption('ar')
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
    await expect(page.getByRole('heading', { name: 'شجرة العائلة', exact: true })).toBeVisible()
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar')
    await expect(page.getByRole('heading', { name: 'شجرة العائلة', exact: true })).toBeVisible()
    await openSettings(page, 'الإعدادات')
    await page.getByRole('dialog').getByRole('combobox', { name: 'اللغة' }).selectOption('en')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr')
    await expect(page.getByRole('heading', { name: 'Family Tree', exact: true })).toBeVisible()
  })
})
