import { describe, expect, it, vi } from 'vitest'
import { createEditingSession } from './editingSession.ts'
import type { PersistenceSession } from './session.ts'
import type { WriterLock, WriterLockOptions } from './writerLock.ts'

/** A lock the test drives by hand, and a persistence that only records what was started and stopped. */
function setup(claims: boolean) {
  const log: string[] = []
  let hooks!: Pick<WriterLockOptions, 'onYieldRequested' | 'onLost'>
  const lock: WriterLock = {
    claim: async () => claims,
    takeOver: vi.fn(async () => {}),
    close: vi.fn(),
  }
  let started = 0
  const begin = vi.fn(async (mode: 'writer' | 'reader') => {
    const n = ++started
    log.push(`start ${mode} #${n}`)
    return Object.assign(() => void log.push(`stop #${n}`), {
      flush: async () => void log.push(`flush #${n}`),
    }) as PersistenceSession
  })
  const session = createEditingSession({
    createLock: (given) => {
      hooks = given
      return lock
    },
    begin,
  })
  return { session, hooks: () => hooks, lock, log, begin }
}

describe('editing session', () => {
  it('starts as the editing tab when the role is free', async () => {
    const { session, log } = setup(true)
    await session.start()
    expect(log).toEqual(['start writer #1'])
  })

  it('starts read-only when another tab edits', async () => {
    const { session, log } = setup(false)
    await session.start()
    expect(log).toEqual(['start reader #1'])
  })

  it('taking over loads the latest saved Tree again as the editing tab', async () => {
    const { session, lock, log } = setup(false)
    await session.start()
    await session.takeOver()
    expect(lock.takeOver).toHaveBeenCalledTimes(1)
    expect(log).toEqual(['start reader #1', 'stop #1', 'start writer #2'])
  })

  it('when asked for the role it saves what is pending; losing it then makes the tab read-only', async () => {
    const { session, hooks, log } = setup(true)
    await session.start()
    await hooks().onYieldRequested()
    hooks().onLost()
    await vi.waitFor(() => expect(log).toContain('start reader #2'))
    expect(log).toEqual(['start writer #1', 'flush #1', 'stop #1', 'start reader #2'])
  })

  it('a stop while the Tree is still loading ends that session as soon as it is ready', async () => {
    const { session, log, lock } = setup(true)
    const starting = session.start()
    session.stop()
    await starting
    // whatever was started was stopped again
    expect(log.filter((l) => l.startsWith('start')).length).toBe(log.filter((l) => l.startsWith('stop')).length)
    expect(lock.close).toHaveBeenCalled()
  })

  it('ignores a role change after it was stopped', async () => {
    const { session, hooks, log } = setup(true)
    await session.start()
    session.stop()
    hooks().onLost()
    await Promise.resolve()
    expect(log).toEqual(['start writer #1', 'stop #1'])
  })
})
