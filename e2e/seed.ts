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
  // WebKit does not draw frames for a page it takes to be in the background, which happens when tests run side by side:
  // animations then stop half way and the drawing never catches up. The page being tested is in front.
  await page.bringToFront()
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))
  // the app shows "Saved" before its own open has finished, so the database may not exist yet: opening it then would create
  // an empty one for the app to find. Such an open is undone and tried again once the app has made the real one.
  await expect(async () => {
    await page.evaluate(
      (stored) =>
        new Promise<void>((resolve, reject) => {
          const open = indexedDB.open('family-tree')
          open.onupgradeneeded = () => {
            open.transaction!.abort()
            reject(new Error('the app has not created its database yet'))
          }
          open.onerror = () => {} // the abort above reports it
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
  }).toPass()
  await page.reload()
  const frame = page.getByRole('group', { name: words('tree.label') })
  await expect(frame).toHaveAttribute('data-lod', /.+/)
  // the first draw is done once the count stops changing
  await page.waitForTimeout(250)
  return { tree, frame }
}

export const zoomOf = async (frame: ReturnType<Page['locator']>) => Number(await frame.getAttribute('data-zoom'))
