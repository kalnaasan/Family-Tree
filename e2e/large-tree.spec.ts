import { expect, test } from '@playwright/test'
import { PERF_BUDGET } from '../src/config/perf-budget.ts'
import { frame } from './helpers.ts'
import { openWithFixture } from './seed.ts'

const notice = (page: import('@playwright/test').Page) => page.getByText(/the most the app is made for/)

async function zoomAllTheWayIn(page: import('@playwright/test').Page) {
  await frame(page).focus()
  for (let i = 0; i < 12; i++) await page.keyboard.press('+')
}

test('a Tree at the hard limit says so once and is drawn without the decorative leaves', async ({ page }) => {
  await openWithFixture(page, PERF_BUDGET.hardLimit)
  await expect(notice(page)).toBeVisible()
  await expect(notice(page)).toContainText('5,000 people or more')

  await zoomAllTheWayIn(page)
  await expect(frame(page)).toHaveAttribute('data-lod', 'noLeaves')

  // once: not again after a reload
  await page.reload()
  await expect(frame(page)).toHaveAttribute('data-lod', /.+/)
  await expect(notice(page)).toHaveCount(0)
})

test('a smaller Tree has no notice and keeps its leaves when zoomed in', async ({ page }) => {
  await openWithFixture(page, 300)
  await expect(notice(page)).toHaveCount(0)
  await zoomAllTheWayIn(page)
  await expect(frame(page)).toHaveAttribute('data-lod', 'full')
})

test('a Tree above the Worker threshold is drawn once the Worker has laid it out', async ({ page }) => {
  const { frame: tree } = await openWithFixture(page, PERF_BUDGET.workerLayoutAbove + 500)
  await expect(tree).toHaveAttribute('data-lod', /.+/)
  await expect(page.locator('[data-person-wrapper]').first()).toBeVisible()
  await expect(page.getByText('Laying out your tree…')).toHaveCount(0)
})
