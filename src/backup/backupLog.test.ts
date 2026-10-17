import { describe, expect, it } from 'vitest'
import {
  type LogStorage,
  REMINDER_DAYS,
  REMINDER_EDITS,
  backupNotice,
  createBackupLogStore,
  emptyLog,
  recordBackup,
  recordDismissal,
  recordEdit,
} from './backupLog.ts'

const DAY = 24 * 60 * 60 * 1000
const start = new Date('2026-03-01T10:00:00Z')
const later = (days: number) => new Date(start.getTime() + days * DAY)

function editedTimes(count: number, at = start) {
  let log = emptyLog()
  for (let i = 0; i < count; i++) log = recordEdit(log, at)
  return log
}

describe('backup reminders', () => {
  it('say nothing for a fresh tree', () => {
    expect(backupNotice(emptyLog(), null, start)).toBeNull()
    expect(backupNotice(emptyLog(), true, later(90))).toBeNull()
  })

  it(`appear after ${REMINDER_EDITS} edits, not before`, () => {
    expect(backupNotice(editedTimes(REMINDER_EDITS - 1), true, start)).toBeNull()
    expect(backupNotice(editedTimes(REMINDER_EDITS), true, start)).toBe('reminder')
  })

  it(`appear after ${REMINDER_DAYS} days with unsaved edits, counted from the first edit when there was no backup`, () => {
    const log = editedTimes(2)
    expect(backupNotice(log, true, later(REMINDER_DAYS - 1))).toBeNull()
    expect(backupNotice(log, true, later(REMINDER_DAYS))).toBe('reminder')
  })

  it('count the days from the last backup once there is one', () => {
    const log = recordEdit(recordBackup(start), later(25))
    expect(backupNotice(log, true, later(REMINDER_DAYS - 1))).toBeNull()
    expect(backupNotice(log, true, later(REMINDER_DAYS))).toBe('reminder')
  })

  it('do not nag about time when nothing changed since the backup', () => {
    expect(backupNotice(recordBackup(start), true, later(400))).toBeNull()
  })

  it('a backup clears the count and any dismissal', () => {
    const log = recordDismissal(editedTimes(30), start)
    const backedUp = recordBackup(later(1))
    expect(backupNotice(log, true, later(1))).toBeNull() // dismissed
    expect(backedUp).toEqual({ lastBackupAt: later(1).toISOString(), editsSinceBackup: 0, firstEditAt: null, dismissedAt: null })
  })

  it(`a dismissal hides the reminder for ${REMINDER_DAYS} days, then it returns if still due`, () => {
    const log = recordDismissal(editedTimes(25), start)
    expect(backupNotice(log, true, later(REMINDER_DAYS - 1))).toBeNull()
    expect(backupNotice(log, true, later(REMINDER_DAYS))).toBe('reminder')
  })

  it('tell the user when the browser would not keep the data safe, until there is a recent backup', () => {
    const log = editedTimes(1)
    expect(backupNotice(log, false, start)).toBe('persist-denied')
    expect(backupNotice(log, null, start)).toBeNull() // not asked yet
    expect(backupNotice(log, true, start)).toBeNull()
    const backedUp = recordBackup(start)
    expect(backupNotice(backedUp, false, later(REMINDER_DAYS - 1))).toBeNull()
    expect(backupNotice(backedUp, false, later(REMINDER_DAYS))).toBe('persist-denied')
  })

  it('that banner can be dismissed too', () => {
    expect(backupNotice(recordDismissal(editedTimes(1), start), false, later(1))).toBeNull()
  })

  it('ignore a date it cannot read', () => {
    expect(backupNotice({ ...editedTimes(1), firstEditAt: 'garbage' }, true, later(100))).toBeNull()
  })
})

function memoryStorage(initial?: string): LogStorage {
  let value = initial ?? null
  return {
    getItem: () => value,
    setItem: (_key, next) => void (value = next),
  }
}

describe('backup log store', () => {
  it('counts edits, remembers them across visits, and resets on a backup', () => {
    let clock = start
    const storage = memoryStorage()
    const log = createBackupLogStore(storage, () => clock)
    log.getState().edited()
    clock = later(1)
    log.getState().edited()
    expect(log.getState()).toMatchObject({ editsSinceBackup: 2, firstEditAt: start.toISOString(), lastBackupAt: null })

    const nextVisit = createBackupLogStore(storage, () => clock)
    expect(nextVisit.getState().editsSinceBackup).toBe(2)

    nextVisit.getState().backedUp()
    expect(nextVisit.getState()).toMatchObject({ editsSinceBackup: 0, lastBackupAt: later(1).toISOString() })
    expect(createBackupLogStore(storage).getState().lastBackupAt).toBe(later(1).toISOString())
  })

  it('records a dismissal', () => {
    const log = createBackupLogStore(memoryStorage(), () => start)
    log.getState().dismissed()
    expect(log.getState().dismissedAt).toBe(start.toISOString())
  })

  it('starts empty from damaged or missing storage, and works without any', () => {
    expect(createBackupLogStore(memoryStorage('not json')).getState().editsSinceBackup).toBe(0)
    expect(createBackupLogStore(memoryStorage('{"editsSinceBackup":-4,"lastBackupAt":7}')).getState()).toMatchObject({
      editsSinceBackup: 0,
      lastBackupAt: null,
    })
    const log = createBackupLogStore(undefined, () => start)
    log.getState().edited()
    expect(log.getState().editsSinceBackup).toBe(1)
  })

  it('keeps counting when storage refuses writes', () => {
    const refusing: LogStorage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError')
      },
    }
    const log = createBackupLogStore(refusing, () => start)
    log.getState().edited()
    expect(log.getState().editsSinceBackup).toBe(1)
  })
})
