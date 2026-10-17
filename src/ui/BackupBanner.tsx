import { useState } from 'react'
import { useBackupLog } from '../backup/backup.ts'
import { REMINDER_EDITS, backupNotice } from '../backup/backupLog.ts'
import { useT } from '../i18n/useT.ts'
import { usePersistenceStatus } from '../persistence/saveStatus.ts'
import { exportAndAnnounce } from './exportBackup.ts'

/**
 * Asks for a backup when the browser would not promise to keep the data, or after 20 edits or 30 days without one
 * (spec section 10). Dismissing hides it for 30 days.
 */
export function BackupBanner() {
  const t = useT()
  const log = useBackupLog()
  const persistent = usePersistenceStatus((s) => s.persistent)
  // the day it is when the page opened is precise enough for thresholds of 20 edits and 30 days
  const [now] = useState(() => new Date())
  const notice = backupNotice(log, persistent, now)
  if (!notice) return null

  const text =
    notice === 'persist-denied'
      ? t('backupBanner.persistDenied')
      : log.editsSinceBackup >= REMINDER_EDITS
        ? t('backupBanner.edits', { count: log.editsSinceBackup })
        : log.lastBackupAt === null
          ? t('backupBanner.never')
          : t('backupBanner.old')

  return (
    <section
      aria-label={t('backupBanner.label')}
      className="mx-4 mt-2 flex flex-wrap items-center gap-3 rounded border border-amber-800 bg-amber-50 p-3 text-stone-900"
    >
      {/* the whole row on a phone, with the buttons below; beside them where there is room */}
      <p className="min-w-0 basis-full sm:flex-1 sm:basis-0">{text}</p>
      <button
        type="button"
        onClick={() => void exportAndAnnounce()}
        className="btn-primary  px-3 font-medium text-white"
      >
        {t('backupBanner.export')}
      </button>
      <button type="button" onClick={log.dismissed} className="btn px-3">
        {t('common.dismiss')}
      </button>
    </section>
  )
}
