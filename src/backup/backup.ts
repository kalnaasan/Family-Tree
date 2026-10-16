import { useTreeStore } from '../domain/store.ts'
import { downloadTextFile } from '../persistence/backup.ts'
import { photoCache, photoGc, photoStore } from '../photos/photos.ts'
import { createBackupLogStore } from './backupLog.ts'
import { createBackupService } from './backupService.ts'
import { startBackupSession } from './session.ts'
import { snapshotKeeper } from './snapshots.ts'

/** The app's one record of backups: a store the UI reads, kept in the browser between visits. */
export const useBackupLog = createBackupLogStore()

export const backupService = createBackupService({
  store: useTreeStore,
  photos: photoStore,
  gc: photoGc,
  forgetPhoto: photoCache.forget,
  snapshots: snapshotKeeper,
  log: useBackupLog,
  download: downloadTextFile,
})

/** Starts the automatic Snapshots and the edit count. Call once the saved Tree has been loaded. */
export const startAppBackupSession = (): (() => void) =>
  startBackupSession({ store: useTreeStore, log: useBackupLog, keeper: snapshotKeeper })
