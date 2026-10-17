import { backupService } from '../backup/backup.ts'
import type { ExportOutcome } from '../backup/backupService.ts'
import { type MessageRef, msg } from '../i18n/messageRef.ts'
import { useUiStore } from './uiStore.ts'

/** What to tell the user after an export, in one sentence or two. */
export function describeExport(outcome: ExportOutcome): MessageRef {
  if (!outcome.ok) return outcome.message
  const saved =
    outcome.photoCount > 0
      ? msg('backup.savedWithPhotos', { fileName: outcome.fileName, count: outcome.photoCount })
      : msg('backup.saved', { fileName: outcome.fileName })
  return outcome.missingPhotos > 0
    ? msg('backup.savedAndMissing', { saved, missing: msg('backup.photosMissing', { count: outcome.missingPhotos }) })
    : saved
}

/** Exports with photos (the default), from a place with no room for a message of its own: tells the user by toast. */
export async function exportAndAnnounce(): Promise<void> {
  const outcome = await backupService.exportBackup({ includePhotos: true })
  useUiStore.getState().showToast(describeExport(outcome))
}
