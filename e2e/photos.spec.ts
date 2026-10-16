import AxeBuilder from '@axe-core/playwright'
import { type Page, expect, test } from '@playwright/test'
import type { Tree } from '../src/domain/schema.ts'
import { addPerson, emptyTree } from '../src/domain/tree.ts'
import { frame, openPerson, panel } from './helpers.ts'
import { openWithTree } from './seed.ts'

const ANNA = '00000000-0000-4000-8000-000000000001'
const anna = (): Tree => addPerson(emptyTree(), { id: ANNA, firstName: 'Anna' })

type Kind = 'image/jpeg' | 'image/png'

/** A `width` x `height` picture, left half red and right half blue. */
async function picture(page: Page, width: number, height: number, type: Kind): Promise<Buffer> {
  const base64 = await page.evaluate(
    async ([w, h, mime]) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d')!
      context.fillStyle = '#ff0000'
      context.fillRect(0, 0, w / 2, h)
      context.fillStyle = '#0000ff'
      context.fillRect(w / 2, 0, w / 2, h)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), mime, 0.95))
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return btoa(binary)
    },
    [width, height, type] as const,
  )
  return Buffer.from(base64, 'base64')
}

const SECRET = 'SECRET-CAMERA-GPS'

/** Adds an EXIF block to a JPEG: an orientation, and a camera name standing in for location and device data. */
function withExif(jpeg: Buffer, orientation: number): Buffer {
  const u16 = (n: number) => Buffer.from([n & 255, n >> 8])
  const u32 = (n: number) => Buffer.from([n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255])
  const text = Buffer.from(`${SECRET}\0`, 'latin1')
  const entry = (tag: number, type: number, count: number, value: Buffer) =>
    Buffer.concat([u16(tag), u16(type), u32(count), value])
  const dataOffset = 8 + 2 + 2 * 12 + 4
  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2a, 0x00]),
    u32(8),
    u16(2),
    entry(0x0112, 3, 1, Buffer.concat([u16(orientation), u16(0)])),
    entry(0x010f, 2, text.length, u32(dataOffset)),
    u32(0),
    text,
  ])
  const payload = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const segment = Buffer.concat([Buffer.from([0xff, 0xe1, (payload.length + 2) >> 8, (payload.length + 2) & 255]), payload])
  return Buffer.concat([jpeg.subarray(0, 2), segment, jpeg.subarray(2)])
}

interface Stored {
  id: string
  type: string
  size: number
}
/** What is in the photo store, read straight from IndexedDB. */
const storedPhotos = (page: Page): Promise<Stored[]> =>
  page.evaluate(
    () =>
      new Promise<{ id: string; type: string; size: number }[]>((resolve, reject) => {
        const open = indexedDB.open('family-tree')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const store = open.result.transaction('photos').objectStore('photos')
          const keys = store.getAllKeys()
          const values = store.getAll()
          values.onsuccess = () => {
            const result = (keys.result as string[]).map((id, i) => ({
              id,
              type: (values.result[i] as Blob).type,
              size: (values.result[i] as Blob).size,
            }))
            open.result.close()
            resolve(result)
          }
        }
      }),
  )

/** Looks inside the stored photo: its size, whether any EXIF or the marker survived, and three pixel colours. */
const inspectPhoto = (page: Page, id: string) =>
  page.evaluate(
    (photoId) =>
      new Promise<{ width: number; height: number; leaked: boolean; topLeft: number[]; bottomLeft: number[]; topRight: number[] }>(
        (resolve, reject) => {
          const open = indexedDB.open('family-tree')
          open.onerror = () => reject(open.error)
          open.onsuccess = () => {
            const get = open.result.transaction('photos').objectStore('photos').get(photoId)
            get.onsuccess = async () => {
              open.result.close()
              const blob = get.result as Blob
              const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()))
              const bitmap = await createImageBitmap(blob)
              const canvas = document.createElement('canvas')
              canvas.width = bitmap.width
              canvas.height = bitmap.height
              const context = canvas.getContext('2d')!
              context.drawImage(bitmap, 0, 0)
              const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data]
              resolve({
                width: bitmap.width,
                height: bitmap.height,
                leaked: /EXIF|Exif|SECRET-CAMERA/.test(text),
                topLeft: at(10, 10),
                bottomLeft: at(10, bitmap.height - 10),
                topRight: at(bitmap.width - 10, 10),
              })
            }
          }
        },
      ),
    id,
  )

const isRed = ([r, g, b]: number[]) => r! > 200 && g! < 60 && b! < 60
const isBlue = ([r, g, b]: number[]) => b! > 200 && r! < 60 && g! < 60

