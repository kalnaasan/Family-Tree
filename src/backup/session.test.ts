import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeStore } from '../domain/store.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { type LogStorage, createBackupLogStore } from './backupLog.ts'
import { startBackupSession } from './session.ts'
import { SNAPSHOT_INTERVAL_MS } from './snapshots.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function setup() {
  const store = createTreeStore(addPerson(emptyTree(), { id: id(1), firstName: 'Anna' }))
  const memory: LogStorage = { getItem: () => null, setItem: () => {} }
  const log = createBackupLogStore(memory)
  const take = vi.fn().mockResolvedValue(true)
  const stop = startBackupSession({ store, log, keeper: { take } })
  return { store, log, take, stop }
}

beforeEach(() => vi.useFakeTimers({ now: new Date('2026-08-01T08:00:00Z') }))
afterEach(() => vi.useRealTimers())

describe('backup session', () => {
  it('keeps a Snapshot of the loaded Tree at once, and not another until an hour has passed with edits', async () => {
    const { store, take } = setup()
    expect(take).toHaveBeenCalledTimes(1)
    expect(take.mock.calls[0][1]).toBe('load')

    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS / 2)
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS / 2 - 1)
    expect(take).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(take).toHaveBeenCalledTimes(2)
    expect(take.mock.lastCall![0].persons).toHaveLength(2)
  })

  it('counts each action as one edit', () => {
    const { store, log } = setup()
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    store.getState().updatePerson(id(2), { lastName: 'Meier' })
    store.getState().addParentLink(id(2), id(1))
    expect(log.getState().editsSinceBackup).toBe(3)
  })

  it('does not count undo, but counts a redo like the action it repeats', () => {
    const { store, log } = setup()
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    store.getState().undo()
    expect(log.getState().editsSinceBackup).toBe(1)
    store.getState().redo()
    expect(log.getState().editsSinceBackup).toBe(2)
  })

  it('does not count loading, importing or restoring a whole Tree', () => {
    const { store, log } = setup()
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    store.getState().loadTree(addPerson(emptyTree(), { id: id(9), firstName: 'Imported' }))
    expect(log.getState().editsSinceBackup).toBe(1)
  })

  it('keeps counting once the history is full and old steps fall off', () => {
    const { store, log } = setup()
    for (let n = 2; n <= 80; n++) store.getState().addPerson({ id: id(n), firstName: `P${n}` })
    expect(log.getState().editsSinceBackup).toBe(79)
  })

  it('stops with the session', async () => {
    const { store, log, take, stop } = setup()
    stop()
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    await vi.advanceTimersByTimeAsync(2 * SNAPSHOT_INTERVAL_MS)
    expect(log.getState().editsSinceBackup).toBe(0)
    expect(take).toHaveBeenCalledTimes(1)
  })
})
