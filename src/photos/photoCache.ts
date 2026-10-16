import { makeThumbnail } from './encode.ts'
import type { PhotoStore } from './photoStore.ts'

/** `full` is the stored 512 px photo; `thumb` the ~192 px copy for when the tree is zoomed out. */
export type PhotoVariant = 'full' | 'thumb'

export interface PhotoCache {
  /** The object URL of a photo if it is ready; otherwise `undefined`, and it starts loading. Listeners hear when it is. */
  urlFor: (photoId: string, variant: PhotoVariant) => string | undefined
  /** Releases a photo's object URLs: its Blob was deleted. */
  forget: (photoId: string) => void
  subscribe: (listener: () => void) => () => void
  /** Changes whenever a URL becomes ready or is forgotten, so a view knows to ask again. */
  version: () => number
}

interface Dependencies {
  photos: Pick<PhotoStore, 'get'>
  thumbnail?: (photo: Blob) => Promise<Blob>
  createUrl?: (blob: Blob) => string
  revokeUrl?: (url: string) => void
}

/**
 * Shows stored photos through object URLs (spec section 6), made on demand for the Persons that are drawn, so a big
 * Tree does not decode thousands of photos it is not showing. A photo with no stored Blob simply never gets a URL,
 * and its Person keeps the default figure.
 */
export function createPhotoCache({
  photos,
  thumbnail = makeThumbnail,
  createUrl = (blob) => URL.createObjectURL(blob),
  revokeUrl = (url) => URL.revokeObjectURL(url),
}: Dependencies): PhotoCache {
  const urls = new Map<string, string>()
  const started = new Set<string>()
  /** Bumped when a photo is forgotten, so a load that was running at the time throws its result away. */
  const generations = new Map<string, number>()
  const listeners = new Set<() => void>()
  let version = 0
  const changed = () => {
    version++
    for (const listener of listeners) listener()
  }
  const keyOf = (photoId: string, variant: PhotoVariant) => `${photoId}|${variant}`

  async function load(photoId: string, variant: PhotoVariant) {
    const key = keyOf(photoId, variant)
    const generation = generations.get(photoId) ?? 0
    let url: string | undefined
    try {
      const blob = await photos.get(photoId)
      if (!blob) return
      if (variant === 'full') url = createUrl(blob)
      else url = createUrl(await thumbnail(blob).catch(() => blob)) // no thumbnail: the full photo will do
    } catch {
      return // unreadable: the default figure stays
    }
    if ((generations.get(photoId) ?? 0) !== generation) {
      revokeUrl(url)
      return
    }
    urls.set(key, url)
    changed()
  }

  return {
    urlFor(photoId, variant) {
      const key = keyOf(photoId, variant)
      const ready = urls.get(key)
      if (ready) return ready
      if (!started.has(key)) {
        started.add(key)
        void load(photoId, variant)
      }
      return undefined
    },
    forget(photoId) {
      generations.set(photoId, (generations.get(photoId) ?? 0) + 1)
      for (const variant of ['full', 'thumb'] as const) {
        const key = keyOf(photoId, variant)
        const url = urls.get(key)
        if (url) revokeUrl(url)
        urls.delete(key)
        started.delete(key)
      }
      changed()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
    version: () => version,
  }
}
