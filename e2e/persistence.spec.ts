import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import { peopleList } from './helpers.ts'

const indicator = (page: Page) => page.getByRole('status')

/** The first person through the empty state; each later one as a child of the person who is open. */
async function addPerson(page: Page, name: string) {
  const first = page.getByRole('button', { name: 'Add the first person' })
  // the page is ready once it shows either (the saved Tree is loaded after the tab has claimed the editing role)
  await first.or(page.getByRole('button', { name: 'Add child' })).first().waitFor()
  if (await first.isVisible()) {
    await page.getByLabel('First name').fill(name)
    await first.click()
    return
  }
  await page.getByRole('button', { name: 'Add child' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('First name').fill(name)
  await dialog.getByRole('button', { name: 'Add child' }).click()
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

/** True if a `beforeunload` event would be cancelled, i.e. the browser would prompt before leaving. */
const leavingWouldPrompt = (page: Page) =>
  page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })

const breakWrites = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __put?: IDBObjectStore['put'] }
    w.__put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = () => {
      throw new DOMException('simulated quota failure', 'QuotaExceededError')
    }
  })

const fixWrites = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __put?: IDBObjectStore['put'] }
    if (w.__put) IDBObjectStore.prototype.put = w.__put
  })

test('data survives a reload', async ({ page }) => {
  await page.goto('/')
  await expect(indicator(page)).toHaveText('Saved')
  await addPerson(page, 'Anna')
  await addPerson(page, 'Ben')
  await expect(indicator(page)).toHaveText('Saved')
  await page.reload()
  await expect(peopleList(page)).toHaveText(['Anna', 'Ben'])
})

test('a failed write shows the error, keeps the Tree, and the next change retries', async ({ page }) => {
  await page.goto('/')
  await expect(indicator(page)).toHaveText('Saved')
  await addPerson(page, 'Anna')
  await expect(indicator(page)).toHaveText('Saved')

  await breakWrites(page)
  await addPerson(page, 'Ben')
  await expect(indicator(page)).toHaveText('Could not save')
  await expect(peopleList(page)).toHaveText(['Anna', 'Ben'])
  await expect(page.getByRole('button', { name: 'Export a backup now' })).toBeVisible()
  expect(await leavingWouldPrompt(page)).toBe(true)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  await fixWrites(page)
  await addPerson(page, 'Cleo')
  await expect(indicator(page)).toHaveText('Saved')
  await expect(page.getByRole('button', { name: 'Export a backup now' })).toHaveCount(0)

  await page.reload()
  await expect(peopleList(page)).toHaveText(['Anna', 'Ben', 'Cleo'])
})

test('no leave prompt when everything is saved', async ({ page }) => {
  await page.goto('/')
  await expect(indicator(page)).toHaveText('Saved')
  expect(await leavingWouldPrompt(page)).toBe(false)
  await addPerson(page, 'Anna')
  await expect(indicator(page)).toHaveText('Saved')
  expect(await leavingWouldPrompt(page)).toBe(false)
})

test('an unreadable saved document is reported and never overwritten', async ({ page }) => {
  await page.goto('/')
  await expect(indicator(page)).toHaveText('Saved')
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('family-tree')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('tree', 'readwrite')
          tx.objectStore('tree').put({ format: 'family-tree', schemaVersion: 99 }, 'current')
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
        }
      }),
  )
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('could not be read')
  await expect(page.getByLabel('First name')).toHaveCount(0)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
