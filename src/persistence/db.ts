import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { SnapshotRecord } from '../backup/snapshots.ts'
import type { TreeDocument } from '../domain/schema.ts'

/** A photo kept as plain bytes, for a browser that refuses to put a Blob into IndexedDB. */
export interface StoredBytes {
  type: string
  bytes: ArrayBuffer
}

export const DB_NAME = 'family-tree'
export const TREE_KEY = 'current'

interface FamilyTreeDB extends DBSchema {
  /** One key, `current`: the whole Tree document. */
  tree: { key: string; value: TreeDocument }
  /** Photos keyed by `photoId`: a Blob, or its bytes and type where the browser cannot keep a Blob (see photoStore). */
  photos: { key: string; value: Blob | StoredBytes }
  /** Automatic safety copies, at most five (spec section 10), keyed by a random id. */
  snapshots: { key: string; value: SnapshotRecord }
}

export type FamilyTreeConnection = IDBPDatabase<FamilyTreeDB>

export function openFamilyTreeDb(): Promise<FamilyTreeConnection> {
  return openDB<FamilyTreeDB>(DB_NAME, 1, {
    upgrade(db) {
      db.createObjectStore('tree')
      db.createObjectStore('photos')
      db.createObjectStore('snapshots')
    },
  })
}
