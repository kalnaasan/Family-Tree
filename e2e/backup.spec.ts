import { readFileSync } from 'node:fs'
import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { serializeDocument } from '../src/domain/document.ts'
import type { Tree } from '../src/domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../src/domain/tree.ts'
import { expect, startingWith, test, words } from './fixtures.ts'
import { openPerson, panel, personButton } from './helpers.ts'
import { openWithTree } from './seed.ts'

const ANNA = '00000000-0000-4000-8000-000000000001'
const BEN = '00000000-0000-4000-8000-000000000002'
const CLEO = '00000000-0000-4000-8000-000000000003'
const ZED = '00000000-0000-4000-8000-0000000000f1'
const DAY = 24 * 60 * 60 * 1000

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** The words around the detail and the rule in a turned-away file's message: "Nothing was imported. §. (Rule: §.)". */
const rejectedWords = () => words('backup.rejected', { detail: '§', rule: '§' }).split('§')
/** Settings after a backup was made: "Last backup: " and then anything but the word for never. */
const notNever = () =>
  new RegExp(`^${escapeRegExp(words('backup.lastBackup', { when: '' }))}(?!${escapeRegExp(words('backup.never'))})`)

/** Anna and Ben, parents of Cleo (the Focus person). */
function family(): Tree {
  let tree = emptyTree()
  tree = addPerson(tree, { id: ANNA, firstName: 'Anna' })
  tree = addPerson(tree, { id: BEN, firstName: 'Ben' })
  tree = addPerson(tree, { id: CLEO, firstName: 'Cleo' })
  tree = addParentLink(tree, CLEO, ANNA)
  tree = addParentLink(tree, CLEO, BEN)
  return { ...tree, focusPersonId: CLEO }
}

const settings = (page: Page) => page.getByRole('dialog', { name: words('app.settings') })
const openSettings = async (page: Page) => {
  await page.getByRole('button', { name: words('app.settings') }).click()
  await expect(settings(page)).toBeVisible()
}
const closeSettings = async (page: Page) => {
  await settings(page)
    .getByRole('button', { name: words('common.close') })
    .click()
  await expect(settings(page)).toHaveCount(0)
}
const saved = (page: Page) => expect(page.getByRole('status')).toHaveText(words('save.saved'))

/** Presses Export in Settings and returns the text of the file that is downloaded. */
async function exportFile(page: Page): Promise<string> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings(page)
      .getByRole('button', { name: words('backup.export'), exact: true })
      .click(),
  ])
  return readFileSync(await download.path(), 'utf8')
}

const chooseBackupFile = (page: Page, text: string, name = 'family.json') =>
  settings(page)
    .getByLabel(words('backup.fileLabel'))
    .setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(text) })

/** The export without the time it was made, which differs every time. */
const sameness = (text: string) => {
  const { exportedAt: _, ...rest } = JSON.parse(text)
  return rest
}

/** A `width` x `height` picture of the given type. */
async function picture(page: Page, width: number, height: number, type: 'image/jpeg' | 'image/png'): Promise<Buffer> {
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

/** Gives Anna a photo the way a user does. */
async function givePhotoToAnna(page: Page) {
  await openPerson(page, 'Anna')
  await panel(page)
    .getByRole('button', { name: words('panel.edit') })
    .click()
  await page.getByLabel(words('photo.fileLabel')).setInputFiles({
    name: 'a.jpg',
    mimeType: 'image/jpeg',
    buffer: await picture(page, 300, 300, 'image/jpeg'),
  })
  await page
    .getByRole('dialog', { name: words('crop.title') })
    .getByRole('button', { name: words('crop.use') })
    .click()
  await expect(page.getByRole('dialog', { name: words('crop.title') })).toHaveCount(0)
  await panel(page)
    .getByRole('button', { name: words('common.cancel') })
    .click()
  await saved(page)
}

const storedPhotoCount = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const open = indexedDB.open('family-tree')
        open.onerror = () => reject(open.error)
        open.onsuccess = () => {
          const count = open.result.transaction('photos').objectStore('photos').count()
          count.onsuccess = () => {
            open.result.close()
            resolve(count.result)
          }
        }
      }),
  )

