import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

test('app loads and has no axe violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Family Tree', exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
