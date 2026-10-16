import { backupService } from '../backup/backup.ts'
import type { ExportOutcome } from '../backup/backupService.ts'
import { useUiStore } from './uiStore.ts'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

/** What to tell the user after an export, in one sentence or two. */
export function describeExport(outcome: ExportOutcome): string {
  if (!outcome.ok) return outcome.message
  const photos = outcome.photoCount > 0 ? ` with ${plural(outcome.photoCount, 'photo', 'photos')}` : ''
  const missing =
    outcome.missingPhotos > 0
      ? ` ${plural(outcome.missingPhotos, 'photo was', 'photos were')} not found and left out.`
      : ''
  return `Backup saved as ${outcome.fileName}${photos}.${missing}`
}

/** Exports with photos (the default), from a place with no room for a message of its own: tells the user by toast. */
export async function exportAndAnnounce(): Promise<void> {
  const outcome = await backupService.exportBackup({ includePhotos: true })
  useUiStore.getState().showToast(describeExport(outcome))
}