const editDetails = async (page: Page) => {
  await openPerson(page, 'Anna')
  await panel(page).getByRole('button', { name: 'Edit details' }).click()
}
const choose = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.getByLabel('Photo file').setInputFiles({ name, mimeType, buffer })
const cropDialog = (page: Page) => page.getByRole('dialog', { name: 'Crop photo' })
const confirmCrop = async (page: Page) => {
  await cropDialog(page).getByRole('button', { name: 'Use this photo' }).click()
  await expect(cropDialog(page)).toHaveCount(0)
}
/** Reloads once autosave has written everything, as a user who comes back later would find it. */
const reloadWhenSaved = async (page: Page) => {
  await expect(page.getByRole('status')).toHaveText('Saved')
  await page.reload()
}
const addPhoto = async (page: Page, buffer: Buffer, name = 'a.jpg') => {
  await choose(page, name, 'image/jpeg', buffer)
  await expect(cropDialog(page)).toBeVisible()
  await confirmCrop(page)
}

test('a photo is cropped, stored as a 512 px WebP with no EXIF, and the sideways photo comes out upright', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  // 400 x 200, red on the left; orientation 6 means "turn 90 degrees clockwise", so upright it is 200 x 400, red on top
  const sideways = withExif(await picture(page, 400, 200, 'image/jpeg'), 6)
  expect(sideways.toString('latin1')).toContain(SECRET)
  await addPhoto(page, sideways)

  const [stored] = await storedPhotos(page)
  expect(stored!.type).toBe('image/webp')
  const look = await inspectPhoto(page, stored!.id)
  expect([look.width, look.height]).toEqual([512, 512])
  expect(look.leaked).toBe(false)
  expect(isRed(look.topLeft)).toBe(true)
  expect(isBlue(look.bottomLeft)).toBe(true) // would be red if the orientation had been ignored

  // and the Person wears it in the tree and in the panel
  await panel(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(frame(page).locator('image')).toHaveAttribute('href', /^blob:/)
})

test('a PNG works too, and the crop can be moved and zoomed from the keyboard alone', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  await choose(page, 'wide.png', 'image/png', await picture(page, 400, 200, 'image/png'))
  const dialog = cropDialog(page)
  await expect(dialog).toBeVisible()
  const position = dialog.getByRole('group', { name: 'Photo position' })
  await expect(position).toBeFocused() // the dialog opens on the thing to move
  const zoom = dialog.getByRole('slider', { name: 'Zoom' })
  expect(Number(await zoom.inputValue())).toBe(1)
  for (let i = 0; i < 8; i++) await page.keyboard.press('+')
  expect(Number(await zoom.inputValue())).toBeGreaterThan(2)
  // zoomed in and nudged right, step by step, only blue is left in the square
  for (let i = 0; i < 80; i++) await page.keyboard.press('ArrowRight')
  await confirmCrop(page)
  const [stored] = await storedPhotos(page)
  const look = await inspectPhoto(page, stored!.id)
  expect(isBlue(look.topLeft) && isBlue(look.topRight) && isBlue(look.bottomLeft)).toBe(true)
})

