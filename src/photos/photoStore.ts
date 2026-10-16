import { type FamilyTreeConnection, openFamilyTreeDb } from '../persistence/db.ts'

/** The photo Blobs, in their own IndexedDB store keyed by `photoId` (spec section 6). */
export interface PhotoStore {
  put: (photoId: string, blob: Blob) => Promise<void>
  get: (photoId: string) => Promise<Blob | undefined>
  delete: (photoId: string) => Promise<void>
  /** Every stored `photoId`. */
  keys: () => Promise<string[]>
  /** How many photos are stored and how many bytes they take (for Settings). */
  usage: () => Promise<{ count: number; bytes: number }>
}

export function createPhotoStore(open: () => Promise<FamilyTreeConnection> = openFamilyTreeDb): PhotoStore {
  let connection: Promise<FamilyTreeConnection> | undefined
  const db = () => (connection ??= open().catch((error) => {
    connection = undefined // allow a later retry after a failed open
    throw error
  }))

  return {
    async put(photoId, blob) {
      await (await db()).put('photos', blob, photoId)
    },
    get: async (photoId) => (await db()).get('photos', photoId),
    async delete(photoId) {
      await (await db()).delete('photos', photoId)
    },
    keys: async () => (await (await db()).getAllKeys('photos')).map(String),
    async usage() {
      const blobs = await (await db()).getAll('photos')
      return { count: blobs.length, bytes: blobs.reduce((sum, blob) => sum + blob.size, 0) }
    },
  }
}

/** Whether a failed write was the browser running out of storage. */
export const isQuotaError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'QuotaExceededError'
