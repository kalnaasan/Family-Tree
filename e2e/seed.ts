import { type Page, expect } from '@playwright/test'
import { serializeDocument } from '../src/domain/document.ts'
import { generateTree } from '../src/layout/fixtures.ts'

/**
 * Opens the app with a generated fixture Tree of `size` people already saved, the way a returning user would
 * find it. Returns the Tree so a test can look up people by id.
 */
export async function openWithFixture(page: Page, size: number) {
  const tree = generateTree(size, 1)
  const document = serializeDocument(tree)
  // the first visit creates the database; then the fixture is written straight into it and the app reloaded
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.evaluate(
    (stored) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('family-tree')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const tx = open.result.transaction('tree', 'readwrite')
          tx.objectStore('tree').put(stored, 'current')
          tx.oncomplete = () => {
            open.result.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    document,
  )
  await page.reload()
  const frame = page.getByRole('group', { name: 'Family tree' })
  await expect(frame).toHaveAttribute('data-lod', /.+/)
  // the first draw is done once the count stops changing
  await page.waitForTimeout(250)
  return { tree, frame }
}

export const zoomOf = async (frame: ReturnType<Page['locator']>) => Number(await frame.getAttribute('data-zoom'))
