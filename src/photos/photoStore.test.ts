// @vitest-environment node
// jsdom's Blob does not survive the fake IndexedDB's structured clone (its size comes back NaN); Node's does.
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createPhotoStore, isQuotaError } from './photoStore.ts'

const A = '00000000-0000-4000-8000-0000000000a1'
const B = '00000000-0000-4000-8000-0000000000b1'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() // fresh database for every test
})

describe('photo store', () => {
  it('starts empty', async () => {
    const store = createPhotoStore()
    expect(await store.keys()).toEqual([])
    expect(await store.usage()).toEqual({ count: 0, bytes: 0 })
    expect(await store.get(A)).toBeUndefined()
  })

  it('keeps a Blob under its photoId, across a new connection as after a reload', async () => {
    await createPhotoStore().put(A, new Blob(['hello'], { type: 'image/webp' }))
    const back = await createPhotoStore().get(A)
    expect(back?.size).toBe(5)
    expect(back?.type).toBe('image/webp')
  })

  it('lists the ids, adds up the sizes, and deletes one at a time', async () => {
    const store = createPhotoStore()
    await store.put(A, new Blob(['12345']))
    await store.put(B, new Blob(['123']))
    expect((await store.keys()).sort()).toEqual([A, B])
    expect(await store.usage()).toEqual({ count: 2, bytes: 8 })
    await store.delete(A)
    expect(await store.keys()).toEqual([B])
    expect(await store.usage()).toEqual({ count: 1, bytes: 3 })
  })

  it('deleting a photo that is not there is not an error', async () => {
    await expect(createPhotoStore().delete(A)).resolves.toBeUndefined()
  })

  it('replacing the same id keeps one photo', async () => {
    const store = createPhotoStore()
    await store.put(A, new Blob(['1']))
    await store.put(A, new Blob(['12']))
    expect(await store.usage()).toEqual({ count: 1, bytes: 2 })
  })
})

describe('isQuotaError', () => {
  it('recognises the browser running out of storage', () => {
    expect(isQuotaError(new DOMException('full', 'QuotaExceededError'))).toBe(true)
    expect(isQuotaError(Object.assign(new Error('x'), { name: 'QuotaExceededError' }))).toBe(true)
  })

  it('and nothing else', () => {
    expect(isQuotaError(new Error('x'))).toBe(false)
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError('QuotaExceededError')).toBe(false)
  })
})
