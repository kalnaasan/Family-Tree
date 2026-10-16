import type { SnapshotRecord, SnapshotStorage } from './snapshots.ts'

export type MemorySnapshots = SnapshotStorage & { records: Map<string, SnapshotRecord>; failPut?: boolean }

/** A `SnapshotStorage` that lives in memory, for tests; `failPut` makes writes fail the way a full disk does. */
export function memorySnapshots(): MemorySnapshots {
  const records = new Map<string, SnapshotRecord>()
  const storage: MemorySnapshots = {
    records,
    async put(key, record) {
      if (storage.failPut) throw new DOMException('full', 'QuotaExceededError')
      records.set(key, record)
    },
    all: async () => [...records].map(([key, record]) => ({ id: key, record })),
    async delete(key) {
      records.delete(key)
    },
  }
  return storage
}
