import type { Tree } from '../domain/schema.ts'
import type { PhotoGc } from '../photos/photoGc.ts'
import { type PhotoStore, isQuotaError } from '../photos/photoStore.ts'
import { buildExport, exportFileName } from './exportFile.ts'
import { type ImportDependencies, type ImportFailureRule, parseImport } from './importFile.ts'
import type { SnapshotKeeper } from './snapshots.ts'

/** A file that has passed every check and is waiting for the user to confirm the replacement. */
export interface PreparedImport {
  tree: Tree
  photos: Map<string, Blob>
}

export type ExportOutcome =
  | { ok: true; fileName: string; photoCount: number; missingPhotos: number }
  | { ok: false; message: string }

export type PrepareOutcome =
  | { ok: true; prepared: PreparedImport }
  | { ok: false; rule: ImportFailureRule | 'unreadable'; message: string }

export type ReplaceOutcome = { ok: true } | { ok: false; message: string }

interface Dependencies {
  store: { getState: () => Tree & { loadTree: (tree: Tree) => void } }
  photos: PhotoStore
  gc: Pick<PhotoGc, 'protect' | 'noteStored'>
  /** Lets go of the in-memory copy of a photo whose stored bytes have just been replaced. */
  forgetPhoto: (photoId: string) => void
  snapshots: Pick<SnapshotKeeper, 'take' | 'get'>
  /** Remembers that a backup was just made. */
  log: { getState: () => { backedUp: () => void } }
  /** Hands the user a file. */
  download: (text: string, fileName: string) => void
  now?: () => Date
  decode?: ImportDependencies['decode']
}

export interface BackupService {
  /** Downloads the whole Tree (with its photos, unless told not to) and notes the backup. */
  exportBackup: (options: { includePhotos: boolean }) => Promise<ExportOutcome>
  /** Reads and checks a file. Changes nothing. */
  prepareImport: (file: Blob) => Promise<PrepareOutcome>
  /**
   * Replaces the Tree with the file's. A Snapshot of the current Tree comes first, and if it cannot be kept nothing is
   * replaced. The photos are stored before the Tree refers to them. Not undoable (spec section 10): the Snapshot is the way back.
   */
  applyImport: (prepared: PreparedImport) => Promise<ReplaceOutcome>
  /** Replaces the Tree with a saved version, after keeping the current Tree as a version too. */
  restoreSnapshot: (snapshotId: string) => Promise<ReplaceOutcome>
}

const SAFETY_COPY_FAILED =
  'A safety copy of your current tree could not be saved, so nothing was replaced. Export your current tree first, then try again.'

export function createBackupService({
  store,
  photos,
  gc,
  forgetPhoto,
  snapshots,
  log,
  download,
  now = () => new Date(),
  decode,
}: Dependencies): BackupService {
  /** Everything a Snapshot or an export needs, without the store's action functions. */
  const currentTree = (): Tree => {
    const { focusPersonId, persons, parentLinks, partnerships } = store.getState()
    return { focusPersonId, persons, parentLinks, partnerships }
  }

  /** Keeps the current Tree before it is replaced. False if that failed. */
  const keepCurrent = async (reason: 'import' | 'restore') => {
    try {
      await snapshots.take(currentTree(), reason)
      return true
    } catch {
      return false
    }
  }

  return {
    async exportBackup({ includePhotos }) {
      try {
        const date = now()
        const built = await buildExport(currentTree(), photos, { includePhotos, now: date })
        const fileName = exportFileName(date)
        download(built.text, fileName)
        log.getState().backedUp()
        return { ok: true, fileName, photoCount: built.photoCount, missingPhotos: built.missingPhotos }
      } catch {
        return { ok: false, message: 'The backup could not be created. Nothing was downloaded.' }
      }
    },

    async prepareImport(file) {
      let text: string
      try {
        text = await file.text()
      } catch {
        return { ok: false, rule: 'unreadable', message: 'That file could not be read.' }
      }
      const result = await parseImport(text, { decode })
      return result.ok
        ? { ok: true, prepared: { tree: result.tree, photos: result.photos } }
        : { ok: false, rule: result.rule, message: result.message }
    },

    async applyImport({ tree, photos: incoming }) {
      if (!(await keepCurrent('import'))) return { ok: false, message: SAFETY_COPY_FAILED }

      const releases: (() => void)[] = []
      try {
        for (const [photoId, blob] of incoming) {
          releases.push(gc.protect(photoId))
          await photos.put(photoId, blob)
          gc.noteStored(photoId)
          forgetPhoto(photoId) // an older photo may have had this id: show the new bytes
        }
        store.getState().loadTree(tree)
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: isQuotaError(error)
            ? 'There is not enough storage space left for the photos in this file, so nothing was replaced.'
            : 'The photos in this file could not be saved, so nothing was replaced.',
        }
      } finally {
        for (const release of releases) release() // the Tree now refers to them, or the attempt is over
      }
    },

    async restoreSnapshot(snapshotId) {
      let tree: Tree | undefined
      try {
        tree = await snapshots.get(snapshotId)
      } catch {
        tree = undefined
      }
      if (!tree) return { ok: false, message: 'That version could not be read any more.' }
      if (!(await keepCurrent('restore'))) return { ok: false, message: SAFETY_COPY_FAILED }
      store.getState().loadTree(tree)
      return { ok: true }
    },
  }
}
