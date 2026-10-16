import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT } from '../domain/history.ts'
import { createTreeStore } from '../domain/store.ts'
import { type MemoryPhotoStore, memoryPhotoStore } from './memoryPhotoStore.ts'
import { createPhotoGc, referencedPhotoIds } from './photoGc.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const ANNA = id(1)
const A = id(0xa1)
const B = id(0xb1)
const blob = () => new Blob(['x'])

let store: ReturnType<typeof createTreeStore>
let photos: MemoryPhotoStore
let deleted: string[]

beforeEach(() => {
  store = createTreeStore()
  store.getState().addPerson({ id: ANNA, firstName: 'Anna' })
  photos = memoryPhotoStore()
  deleted = []
})

const setup = () => createPhotoGc(store, photos, (photoId) => deleted.push(photoId))
const givePhoto = async (photoId: string) => {
  await photos.put(photoId, blob())
  store.getState().updatePerson(ANNA, { photoId }, 'Change photo')
}

describe('referencedPhotoIds', () => {
  it('counts the Tree and every step undo or redo would bring back', async () => {
    await givePhoto(A)
    store.getState().updatePerson(ANNA, { photoId: undefined })
    await givePhoto(B)
    expect(referencedPhotoIds(store.getState())).toEqual(new Set([A, B]))
    store.getState().undo()
    store.getState().undo()
    expect(referencedPhotoIds(store.getState())).toEqual(new Set([A, B])) // redo still reaches B
  })

  it('is empty for a Tree without photos', () => {
    expect(referencedPhotoIds(store.getState())).toEqual(new Set())
  })
})

describe('the sweep', () => {
  it('deletes the photos nothing refers to (the orphan sweep on load) and keeps the rest', async () => {
    await photos.put(A, blob())
    await photos.put(B, blob())
    store.getState().loadTree({
      focusPersonId: ANNA,
      persons: [{ id: ANNA, firstName: 'Anna', gender: 'unknown', deceased: false, photoId: A }],
      parentLinks: [],
      partnerships: [],
    })
    await setup().sweep()
    expect([...photos.blobs.keys()]).toEqual([A])
  })

  it('leaves the photos alone when there are none', async () => {
    await setup().sweep()
    expect(photos.blobs.size).toBe(0)
  })

  it('tells the caller which photos went, so their object URLs can be released', async () => {
    await photos.put(B, blob())
    await setup().sweep()
    expect(deleted).toEqual([B])
  })

  it('a storage failure leaves the photo and does not throw; the next sweep tries again', async () => {
    await photos.put(B, blob())
    const gc = setup()
    photos.failDelete = true
    await expect(gc.sweep()).resolves.toBeUndefined()
    expect(photos.blobs.has(B)).toBe(true)
    photos.failDelete = false
    await gc.sweep()
    expect(photos.blobs.has(B)).toBe(false)
  })

  it('keeps a photo that is stored but not yet in the Tree, until it is released', async () => {
    const gc = setup()
    await gc.sweep()
    const release = gc.protect(B)
    await photos.put(B, blob())
    gc.noteStored(B)
    await gc.sweep()
    expect(photos.blobs.has(B)).toBe(true)
    release()
    await gc.sweep()
    expect(photos.blobs.has(B)).toBe(false)
  })
})

describe('photos other things keep (saved versions)', () => {
  it('keeps a photo the extra references name, though neither the Tree nor undo needs it', async () => {
    await photos.put(A, blob())
    await photos.put(B, blob())
    await createPhotoGc(store, photos, undefined, async () => new Set([A])).sweep()
    expect([...photos.blobs.keys()]).toEqual([A])
  })

  it('sweeps nothing at all when the extra references cannot be read: a photo is never lost to a hiccup', async () => {
    await photos.put(A, blob())
    const gc = createPhotoGc(store, photos, undefined, async () => {
      throw new Error('storage busy')
    })
    await gc.sweep()
    expect([...photos.blobs.keys()]).toEqual([A])
  })
})

describe('the photo lifecycle with undo', () => {
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

  it('replacing keeps the old photo for undo, and drops it when the step falls out of history', async () => {
    const gc = setup()
    gc.start()
    await givePhoto(A)
    await givePhoto(B)
    await flush()
    expect([...photos.blobs.keys()].sort()).toEqual([A, B])
    store.getState().undo()
    expect(store.getState().persons[0]!.photoId).toBe(A) // A is still there to come back to
    for (let i = 0; i < HISTORY_LIMIT + 2; i++) store.getState().updatePerson(ANNA, { lastName: `L${i}` })
    await flush()
    expect([...photos.blobs.keys()]).toEqual([A])
    expect(deleted).toEqual([B])
    gc.stop()
  })

  it('removing a photo keeps the Blob until undo can no longer need it', async () => {
    const gc = setup()
    gc.start()
    await givePhoto(A)
    store.getState().updatePerson(ANNA, { photoId: undefined }, 'Remove photo')
    await flush()
    expect(photos.blobs.has(A)).toBe(true)
    store.getState().undo()
    expect(store.getState().persons[0]!.photoId).toBe(A)
    gc.stop()
  })

  it('deleting a Person keeps their photo for undo; a load, which clears history, lets it go', async () => {
    const gc = setup()
    gc.start()
    await givePhoto(A)
    store.getState().deletePerson(ANNA)
    await flush()
    expect(photos.blobs.has(A)).toBe(true)
    store.getState().undo()
    expect(store.getState().persons[0]!.photoId).toBe(A)
    store.getState().deletePerson(ANNA)
    store.getState().loadTree({ focusPersonId: null, persons: [], parentLinks: [], partnerships: [] })
    await flush()
    expect(photos.blobs.has(A)).toBe(false)
    gc.stop()
  })

  it('does nothing after stop()', async () => {
    const gc = setup()
    gc.start()
    gc.stop()
    await photos.put(B, blob())
    store.getState().updatePerson(ANNA, { lastName: 'X' })
    await flush()
    expect(photos.blobs.has(B)).toBe(true)
  })

  it('reads the stored photos once for a burst of changes', async () => {
    const keys = vi.spyOn(photos, 'keys')
    const gc = setup()
    gc.start()
    for (let i = 0; i < 5; i++) store.getState().updatePerson(ANNA, { lastName: `L${i}` })
    await flush()
    expect(keys).toHaveBeenCalledTimes(1) // the known photos are read once, then kept up to date
    gc.stop()
  })
})
