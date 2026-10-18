import type { Page } from '@playwright/test'
import { expect, words } from './fixtures.ts'
import { serializeDocument } from '../src/domain/document.ts'
import type { Tree } from '../src/domain/schema.ts'
import { generateTree } from '../src/layout/fixtures.ts'

/** Opens the app with a generated fixture Tree of `size` people already saved. */
export const openWithFixture = (page: Page, size: number, options: { names?: 'default' | 'arabic' } = {}) =>
  openWithTree(page, generateTree(size, 1, options))

/**
 * Opens the app with `tree` already saved, the way a returning user would find it. Returns the Tree so a test
 * can look up people by id.
 */
export async function openWithTree(page: Page, tree: Tree) {
  const document = serializeDocument(tree)
  // the first visit creates the database; then the fixture is written straight into it and the app reloaded
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))
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
  const frame = page.getByRole('group', { name: words('tree.label') })
  await expect(frame).toHaveAttribute('data-lod', /.+/)
  // the first draw is done once the count stops changing
  await page.waitForTimeout(250)
  return { tree, frame }
}

export const zoomOf = async (frame: ReturnType<Page['locator']>) => Number(await frame.getAttribute('data-zoom'))
