import { parseDocument, serializeDocument } from '../domain/document.ts'
import type { Tree, TreeDocument } from '../domain/schema.ts'
import { type FamilyTreeConnection, openFamilyTreeDb } from '../persistence/db.ts'

/** Spec section 10: up to five automatic copies, taken on load, at most hourly while editing, and before an import. */
export const MAX_SNAPSHOTS = 5
export const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000

export type SnapshotReason = 'load' | 'hourly' | 'import' | 'restore'

/** What is kept in IndexedDB for one Snapshot. */
export interface SnapshotRecord {
  takenAt: string
  reason: SnapshotReason
  personCount: number
  document: TreeDocument
}

/** What "Restore a previous version" lists: the date and the number of people. */
export interface SnapshotInfo {
  id: string
  takenAt: string
  reason: SnapshotReason
  personCount: number
}

export interface SnapshotStorage {
  put: (id: string, record: SnapshotRecord) => Promise<void>
  all: () => Promise<{ id: string; record: SnapshotRecord }[]>
  delete: (id: string) => Promise<void>
}

export function createSnapshotStorage(open: () => Promise<FamilyTreeConnection> = openFamilyTreeDb): SnapshotStorage {
  let connection: Promise<FamilyTreeConnection> | undefined
  const db = () => (connection ??= open().catch((error) => {
    connection = undefined // allow a later retry after a failed open
    throw error
  }))

  return {
    async put(id, record) {
      await (await db()).put('snapshots', record, id)
    },
    async all() {
      const tx = (await db()).transaction('snapshots')
      const [ids, records] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()])
      return ids.map((id, index) => ({ id: String(id), record: records[index] }))
    },
    async delete(id) {
      await (await db()).delete('snapshots', id)
    },
  }
}

/** The four fields that make a Tree what it is; `exportedAt` differs on every copy and says nothing about content. */
const contentOf = (document: Pick<TreeDocument, 'focusPersonId' | 'persons' | 'parentLinks' | 'partnerships'>) =>
  JSON.stringify([document.focusPersonId, document.persons, document.parentLinks, document.partnerships])

const byDate = (a: { takenAt: string }, b: { takenAt: string }) => (a.takenAt < b.takenAt ? -1 : a.takenAt > b.takenAt ? 1 : 0)

export interface SnapshotKeeper {
  /**
   * Keeps a copy of the Tree, then drops the oldest beyond five. An empty Tree is not worth keeping, and neither is a
   * copy identical to the newest one (reloading five times must not push every real version out). Returns whether a
   * new copy was kept. Throws if storage fails, so a caller about to replace the Tree can refuse to go on.
   */
  take: (tree: Tree, reason: SnapshotReason) => Promise<boolean>
  /** Newest first. */
  list: () => Promise<SnapshotInfo[]>
  /** The Tree in a Snapshot, or undefined if it is gone or cannot be read any more. */
  get: (id: string) => Promise<Tree | undefined>
  /** Photos the kept copies refer to: they stay in storage, so restoring a version gets its photos back. */
  referencedPhotoIds: () => Promise<Set<string>>
}

export function createSnapshotKeeper(
  storage: SnapshotStorage,
  now: () => Date = () => new Date(),
  newId: () => string = () => crypto.randomUUID(),
): SnapshotKeeper {
  let photoIds: Set<string> | undefined

  return {
    async take(tree, reason) {
      if (tree.persons.length === 0) return false
      const takenAt = now().toISOString()
      const document = serializeDocument(tree, new Date(takenAt))
      const kept = (await storage.all()).sort((a, b) => byDate(a.record, b.record))
      const newest = kept.at(-1)
      if (newest && contentOf(newest.record.document) === contentOf(document)) return false

      photoIds = undefined
      await storage.put(newId(), { takenAt, reason, personCount: tree.persons.length, document })
      // `kept` does not include the copy just stored, so one slot must stay free for it
      for (const { id } of kept.slice(0, Math.max(0, kept.length - (MAX_SNAPSHOTS - 1)))) await storage.delete(id)
      return true
    },
    async list() {
      return (await storage.all())
        .map(({ id, record }) => ({ id, takenAt: record.takenAt, reason: record.reason, personCount: record.personCount }))
        .sort((a, b) => byDate(b, a))
    },
    async get(id) {
      const found = (await storage.all()).find((k) => k.id === id)
      if (!found) return undefined
      const parsed = parseDocument(found.record.document)
      return parsed.ok ? parsed.tree : undefined
    },
    async referencedPhotoIds() {
      if (photoIds) return photoIds
      const ids = new Set<string>()
      for (const { record } of await storage.all()) {
        for (const person of record.document.persons) if (person.photoId) ids.add(person.photoId)
      }
      return (photoIds = ids)
    },
  }
}

/** The app's one Snapshot keeper (photo cleanup needs it, so it lives here, away from the import code). */
export const snapshotKeeper = createSnapshotKeeper(createSnapshotStorage())

interface ScheduleOptions {
  /** Calls the listener whenever the Tree may have changed; returns an unsubscribe function. */
  subscribe: (onChange: () => void) => () => void
  getTree: () => Tree
  keeper: Pick<SnapshotKeeper, 'take'>
  now?: () => Date
  intervalMs?: number
}

/**
 * When Snapshots are taken without being asked: once now (the Tree has just been loaded), and then at most once per
 * `intervalMs` while the Tree keeps changing. A quiet hour takes nothing. A failing write never disturbs editing.
 */
export function startSnapshotSchedule({
  subscribe,
  getTree,
  keeper,
  now = () => new Date(),
  intervalMs = SNAPSHOT_INTERVAL_MS,
}: ScheduleOptions): () => void {
  let lastAt = now().getTime()
  let changed = false
  let timer: ReturnType<typeof setTimeout> | undefined

  void keeper.take(getTree(), 'load').catch(() => {})

  const fire = () => {
    timer = undefined
    if (!changed) return
    changed = false
    lastAt = now().getTime()
    void keeper.take(getTree(), 'hourly').catch(() => {})
  }
  const unsubscribe = subscribe(() => {
    changed = true
    timer ??= setTimeout(fire, Math.max(0, lastAt + intervalMs - now().getTime()))
  })

  return () => {
    unsubscribe()
    clearTimeout(timer)
    timer = undefined
  }
}
