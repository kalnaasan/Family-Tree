import { describe, expect, it, vi } from 'vitest'
import { createPhotoCache } from './photoCache.ts'

const A = '00000000-0000-4000-8000-0000000000a1'

/** A cache over a photo store with `blobs`, handing out `url:1`, `url:2`... and recording what is released. */
function setup(blobs: Record<string, Blob> = { [A]: new Blob(['full']) }) {
  let count = 0
  const created: Blob[] = []
  const revoked: string[] = []
  const get = vi.fn(async (id: string) => blobs[id])
  const thumbnail = vi.fn(async () => new Blob(['small']))
  const cache = createPhotoCache({
    photos: { get },
    thumbnail,
    createUrl: (blob) => {
      created.push(blob)
      return `url:${++count}`
    },
    revokeUrl: (url) => void revoked.push(url),
  })
  const ready = () => new Promise<void>((resolve) => void cache.subscribe(resolve))
  return { cache, get, thumbnail, created, revoked, ready }
}

describe('photo cache', () => {
  it('has no URL at first, starts loading, and announces the URL when it is ready', async () => {
    const { cache, ready } = setup()
    const before = cache.version()
    const loaded = ready()
    expect(cache.urlFor(A, 'full')).toBeUndefined()
    await loaded
    expect(cache.urlFor(A, 'full')).toBe('url:1')
    expect(cache.version()).toBeGreaterThan(before)
  })

  it('loads a photo once however often it is asked for', async () => {
    const { cache, get, ready } = setup()
    const loaded = ready()
    cache.urlFor(A, 'full')
    cache.urlFor(A, 'full')
    cache.urlFor(A, 'full')
    await loaded
    cache.urlFor(A, 'full')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('makes the small copy for the thumb variant, and keeps the two variants apart', async () => {
    const { cache, thumbnail, created, ready } = setup()
    let loaded = ready()
    cache.urlFor(A, 'thumb')
    await loaded
    loaded = ready()
    cache.urlFor(A, 'full')
    await loaded
    expect(thumbnail).toHaveBeenCalledTimes(1)
    expect(created.map((blob) => blob.size)).toEqual([5, 4]) // small, then full
    expect(cache.urlFor(A, 'thumb')).toBe('url:1')
    expect(cache.urlFor(A, 'full')).toBe('url:2')
  })

  it('falls back to the full photo when a thumbnail cannot be made', async () => {
    const full = new Blob(['full'])
    const created: Blob[] = []
    const cache = createPhotoCache({
      photos: { get: async () => full },
      thumbnail: async () => {
        throw new Error('no canvas')
      },
      createUrl: (blob) => (created.push(blob), 'url'),
      revokeUrl: () => {},
    })
    const loaded = new Promise<void>((resolve) => void cache.subscribe(resolve))
    cache.urlFor(A, 'thumb')
    await loaded
    expect(created).toEqual([full])
  })

  it('a photo with no stored Blob never gets a URL, so its Person keeps the default figure', async () => {
    const { cache, get } = setup({})
    expect(cache.urlFor(A, 'full')).toBeUndefined()
    await vi.waitFor(() => expect(get).toHaveBeenCalled())
    await Promise.resolve()
    expect(cache.urlFor(A, 'full')).toBeUndefined()
    expect(get).toHaveBeenCalledTimes(1) // and it is not asked for again on every draw
  })

  it('forgetting a photo releases both of its URLs', async () => {
    const { cache, revoked, ready } = setup()
    let loaded = ready()
    cache.urlFor(A, 'full')
    await loaded
    loaded = ready()
    cache.urlFor(A, 'thumb')
    await loaded
    cache.forget(A)
    expect(revoked.sort()).toEqual(['url:1', 'url:2'])
    expect(cache.urlFor(A, 'full')).toBeUndefined() // gone; asking again would reload it
  })

  it('a load that finishes after the photo was forgotten is thrown away, not leaked', async () => {
    let release: (blob: Blob) => void = () => {}
    const revoked: string[] = []
    const cache = createPhotoCache({
      photos: { get: () => new Promise<Blob>((resolve) => (release = resolve)) },
      createUrl: () => 'late-url',
      revokeUrl: (url) => void revoked.push(url),
    })
    cache.urlFor(A, 'full')
    cache.forget(A)
    release(new Blob(['x']))
    await vi.waitFor(() => expect(revoked).toEqual(['late-url']))
    expect(cache.urlFor(A, 'full')).toBeUndefined()
  })

  it('a listener stops hearing after it unsubscribes', async () => {
    const { cache } = setup()
    const heard = vi.fn()
    const stop = cache.subscribe(heard)
    stop()
    cache.forget(A)
    expect(heard).not.toHaveBeenCalled()
  })
})
