import type { PersistenceSession } from './session.ts'
import type { WriterLock, WriterLockOptions } from './writerLock.ts'

export interface EditingSessionOptions {
  /** Makes the lock, wired to what this session does when asked for the role and when it loses it. */
  createLock: (hooks: Pick<WriterLockOptions, 'onYieldRequested' | 'onLost'>) => WriterLock
  /** Loads the saved Tree and, for the editing tab, starts saving it. */
  begin: (mode: 'writer' | 'reader') => Promise<PersistenceSession>
}

export interface EditingSession {
  /** Claims the role, then loads the Tree as the editing tab or as a read-only one. */
  start: () => Promise<void>
  /** From a read-only tab: becomes the editing tab, with the latest saved Tree. */
  takeOver: () => Promise<void>
  stop: () => void
}

/**
 * Keeps this tab's persistence in step with its role. A change of role starts the persistence again in the new mode,
 * which also loads the latest saved Tree: a tab that was only looking has an old copy, and a tab that stopped editing
 * should show what the other one goes on to change (there is no live sync, so this is its last update).
 */
export function createEditingSession({ createLock, begin }: EditingSessionOptions): EditingSession {
  let current: PersistenceSession | undefined
  let stopped = false
  let generation = 0

  const switchTo = async (mode: 'writer' | 'reader') => {
    if (stopped) return
    const mine = ++generation
    current?.()
    current = undefined
    const next = await begin(mode)
    // stopped, or switched again, while loading: this one is already out of date
    if (stopped || mine !== generation) next()
    else current = next
  }

  const lock = createLock({
    onYieldRequested: async () => {
      await current?.flush()
    },
    onLost: () => void switchTo('reader'),
  })

  return {
    async start() {
      await switchTo((await lock.claim()) ? 'writer' : 'reader')
    },
    async takeOver() {
      await lock.takeOver()
      await switchTo('writer')
    },
    stop() {
      stopped = true
      generation++
      current?.()
      current = undefined
      lock.close()
    },
  }
}
