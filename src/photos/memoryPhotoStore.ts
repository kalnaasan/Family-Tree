import type { PhotoStore } from './photoStore.ts'

export type MemoryPhotoStore = PhotoStore & { blobs: Map<string, Blob>; failWith?: Error; failDelete?: boolean }

/** A `PhotoStore` that lives in memory, for tests; `failWith` makes writes fail the way a full disk does. */
export function memoryPhotoStore(): MemoryPhotoStore {
  const blobs = new Map<string, Blob>()
  const store: MemoryPhotoStore = {
    blobs,
    async put(photoId, blob) {
      if (store.failWith) throw store.failWith
      blobs.set(photoId, blob)
    },
    get: async (photoId) => blobs.get(photoId),
    async delete(photoId) {
      if (store.failDelete) throw new Error('delete failed')
      blobs.delete(photoId)
    },
    keys: async () => [...blobs.keys()],
    usage: async () => ({ count: blobs.size, bytes: [...blobs.values()].reduce((sum, b) => sum + b.size, 0) }),
  }
  return store
}
