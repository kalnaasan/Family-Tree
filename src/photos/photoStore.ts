import { type FamilyTreeConnection, type StoredBytes, openFamilyTreeDb } from '../persistence/db.ts'

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

const toBlob = (stored: Blob | StoredBytes): Blob =>
  stored instanceof Blob ? stored : new Blob([stored.bytes], { type: stored.type })

/**
 * Some browsers cannot keep a Blob in IndexedDB (WebKit throws "Error preparing Blob/File data to be stored" in some
 * modes). The photo is then kept as its bytes and type, and handed back as a Blob either way.
 */
export function createPhotoStore(open: () => Promise<FamilyTreeConnection> = openFamilyTreeDb): PhotoStore {
  let connection: Promise<FamilyTreeConnection> | undefined
  const db = () => (connection ??= open().catch((error) => {
    connection = undefined // allow a later retry after a failed open
    throw error
  }))

  return {
    async put(photoId, blob) {
      const connection = await db()
      try {
        await connection.put('photos', blob, photoId)
      } catch (error) {
        // only the browser's refusal of a Blob: a full disk or a closed connection is reported as it is
        if (!isBlobRefusal(error)) throw error
        await connection.put('photos', { type: blob.type, bytes: await blob.arrayBuffer() }, photoId)
      }
    },
    get: async (photoId) => {
      const stored = await (await db()).get('photos', photoId)
      return stored && toBlob(stored)
    },
    async delete(photoId) {
      await (await db()).delete('photos', photoId)
    },
    keys: async () => (await (await db()).getAllKeys('photos')).map(String),
    async usage() {
      const stored = await (await db()).getAll('photos')
      const sizeOf = (photo: Blob | StoredBytes) => (photo instanceof Blob ? photo.size : photo.bytes.byteLength)
      return { count: stored.length, bytes: stored.reduce((sum, photo) => sum + sizeOf(photo), 0) }
    },
  }
}

/** WebKit's refusal to keep a Blob: an `UnknownError` ("Error preparing Blob/File data to be stored in object store"). */
const isBlobRefusal = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'UnknownError'

/** Whether a failed write was the browser running out of storage. */
export const isQuotaError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { name?: string }).name === 'QuotaExceededError'