/** Adds a child to the open Person, the way persistence.spec does. */
async function addChild(page: Page, name: string) {
  await page
    .getByRole('button', { name: words('panel.addAria', { relation: words('relation.child') }), exact: true })
    .click()
  await page.getByLabel(words('fields.firstName')).fill(name)
  await page
    .getByRole('button', { name: words('panel.addAria', { relation: words('relation.child') }), exact: true })
    .click()
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

test('export then import gives the identical document with its photo, after a safety copy of the old tree', async ({
  page,
}) => {
  await openWithTree(page, family())
  await givePhotoToAnna(page)

  await openSettings(page)
  await expect(settings(page).getByText(words('backup.lastBackup', { when: words('backup.never') }))).toBeVisible()
  const first = await exportFile(page)
  expect(Object.keys(JSON.parse(first).photos)).toHaveLength(1)
  await expect(settings(page).getByText(notNever())).toBeVisible()
  await closeSettings(page)

  // the tree moves on: a fourth person
  await openPerson(page, 'Cleo')
  await addChild(page, 'Dora')
  await saved(page)

  await openSettings(page)
  await chooseBackupFile(page, first)
  const question = settings(page).getByRole('group', { name: words('backup.confirmTitle') })
  await expect(question).toContainText(
    words('backup.confirmFilePhotos', {
      people: words('common.people', { count: 3 }),
      photos: words('common.photos', { count: 1 }),
    }),
  )
  await expect(question).toContainText(words('backup.confirmTree', { people: words('common.people', { count: 4 }) }))
  await expect(question.getByRole('heading')).toBeFocused()
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

  // Cancel changes nothing
  await question.getByRole('button', { name: words('common.cancel') }).click()
  await expect(question).toHaveCount(0)
  await closeSettings(page)
  await expect(personButton(page, 'Dora')).toBeVisible()

  await openSettings(page)
  await chooseBackupFile(page, first)
  await settings(page)
    .getByRole('button', { name: words('backup.replace') })
    .click()
  await expect(settings(page)).toHaveCount(0)
  await expect(page.getByText(words('backup.imported', { count: 3 }))).toBeVisible()
  await expect(personButton(page, 'Dora')).toHaveCount(0)
  for (const name of ['Anna', 'Ben', 'Cleo']) await expect(personButton(page, name)).toBeVisible()
  await expect(page.getByRole('group', { name: words('tree.label') }).locator('image')).toHaveAttribute(
    'href',
    /^blob:/,
  )
  await saved(page)

  // exporting again writes the same document, photo included
  await openSettings(page)
  expect(sameness(await exportFile(page))).toEqual(sameness(first))

  // the tree before the import is kept as a version
  await expect(
    settings(page)
      .getByRole('listitem')
      .filter({ hasText: words('common.people', { count: 4 }) })
      .filter({ hasText: words('restore.reason.import') }),
  ).toBeVisible()

  // and the imported tree survives a reload
  await closeSettings(page)
  await saved(page)
  await page.reload()
  await expect(personButton(page, 'Anna')).toBeVisible()
  await expect(personButton(page, 'Dora')).toHaveCount(0)
})

test('"Export current tree first" downloads before anything is replaced', async ({ page }) => {
  await openWithTree(page, family())
  await openSettings(page)
  await chooseBackupFile(page, JSON.stringify(serializeDocument(addPerson(emptyTree(), { id: ZED, firstName: 'Zed' }))))
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    settings(page)
      .getByRole('button', { name: words('backup.exportFirst') })
      .click(),
  ])
  expect(JSON.parse(readFileSync(await download.path(), 'utf8')).persons).toHaveLength(3)
  await expect(settings(page).getByRole('group', { name: words('backup.confirmTitle') })).toBeVisible()
  await closeSettings(page)
  await expect(personButton(page, 'Anna')).toBeVisible()
})

