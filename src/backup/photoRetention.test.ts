import { describe, expect, it } from 'vitest'
import { createTreeStore } from '../domain/store.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { memoryPhotoStore } from '../photos/memoryPhotoStore.ts'
import { createPhotoGc } from '../photos/photoGc.ts'
import { memorySnapshots } from './memorySnapshots.ts'
import { MAX_SNAPSHOTS, createSnapshotKeeper } from './snapshots.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANNA = id(1)
const PHOTO = id(0xa1)

/** The real cleanup and the real keeper, over in-memory storage, as the app wires them. */
function setup() {
  const store = createTreeStore(addPerson(emptyTree(), { id: ANNA, firstName: 'Anna', photoId: PHOTO }))
  const photos = memoryPhotoStore()
  photos.blobs.set(PHOTO, new Blob(['photo']))
  let time = Date.parse('2026-09-01T08:00:00Z')
  let n = 0
  const keeper = createSnapshotKeeper(memorySnapshots(), () => new Date((time += 1000)), () => `snap-${++n}`)
  const gc = createPhotoGc(store, photos, undefined, keeper.referencedPhotoIds)
  /** Anna goes on without the photo, and nothing can be undone (a reload, an import or a restore does that). */
  const photoRemovedAndHistoryGone = () =>
    store.getState().loadTree({ ...emptyTree(), persons: [{ ...store.getState().persons[0], photoId: undefined }] })
  return { store, photos, keeper, gc, photoRemovedAndHistoryGone }
}

describe('photos and saved versions', () => {
  it('a photo nothing shows any more is deleted', async () => {
    const { photos, gc, photoRemovedAndHistoryGone } = setup()
    photoRemovedAndHistoryGone()
    await gc.sweep()
    expect(photos.blobs.size).toBe(0)
  })

  it('stays while a saved version shows it, so restoring that version brings the photo back', async () => {
    const { store, photos, keeper, gc, photoRemovedAndHistoryGone } = setup()
    await keeper.take(store.getState(), 'hourly')
    photoRemovedAndHistoryGone()
    await gc.sweep()
    expect([...photos.blobs.keys()]).toEqual([PHOTO])

    const [version] = await keeper.list()
    store.getState().loadTree((await keeper.get(version.id))!)
    expect(store.getState().persons[0].photoId).toBe(PHOTO)
    await gc.sweep()
    expect(photos.blobs.has(PHOTO)).toBe(true)
  })

  it('goes once the versions that showed it have been pushed out by newer ones', async () => {
    const { store, photos, keeper, gc, photoRemovedAndHistoryGone } = setup()
    await keeper.take(store.getState(), 'hourly')
    photoRemovedAndHistoryGone()
    await gc.sweep()
    expect(photos.blobs.has(PHOTO)).toBe(true)

    // five newer, different versions: the one that showed the photo is the oldest and falls off
    for (let people = 2; people <= MAX_SNAPSHOTS + 1; people++) {
      let tree = emptyTree()
      for (let i = 1; i <= people; i++) tree = addPerson(tree, { id: id(i), firstName: `P${i}` })
      await keeper.take(tree, 'import')
    }
    expect(await keeper.list()).toHaveLength(MAX_SNAPSHOTS)
    await gc.sweep()
    expect(photos.blobs.size).toBe(0)
  })
})
