import AxeBuilder from '@axe-core/playwright'
import { expect, test, words } from './fixtures.ts'

test('app loads and has no axe violations', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: words('app.title'), exact: true })).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