test('Escape and Cancel leave the Person as they were', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  await choose(page, 'a.jpg', 'image/jpeg', await picture(page, 300, 300, 'image/jpeg'))
  await expect(cropDialog(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(cropDialog(page)).toHaveCount(0)
  await choose(page, 'a.jpg', 'image/jpeg', await picture(page, 300, 300, 'image/jpeg'))
  await cropDialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(cropDialog(page)).toHaveCount(0)
  expect(await storedPhotos(page)).toEqual([])
  await expect(panel(page).getByRole('button', { name: 'Choose photo' })).toBeVisible()
})

test.describe('files that are turned away', () => {
  const rejected = async (page: Page, name: string, mimeType: string, buffer: Buffer, message: RegExp) => {
    await openWithTree(page, anna())
    await editDetails(page)
    await choose(page, name, mimeType, buffer)
    await expect(panel(page).getByRole('alert')).toHaveText(message)
    await expect(cropDialog(page)).toHaveCount(0)
    expect(await storedPhotos(page)).toEqual([])
  }

  test('a HEIC photo says to convert it to JPEG', async ({ page }) => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic', 'latin1'), Buffer.alloc(32)])
    await rejected(page, 'IMG_0001.HEIC', 'image/heic', heic, /HEIC photo.*Convert it to JPEG first/)
  })

  test('something that is not a photo is named for what it is', async ({ page }) => {
    await rejected(page, 'holiday.jpg', 'image/jpeg', Buffer.from('%PDF-1.7 definitely not a photo'), /not a JPEG, PNG or WebP photo/)
  })

  test('a file over 25 MB says how big it is', async ({ page }) => {
    await openWithTree(page, anna())
    await editDetails(page)
    // made inside the page: sending 26 MB through the test protocol would only slow every other test down
    await page.evaluate(() => {
      const header = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
      const file = new File([header, new Uint8Array(26 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
      const transfer = new DataTransfer()
      transfer.items.add(file)
      const input = document.querySelector<HTMLInputElement>('input[type=file]')!
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await expect(panel(page).getByRole('alert')).toHaveText(/26\.0 MB\. Photos can be up to 25 MB/)
    await expect(cropDialog(page)).toHaveCount(0)
    expect(await storedPhotos(page)).toEqual([])
  })

  test('a damaged photo is reported, not crashed on', async ({ page }) => {
    const damaged = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('this is not really a jpeg')])
    await rejected(page, 'broken.jpg', 'image/jpeg', damaged, /could not be read/)
  })
})

test('replace, remove and delete: the old photo stays for Undo, and is gone after a reload', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  await addPhoto(page, await picture(page, 300, 300, 'image/jpeg'), 'one.jpg')
  await addPhoto(page, await picture(page, 300, 300, 'image/jpeg'), 'two.jpg')
  await expect.poll(async () => (await storedPhotos(page)).length).toBe(2) // the first is kept: Undo could bring it back

  await page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Undo' }).click()
  await expect(frame(page).locator('image')).toHaveAttribute('href', /^blob:/) // the first photo is back
  await page.getByRole('group', { name: 'History' }).getByRole('button', { name: 'Redo' }).click()

  await reloadWhenSaved(page) // history is memory only: nothing can be undone any more
  await expect.poll(async () => (await storedPhotos(page)).length).toBe(1) // the orphan sweep took the other one

  await editDetails(page)
  await panel(page).getByRole('button', { name: 'Remove photo' }).click()
  await expect(frame(page).locator('image')).toHaveCount(0)
  expect((await storedPhotos(page)).length).toBe(1) // still there for Undo
  await reloadWhenSaved(page)
  await expect.poll(async () => (await storedPhotos(page)).length).toBe(0)
})

test('deleting a Person deletes their photo once Undo can no longer need it', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  await addPhoto(page, await picture(page, 300, 300, 'image/jpeg'))
  await panel(page).getByRole('button', { name: 'Cancel' }).click()
  await panel(page).getByRole('button', { name: 'Delete Anna' }).click()
  expect((await storedPhotos(page)).length).toBe(1)
  await reloadWhenSaved(page)
  await expect.poll(async () => (await storedPhotos(page)).length).toBe(0)
})

test('a full disk never blocks saving the Person: the photo is refused with a reason, the rest is saved', async ({ page }) => {
  await openWithTree(page, anna())
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) {
      if (this.name === 'photos') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      return put.apply(this, args)
    }
  })
  await editDetails(page)
  await choose(page, 'a.jpg', 'image/jpeg', await picture(page, 300, 300, 'image/jpeg'))
  await confirmCrop(page)
  await expect(panel(page).getByRole('alert')).toHaveText(/not enough storage space left for this photo.*Everything else is saved/)
  expect(await storedPhotos(page)).toEqual([])

  await page.getByLabel('Last name').fill('Keller')
  await panel(page).getByRole('button', { name: 'Save' }).click()
  await expect(panel(page).getByRole('heading', { level: 2, name: 'Anna Keller' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Saved')
})

test('Settings shows how much storage the photos use', async ({ page }) => {
  await openWithTree(page, anna())
  await page.getByRole('button', { name: 'Settings' }).click()
  const settings = page.getByRole('dialog', { name: 'Settings' })
  await expect(settings.getByText('None')).toBeVisible()
  await settings.getByRole('button', { name: 'Close' }).click()

  await editDetails(page)
  await addPhoto(page, await picture(page, 300, 300, 'image/jpeg'))
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(settings.getByText(/^1 photo, \d+ KB$/)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(settings).toHaveCount(0)
})

test('axe finds nothing in the crop dialog, the edit form with a photo, or Settings', async ({ page }) => {
  await openWithTree(page, anna())
  await editDetails(page)
  await choose(page, 'a.jpg', 'image/jpeg', await picture(page, 400, 300, 'image/jpeg'))
  await expect(cropDialog(page)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await confirmCrop(page)
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await page.getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByRole('dialog', { name: 'Settings' }).getByText(/^1 photo/)).toBeVisible()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
})
