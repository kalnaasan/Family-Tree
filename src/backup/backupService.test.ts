import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { createTreeStore } from '../domain/store.ts'
import { msg } from '../i18n/messageRef.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { memoryPhotoStore } from '../photos/memoryPhotoStore.ts'
import { createBackupLogStore } from './backupLog.ts'
import { createBackupService } from './backupService.ts'
import { buildExport } from './exportFile.ts'
import { memorySnapshots } from './memorySnapshots.ts'
import { createSnapshotKeeper } from './snapshots.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PHOTO = id(201)
const now = new Date('2026-07-10T12:00:00Z')
const WEBP = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 1, 2, 3])

const treeOf = (...names: string[]): Tree =>
  names.reduce((tree, name, index) => addPerson(tree, { id: id(index + 1), firstName: name }), emptyTree())

function setup(initial: Tree = treeOf('Anna', 'Ben')) {
  const store = createTreeStore(initial)
  const photos = memoryPhotoStore()
  const snapshotStorage = memorySnapshots()
  let time = now.getTime()
  let snapshotNumber = 0
  const snapshots = createSnapshotKeeper(snapshotStorage, () => new Date(time), () => `snap-${++snapshotNumber}`)
  const releases: ReturnType<typeof vi.fn>[] = []
  const gc = {
    protect: vi.fn(() => {
      const release = vi.fn()
      releases.push(release)
      return release
    }),
    noteStored: vi.fn(),
  }
  const forgetPhoto = vi.fn()
  const download = vi.fn()
  const log = createBackupLogStore({ getItem: () => null, setItem: () => {} }, () => now)
  const service = createBackupService({
    store,
    photos,
    gc,
    forgetPhoto,
    snapshots,
    log,
    download,
    now: () => now,
    decode: async () => {},
  })
  return {
    store,
    photos,
    snapshotStorage,
    snapshots,
    gc,
    releases,
    forgetPhoto,
    download,
    log,
    service,
    tick: (ms: number) => void (time += ms),
  }
}

/** An export file of `tree`, as the user would pick it from disk, with a photo for the first Person when asked. */
async function fileOf(tree: Tree, withPhoto = false) {
  const photos = memoryPhotoStore()
  const used = withPhoto
    ? { ...tree, persons: tree.persons.map((p, i) => (i === 0 ? { ...p, photoId: PHOTO } : p)) }
    : tree
  if (withPhoto) photos.blobs.set(PHOTO, new Blob([WEBP], { type: 'image/webp' }))
  const built = await buildExport(used, photos, { includePhotos: true, now })
  return new Blob([built.text], { type: 'application/json' })
}

const names = (store: ReturnType<typeof createTreeStore>) => store.getState().persons.map((p) => p.firstName)

describe('export', () => {
  it('downloads the file named after the day, and notes the backup', async () => {
    const { service, download, log } = setup()
    const result = await service.exportBackup({ includePhotos: true })
    expect(result).toMatchObject({ ok: true, fileName: 'family-tree-2026-07-10.json', photoCount: 0 })
    expect(download).toHaveBeenCalledTimes(1)
    expect(download.mock.calls[0][1]).toBe('family-tree-2026-07-10.json')
    expect(JSON.parse(download.mock.calls[0][0]).persons).toHaveLength(2)
    expect(log.getState().lastBackupAt).toBe(now.toISOString())
  })

  it('reports a failure and does not note a backup that did not happen', async () => {
    const { service, download, log } = setup()
    download.mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(await service.exportBackup({ includePhotos: true })).toMatchObject({ ok: false })
    expect(log.getState().lastBackupAt).toBeNull()
  })
})

