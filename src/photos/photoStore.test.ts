// @vitest-environment node
// jsdom's Blob does not survive the fake IndexedDB's structured clone (its size comes back NaN); Node's does.
import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { openFamilyTreeDb } from '../persistence/db.ts'
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

/** A property of the connection, with its methods still tied to the connection. */
const bound = (target: object, property: string | symbol) => {
  const value = Reflect.get(target, property)
  return typeof value === 'function' ? value.bind(target) : value
}

describe('a browser that cannot keep a Blob in IndexedDB (WebKit in some modes)', () => {
  /** A connection that refuses a Blob the way WebKit does: "Error preparing Blob/File data to be stored". */
  const refusingBlobs = async () => {
    const real = await openFamilyTreeDb()
    return new Proxy(real, {
      get(target, property) {
        if (property !== 'put') return bound(target, property)
        return (store: 'photos', value: unknown, key: string) => {
          if (value instanceof Blob) {
            return Promise.reject(new DOMException('Error preparing Blob/File data to be stored in object store', 'UnknownError'))
          }
          return target.put(store, value as never, key)
        }
      },
    })
  }

  it('keeps the photo as bytes and gives back a Blob of the same type and size', async () => {
    const store = createPhotoStore(refusingBlobs)
    await store.put(A, new Blob(['hello'], { type: 'image/webp' }))
    const back = await createPhotoStore(refusingBlobs).get(A)
    expect(back).toBeInstanceOf(Blob)
    expect([back?.type, back?.size]).toEqual(['image/webp', 5])
    expect(await store.usage()).toEqual({ count: 1, bytes: 5 })
  })

  it('does not retry a failure that is not that refusal', async () => {
    let writes = 0
    const closed = async () =>
      new Proxy(await openFamilyTreeDb(), {
        get: (target, property) =>
          property === 'put'
            ? () => {
                writes++
                return Promise.reject(new DOMException('closing', 'InvalidStateError'))
              }
            : bound(target, property),
      })
    await expect(createPhotoStore(closed).put(A, new Blob(['1']))).rejects.toThrow('closing')
    expect(writes).toBe(1)
  })

  it('still reports a full disk as a full disk', async () => {
    const full = async () =>
      new Proxy(await openFamilyTreeDb(), {
        get: (target, property) =>
          property === 'put' ? () => Promise.reject(new DOMException('full', 'QuotaExceededError')) : bound(target, property),
      })
    await expect(createPhotoStore(full).put(A, new Blob(['1']))).rejects.toSatisfy(isQuotaError)
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
