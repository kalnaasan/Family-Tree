import { create } from 'zustand'

/** Spec section 10: remind after this many edits or this many days without a backup; a dismissal lasts as long. */
export const REMINDER_EDITS = 20
export const REMINDER_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000
const STORAGE_KEY = 'family-tree.backup'

/** What the app remembers about backups, between visits. */
export interface BackupLog {
  /** When the Tree was last exported; null if it never was. */
  lastBackupAt: string | null
  /** Edits made since then (or since ever, if there was no backup). */
  editsSinceBackup: number
  /** When the first of those edits happened: the 30 days count from here when there is no backup yet. */
  firstEditAt: string | null
  /** When the reminder was last dismissed. */
  dismissedAt: string | null
}

export const emptyLog = (): BackupLog => ({
  lastBackupAt: null,
  editsSinceBackup: 0,
  firstEditAt: null,
  dismissedAt: null,
})

export const recordEdit = (log: BackupLog, now: Date): BackupLog => ({
  ...log,
  editsSinceBackup: log.editsSinceBackup + 1,
  firstEditAt: log.firstEditAt ?? now.toISOString(),
})

/** A backup starts everything over, including a dismissal: the next reminder is for the next stretch of work. */
export const recordBackup = (now: Date): BackupLog => ({ ...emptyLog(), lastBackupAt: now.toISOString() })

export const recordDismissal = (log: BackupLog, now: Date): BackupLog => ({ ...log, dismissedAt: now.toISOString() })

const ageMs = (since: string | null, now: Date): number | null => {
  if (since === null) return null
  const time = Date.parse(since)
  return Number.isNaN(time) ? null : now.getTime() - time
}

export type BackupNotice = 'persist-denied' | 'reminder'

/**
 * Which banner, if any, to show. When the browser refused to keep the data safe the message says so, and stays until
 * there is a recent backup. Otherwise a reminder appears after 20 edits, or after 30 days with unsaved edits. Dismissing
 * either hides both for 30 days.
 */
export function backupNotice(log: BackupLog, persistent: boolean | null, now: Date): BackupNotice | null {
  const dismissed = ageMs(log.dismissedAt, now)
  if (dismissed !== null && dismissed < REMINDER_DAYS * DAY_MS) return null

  const sinceBackup = ageMs(log.lastBackupAt, now)
  if (persistent === false && (sinceBackup === null || sinceBackup >= REMINDER_DAYS * DAY_MS)) return 'persist-denied'

  if (log.editsSinceBackup >= REMINDER_EDITS) return 'reminder'
  const waiting = ageMs(log.lastBackupAt ?? log.firstEditAt, now)
  if (log.editsSinceBackup >= 1 && waiting !== null && waiting >= REMINDER_DAYS * DAY_MS) return 'reminder'
  return null
}

/** The few places the log is kept; `localStorage` in the app. Reads and writes may throw (private windows). */
export type LogStorage = Pick<Storage, 'getItem' | 'setItem'>

function read(storage: LogStorage | undefined): BackupLog {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return emptyLog()
    const value = JSON.parse(raw) as Partial<BackupLog>
    const text = (field: unknown) => (typeof field === 'string' ? field : null)
    return {
      lastBackupAt: text(value.lastBackupAt),
      editsSinceBackup:
        typeof value.editsSinceBackup === 'number' && value.editsSinceBackup >= 0 ? Math.floor(value.editsSinceBackup) : 0,
      firstEditAt: text(value.firstEditAt),
      dismissedAt: text(value.dismissedAt),
    }
  } catch {
    return emptyLog()
  }
}

export interface BackupLogActions {
  edited: () => void
  backedUp: () => void
  dismissed: () => void
}

export type BackupLogStore = ReturnType<typeof createBackupLogStore>

/** The log as a store the UI can read; every change is written through to `storage` (best effort). */
export function createBackupLogStore(
  storage: LogStorage | undefined = safeLocalStorage(),
  now: () => Date = () => new Date(),
) {
  return create<BackupLog & BackupLogActions>()((set, get) => {
    const update = (change: (log: BackupLog) => BackupLog) => {
      const { lastBackupAt, editsSinceBackup, firstEditAt, dismissedAt } = get()
      const next = change({ lastBackupAt, editsSinceBackup, firstEditAt, dismissedAt })
      set(next)
      try {
        storage?.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // the log is a convenience; losing it only means a reminder comes a little early or late
      }
    }
    return {
      ...read(storage),
      edited: () => update((log) => recordEdit(log, now())),
      backedUp: () => update(() => recordBackup(now())),
      dismissed: () => update((log) => recordDismissal(log, now())),
    }
  })
}

function safeLocalStorage(): LogStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
