import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeStore } from '../domain/store.ts'
import { type MemoryPhotoStore, memoryPhotoStore } from './memoryPhotoStore.ts'
import { createPhotoGc } from './photoGc.ts'
import { createPhotoService } from './photoService.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const ANNA = id(1)
const PHOTO = id(0xa1)

let store: ReturnType<typeof createTreeStore>
let photos: MemoryPhotoStore
let service: ReturnType<typeof createPhotoService>

beforeEach(() => {
  store = createTreeStore()
  store.getState().addPerson({ id: ANNA, firstName: 'Anna' })
  photos = memoryPhotoStore()
  service = createPhotoService({ store, photos, gc: createPhotoGc(store, photos), newId: () => PHOTO })
})

const quotaError = () => Object.assign(new Error('full'), { name: 'QuotaExceededError' })

describe('setPhoto', () => {
  it('stores the Blob and gives the Person its photoId as one undoable step', async () => {
    const blob = new Blob(['webp'])
    expect(await service.setPhoto(ANNA, blob)).toEqual({ ok: true })
    expect(photos.blobs.get(PHOTO)).toBe(blob)
    expect(store.getState().persons[0]!.photoId).toBe(PHOTO)
    expect(store.getState().past.at(-1)!.label).toBe('Change photo')
  })

  it('writes the Blob before the Tree changes, so a saved Tree never names a missing photo', async () => {
    let storedWhenTreeChanged = false
    store.subscribe((state) => {
      storedWhenTreeChanged = state.persons[0]!.photoId === PHOTO && photos.blobs.has(PHOTO)
    })
    await service.setPhoto(ANNA, new Blob(['x']))
    expect(storedWhenTreeChanged).toBe(true)
  })

  it('a full disk leaves the Person as they were and says why', async () => {
    photos.failWith = quotaError()
    const before = store.getState().persons
    const result = await service.setPhoto(ANNA, new Blob(['x']))
    expect(result).toEqual({
      ok: false,
      message: 'There is not enough storage space left for this photo, so it was not added. Everything else is saved.',
    })
    expect(store.getState().persons).toBe(before)
    expect(store.getState().past).toHaveLength(1) // only the add; no step for the failed photo
  })

  it('any other storage failure also leaves the Person alone, with a plainer message', async () => {
    photos.failWith = new Error('disk on fire')
    const result = await service.setPhoto(ANNA, new Blob(['x']))
    expect(result.ok === false && result.message).toMatch(/could not be saved/)
    expect(store.getState().persons[0]!.photoId).toBeUndefined()
  })

  it('a Person who is gone meanwhile is a failure, and the stored Blob is cleaned up', async () => {
    const gc = createPhotoGc(store, photos)
    service = createPhotoService({ store, photos, gc, newId: () => PHOTO })
    store.getState().deletePerson(ANNA)
    const result = await service.setPhoto(ANNA, new Blob(['x']))
    expect(result.ok).toBe(false)
    await gc.sweep()
    expect(photos.blobs.has(PHOTO)).toBe(false)
  })

  it('a failed photo never blocks saving the Person: other edits still go through', async () => {
    photos.failWith = quotaError()
    await service.setPhoto(ANNA, new Blob(['x']))
    store.getState().updatePerson(ANNA, { lastName: 'Keller' })
    expect(store.getState().persons[0]!.lastName).toBe('Keller')
  })
})

describe('removePhoto', () => {
  it('takes the photo off as one undoable step, and undo puts it back', async () => {
    await service.setPhoto(ANNA, new Blob(['x']))
    service.removePhoto(ANNA)
    expect(store.getState().persons[0]!.photoId).toBeUndefined()
    expect(store.getState().past.at(-1)!.label).toBe('Remove photo')
    store.getState().undo()
    expect(store.getState().persons[0]!.photoId).toBe(PHOTO)
  })
})