test('restoring the version from before an import brings back the people and their photos', async ({ page }) => {
  await openWithTree(page, family())
  await givePhotoToAnna(page)
  expect(await storedPhotoCount(page)).toBe(1)

  // replace everything with a file that has one person and no photos
  await openSettings(page)
  await chooseBackupFile(page, JSON.stringify(serializeDocument(addPerson(emptyTree(), { id: ZED, firstName: 'Zed' }))))
  await settings(page)
    .getByRole('button', { name: words('backup.replace') })
    .click()
  await expect(page.getByText(words('backup.imported', { count: 1 }))).toBeVisible()
  await expect(personButton(page, 'Zed')).toBeVisible()
  await expect(personButton(page, 'Anna')).toHaveCount(0)
  await saved(page)
  // Anna's photo is not thrown away while a saved version still shows it
  expect(await storedPhotoCount(page)).toBe(1)

  await openSettings(page)
  const versions = settings(page).getByRole('listitem')
  await expect(versions.filter({ hasText: words('restore.reason.load') })).toBeVisible()
  const before = versions.filter({ hasText: words('restore.reason.import') })
  await expect(before).toContainText(words('common.people', { count: 3 }))
  await before.getByRole('button', { name: startingWith(words('restore.buttonAria', { when: '' }).trim()) }).click()
  await expect(before.getByRole('group')).toContainText(
    words('restore.question', {
      current: words('common.people', { count: 1 }),
      version: words('common.people', { count: 3 }),
    }),
  )
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
  await before.getByRole('button', { name: words('restore.confirm') }).click()

  await expect(settings(page)).toHaveCount(0)
  await expect(page.getByText(startingWith(words('restore.done', { when: '§' }).split('§')[0]!.trim()))).toBeVisible()
  for (const name of ['Anna', 'Ben', 'Cleo']) await expect(personButton(page, name)).toBeVisible()
  await expect(personButton(page, 'Zed')).toHaveCount(0)
  await expect(page.getByRole('group', { name: words('tree.label') }).locator('image')).toHaveAttribute(
    'href',
    /^blob:/,
  )

  // restoring kept the tree it replaced, so that is one click away too
  await saved(page)
  await openSettings(page)
  await expect(
    settings(page)
      .getByRole('listitem')
      .filter({ hasText: words('restore.reason.restore') }),
  ).toContainText(words('common.people', { count: 1 }))
})

test.describe('files that are turned away', () => {
  const turnedAway = async (page: Page, text: string, message: RegExp) => {
    await openWithTree(page, family())
    await openSettings(page)
    await chooseBackupFile(page, text)
    await expect(settings(page).getByRole('alert')).toContainText(message)
    await expect(settings(page).getByRole('alert')).toContainText(rejectedWords()[0]!.trim())
    await expect(settings(page).getByRole('group', { name: words('backup.confirmTitle') })).toHaveCount(0)
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
    await closeSettings(page)
    for (const name of ['Anna', 'Ben', 'Cleo']) await expect(personButton(page, name)).toBeVisible()
  }
  const document = () => JSON.parse(JSON.stringify(serializeDocument(family())))

  test('text that is not JSON', async ({ page }) => {
    await turnedAway(page, '<html>hello</html>', /not-json/)
  })

  test('JSON that is not a family tree', async ({ page }) => {
    await turnedAway(page, '{"hello":"world"}', /not-a-document/)
  })

  test('a file from a newer version of the app', async ({ page }) => {
    await turnedAway(page, JSON.stringify({ ...document(), schemaVersion: 99 }), /unsupported-version/)
  })

  test('a tree that breaks a rule: a parent who is their own descendant', async ({ page }) => {
    const broken = document()
    broken.parentLinks.push({ childId: ANNA, parentId: CLEO, kind: 'birth' })
    await turnedAway(
      page,
      JSON.stringify(broken),
      new RegExp(`${escapeRegExp(rejectedWords()[1]!)}(?!invalid-data|not-)`),
    )
  })

  test('a photo that is not an image, naming the Person', async ({ page }) => {
    const bad = document()
    bad.persons[0].photoId = ZED
    await turnedAway(
      page,
      JSON.stringify({ ...bad, photos: { [ZED]: 'data:image/png;base64,AAAA' } }),
      /The photo of Anna .*not the kind of image.*invalid-photo/,
    )
  })

  test('a photo that looks right but cannot be opened', async ({ page }) => {
    await page.goto('/')
    const truncated = (await picture(page, 200, 200, 'image/png')).subarray(0, 60)
    const bad = document()
    bad.persons[1].photoId = ZED
    await turnedAway(
      page,
      JSON.stringify({ ...bad, photos: { [ZED]: `data:image/png;base64,${truncated.toString('base64')}` } }),
      /The photo of Ben .*cannot be opened/,
    )
  })
})

/** Makes the browser answer the request to keep storage safe one way or the other. */
const browserKeepsStorage = (page: Page, answer: boolean) =>
  page.addInitScript((value) => {
    Object.defineProperty(StorageManager.prototype, 'persist', {
      value: () => Promise.resolve(value),
      configurable: true,
    })
  }, answer)

