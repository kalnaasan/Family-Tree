import { type DBSchema, type IDBPDatabase, openDB } from 'idb'
import type { SnapshotRecord } from '../backup/snapshots.ts'
import type { TreeDocument } from '../domain/schema.ts'

export const DB_NAME = 'family-tree'
export const TREE_KEY = 'current'

interface FamilyTreeDB extends DBSchema {
  /** One key, `current`: the whole Tree document. */
  tree: { key: string; value: TreeDocument }
  /** Photo Blobs keyed by `photoId` (filled by the Photos ticket). */
  photos: { key: string; value: Blob }
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