describe('import', () => {
  it('checks a file without changing anything', async () => {
    const { service, store, snapshotStorage } = setup()
    const result = await service.prepareImport(await fileOf(treeOf('Cleo', 'Dora', 'Emil')))
    expect(result.ok && result.prepared.tree.persons).toHaveLength(3)
    expect(names(store)).toEqual(['Anna', 'Ben'])
    expect(snapshotStorage.records.size).toBe(0)
  })

  it('names the rule when the file is bad', async () => {
    const { service } = setup()
    expect(await service.prepareImport(new Blob(['not json']))).toMatchObject({ ok: false, rule: 'not-json' })
    expect(await service.prepareImport(new Blob(['{"format":"other"}']))).toMatchObject({
      ok: false,
      rule: 'not-a-document',
    })
  })

  it('keeps a Snapshot of the current Tree first, then replaces it, and cannot be undone', async () => {
    const { service, store, snapshots, snapshotStorage } = setup()
    const prepared = await service.prepareImport(await fileOf(treeOf('Cleo', 'Dora', 'Emil')))
    if (!prepared.ok) throw new Error(prepared.message)

    expect(await service.applyImport(prepared.prepared)).toEqual({ ok: true })
    expect(names(store)).toEqual(['Cleo', 'Dora', 'Emil'])
    expect(store.getState().past).toEqual([]) // import is not undoable: the Snapshot is the way back
    expect(store.getState().undo()).toBeNull()

    const kept = await snapshots.list()
    expect(kept).toHaveLength(1)
    expect(kept[0]).toMatchObject({ reason: 'import', personCount: 2 })
    const before = await snapshots.get(kept[0].id)
    expect(before?.persons.map((p) => p.firstName)).toEqual(['Anna', 'Ben'])
    expect(snapshotStorage.records.size).toBe(1)
  })

  it('stores the photos before the Tree refers to them, and releases them from cleanup afterwards', async () => {
    const { service, store, photos, gc, releases, forgetPhoto } = setup()
    const prepared = await service.prepareImport(await fileOf(treeOf('Cleo', 'Dora'), true))
    if (!prepared.ok) throw new Error(prepared.message)

    const order: string[] = []
    const put = photos.put.bind(photos)
    photos.put = async (photoId, blob) => {
      order.push(`put while the Tree is ${names(store).join(',')}`)
      await put(photoId, blob)
    }
    await service.applyImport(prepared.prepared)

    expect(order).toEqual(['put while the Tree is Anna,Ben']) // the old Tree was still in place while the photo was written
    expect(photos.blobs.get(PHOTO)?.type).toBe('image/webp')
    expect(store.getState().persons[0].photoId).toBe(PHOTO)
    expect(gc.protect).toHaveBeenCalledWith(PHOTO)
    expect(gc.noteStored).toHaveBeenCalledWith(PHOTO)
    expect(forgetPhoto).toHaveBeenCalledWith(PHOTO)
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true)
  })

  it('replaces nothing when the safety copy cannot be kept', async () => {
    const { service, store, snapshotStorage, photos } = setup()
    snapshotStorage.failPut = true
    const prepared = await service.prepareImport(await fileOf(treeOf('Cleo'), true))
    if (!prepared.ok) throw new Error(prepared.message)
    const result = await service.applyImport(prepared.prepared)
    expect(result).toEqual({ ok: false, message: msg('backup.safetyCopyFailed') })
    expect(names(store)).toEqual(['Anna', 'Ben'])
    expect(photos.blobs.size).toBe(0)
  })

  it('replaces nothing when a photo cannot be stored, and says the space ran out', async () => {
    const { service, store, photos, releases } = setup()
    const prepared = await service.prepareImport(await fileOf(treeOf('Cleo'), true))
    if (!prepared.ok) throw new Error(prepared.message)
    photos.failWith = new DOMException('full', 'QuotaExceededError')
    const result = await service.applyImport(prepared.prepared)
    expect(result).toEqual({ ok: false, message: msg('backup.photosNoSpace') })
    expect(names(store)).toEqual(['Anna', 'Ben'])
    expect(releases.every((release) => release.mock.calls.length === 1)).toBe(true)
  })

  it('imports into an empty app without a Snapshot (there is nothing to protect)', async () => {
    const { service, store, snapshotStorage } = setup(emptyTree())
    const prepared = await service.prepareImport(await fileOf(treeOf('Cleo')))
    if (!prepared.ok) throw new Error(prepared.message)
    expect(await service.applyImport(prepared.prepared)).toEqual({ ok: true })
    expect(names(store)).toEqual(['Cleo'])
    expect(snapshotStorage.records.size).toBe(0)
  })
})

describe('restore', () => {
  let ctx: ReturnType<typeof setup>
  beforeEach(() => {
    ctx = setup()
  })

  it('brings a saved version back, keeping the current Tree as a version first', async () => {
    const { service, store, snapshots, tick } = ctx
    await snapshots.take(treeOf('Old one', 'Old two', 'Old three'), 'hourly')
    tick(1000)
    const [saved] = await snapshots.list()

    expect(await service.restoreSnapshot(saved.id)).toEqual({ ok: true })
    expect(names(store)).toEqual(['Old one', 'Old two', 'Old three'])
    expect(store.getState().past).toEqual([])

    const kept = await snapshots.list()
    expect(kept.map((s) => [s.reason, s.personCount])).toEqual([
      ['restore', 2],
      ['hourly', 3],
    ])
  })

  it('says so when the version is gone, and changes nothing', async () => {
    const { service, store } = ctx
    expect(await service.restoreSnapshot('missing')).toMatchObject({ ok: false })
    expect(names(store)).toEqual(['Anna', 'Ben'])
  })

  it('changes nothing when the current Tree cannot be kept first', async () => {
    const { service, store, snapshots, snapshotStorage, tick } = ctx
    await snapshots.take(treeOf('Old one'), 'hourly')
    tick(1000)
    const [saved] = await snapshots.list()
    snapshotStorage.failPut = true
    expect(await service.restoreSnapshot(saved.id)).toMatchObject({ ok: false })
    expect(names(store)).toEqual(['Anna', 'Ben'])
  })
})
