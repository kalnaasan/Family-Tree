import type { StoreApi } from 'zustand'
import type { TreeState } from '../domain/store.ts'
import type { BackupLogStore } from './backupLog.ts'
import { type SnapshotKeeper, startSnapshotSchedule } from './snapshots.ts'

interface Dependencies {
  store: StoreApi<TreeState>
  log: Pick<BackupLogStore, 'getState'>
  keeper: Pick<SnapshotKeeper, 'take'>
  now?: () => Date
}

const latestStepId = (state: Pick<TreeState, 'past'>) => state.past.at(-1)?.id ?? 0

/**
 * What runs while the Tree is open, once it has been loaded: automatic Snapshots, and the count of edits that the
 * backup reminder uses. An edit is a new undo step; undoing, loading, importing and restoring are not edits. Returns
 * the cleanup function.
 */
export function startBackupSession({ store, log, keeper, now }: Dependencies): () => void {
  const stopSnapshots = startSnapshotSchedule({
    subscribe: (onChange) => store.subscribe(() => onChange()),
    getTree: () => store.getState(),
    keeper,
    now,
  })
  // step ids only grow, so a newer last step means an action was just done (or redone), never undone
  const stopCounting = store.subscribe((state, previous) => {
    if (latestStepId(state) > latestStepId(previous)) log.getState().edited()
  })
  return () => {
    stopSnapshots()
    stopCounting()
  }
}