/** What the app finds in the browser about earlier backups, before it starts. */
const earlierBackups = (page: Page, log: Record<string, unknown>) =>
  page.addInitScript((value) => localStorage.setItem('family-tree.backup', JSON.stringify(value)), log)

const banner = (page: Page) => page.getByRole('region', { name: words('backupBanner.label') })

async function firstPerson(page: Page, name: string) {
  await page.goto('/')
  await expect(page.getByRole('status')).toHaveText(words('save.saved'))
  await page.getByLabel(words('fields.firstName')).fill(name)
  await page.getByRole('button', { name: words('empty.add') }).click()
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

test.describe('asking for a backup', () => {
  test('a browser that will not keep the data safe gets a banner, and one export makes it go away', async ({
    page,
  }) => {
    await browserKeepsStorage(page, false)
    await firstPerson(page, 'Anna')
    await expect(banner(page)).toContainText(words('backupBanner.persistDenied'))
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      banner(page)
        .getByRole('button', { name: words('backupBanner.export') })
        .click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^family-tree-\d{4}-\d{2}-\d{2}\.json$/)
    await expect(
      page.getByText(startingWith(words('backup.saved', { fileName: 'family-tree-' }).replace(/\.$/, ''))),
    ).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
    await openSettings(page)
    await expect(settings(page).getByText(notNever())).toBeVisible()
  })

  test('dismissing it hides it, and it stays hidden after a reload', async ({ page }) => {
    await browserKeepsStorage(page, false)
    await firstPerson(page, 'Anna')
    await banner(page)
      .getByRole('button', { name: words('common.dismiss') })
      .click()
    await expect(banner(page)).toHaveCount(0)
    await saved(page)
    await page.reload()
    await expect(personButton(page, 'Anna')).toBeVisible()
    await expect(banner(page)).toHaveCount(0)
  })

  test('a browser that keeps the data safe says nothing', async ({ page }) => {
    await browserKeepsStorage(page, true)
    await firstPerson(page, 'Anna')
    await expect(banner(page)).toHaveCount(0)
  })

  test('after 20 edits since the last backup, and not before', async ({ page }) => {
    await browserKeepsStorage(page, true)
    await earlierBackups(page, {
      lastBackupAt: new Date(Date.now() - 2 * DAY).toISOString(),
      editsSinceBackup: 18,
      firstEditAt: null,
      dismissedAt: null,
    })
    await firstPerson(page, 'Anna') // the 19th
    await expect(banner(page)).toHaveCount(0)
    await addChild(page, 'Ben') // the 20th
    await expect(banner(page)).toContainText(words('backupBanner.edits', { count: 20 }))
  })

  test('after 30 days with changes that were never backed up', async ({ page }) => {
    await browserKeepsStorage(page, true)
    await earlierBackups(page, {
      lastBackupAt: new Date(Date.now() - 31 * DAY).toISOString(),
      editsSinceBackup: 0,
      firstEditAt: null,
      dismissedAt: null,
    })
    await firstPerson(page, 'Anna')
    await expect(banner(page)).toContainText(words('backupBanner.old'))
  })

  const lotsOfEdits = { lastBackupAt: null, editsSinceBackup: 25 }

  test('a dismissal 29 days ago still holds', async ({ page }) => {
    await browserKeepsStorage(page, true)
    await earlierBackups(page, {
      ...lotsOfEdits,
      firstEditAt: new Date(Date.now() - 40 * DAY).toISOString(),
      dismissedAt: new Date(Date.now() - 29 * DAY).toISOString(),
    })
    await firstPerson(page, 'Anna')
    await expect(banner(page)).toHaveCount(0)
  })

  test('a dismissal 31 days ago has run out', async ({ page }) => {
    await browserKeepsStorage(page, true)
    await earlierBackups(page, {
      ...lotsOfEdits,
      firstEditAt: new Date(Date.now() - 40 * DAY).toISOString(),
      dismissedAt: new Date(Date.now() - 31 * DAY).toISOString(),
    })
    await firstPerson(page, 'Anna')
    await expect(banner(page)).toContainText(words('backupBanner.edits', { count: 3 }).replace('3', '').split(' ')[0]!)
  })
})
