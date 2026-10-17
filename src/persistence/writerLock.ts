/**
 * One tab edits, the others only look (spec section 10). The editing tab holds a Web Lock for as long as it is open.
 * Where the browser has no Web Locks, tabs ask each other over a BroadcastChannel instead; where it has neither, the
 * tab edits as before, since there is no way to know about other tabs.
 *
 * Taking over is polite first: the editing tab is asked to save what is pending and let go, so nothing it typed
 * in the last moments is lost. Only a tab that does not answer in time (frozen, or in the background of a phone) has
 * the role taken from it.
 */

export const WRITER_LOCK_NAME = 'family-tree-writer'
export const WRITER_CHANNEL_NAME = 'family-tree-writer'
/** How long a newly opened tab waits for the lock, so a page that is being reloaded does not find its old self in the way. */
export const CLAIM_WAIT_MS = 250
/** Without Web Locks: how long a newly opened tab waits for an editing tab to say it is there. */
export const ANNOUNCE_WAIT_MS = 200
/** How long a tab taking over waits for the editing tab to save and let go. */
export const YIELD_WAIT_MS = 1500

/** The part of `navigator.locks` that is used. */
export interface LockManagerLike {
  request(
    name: string,
    options: { ifAvailable?: boolean; steal?: boolean; signal?: AbortSignal },
    callback: (lock: object | null) => Promise<void> | void,
  ): Promise<unknown>
}

/** The part of `BroadcastChannel` that is used. */
export interface ChannelLike {
  postMessage(message: ChannelMessage): void
  onmessage: ((event: { data: unknown }) => void) | null
  close(): void
}

type ChannelMessage = { type: 'yield-request' } | { type: 'yielded' } | { type: 'who' } | { type: 'writer' }

export interface WriterLockOptions {
  /** Defaults to `navigator.locks`; pass `null` to run without Web Locks. */
  locks?: LockManagerLike | null
  /** Defaults to a `BroadcastChannel`; return null where there is none. */
  openChannel?: () => ChannelLike | null
  /** Another tab asked for the role: save what is pending. The role is given up when this resolves. */
  onYieldRequested: () => Promise<void>
  /** The role is gone: given to another tab, or taken from this one. */
  onLost: () => void
  claimWaitMs?: number
  announceWaitMs?: number
  yieldWaitMs?: number
}

export interface WriterLock {
  /** Becomes the editing tab unless another one is. Resolves to whether this tab is now the editing one. */
  claim(): Promise<boolean>
  /** Takes the role from the editing tab. Resolves once this tab has it. */
  takeOver(): Promise<void>
  /** Lets go of the role (if held) and stops listening. */
  close(): void
}

const defaultLocks = (): LockManagerLike | null =>
  typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks as unknown as LockManagerLike) : null

const defaultChannel = (): ChannelLike | null => {
  if (typeof BroadcastChannel === 'undefined') return null
  return new BroadcastChannel(WRITER_CHANNEL_NAME) as unknown as ChannelLike
}

export function createWriterLock(options: WriterLockOptions): WriterLock {
  const locks = options.locks === undefined ? defaultLocks() : options.locks
  const claimWaitMs = options.claimWaitMs ?? CLAIM_WAIT_MS
  const announceWaitMs = options.announceWaitMs ?? ANNOUNCE_WAIT_MS
  const yieldWaitMs = options.yieldWaitMs ?? YIELD_WAIT_MS
  const channel = (options.openChannel ?? defaultChannel)()

  let holding = false
  let closed = false
  /** Ends the Web Lock this tab holds. */
  let releaseHeld: (() => void) | undefined
  const waiters = new Set<(type: ChannelMessage['type']) => void>()

  const post = (message: ChannelMessage) => channel?.postMessage(message)

  /** Resolves true when a message of this type arrives, false after `ms`. */
  const hear = (type: ChannelMessage['type'], ms: number) =>
    new Promise<boolean>((resolve) => {
      const done = (heard: boolean) => {
        clearTimeout(timer)
        waiters.delete(listener)
        resolve(heard)
      }
      const listener = (got: ChannelMessage['type']) => got === type && done(true)
      const timer = setTimeout(() => done(false), ms)
      waiters.add(listener)
    })

  const giveUp = () => {
    holding = false
    releaseHeld?.()
    releaseHeld = undefined
    options.onLost()
  }

  /** Another tab asked: save, let go, then say so. */
  const yieldRole = async () => {
    await options.onYieldRequested().catch(() => {})
    if (!holding) return
    giveUp()
    post({ type: 'yielded' })
  }

  if (channel) {
    channel.onmessage = (event) => {
      const message = event.data as ChannelMessage | null
      if (!message || typeof message !== 'object') return
      for (const waiter of [...waiters]) waiter(message.type)
      if (message.type === 'yield-request' && holding) void yieldRole()
      if (message.type === 'who' && holding) post({ type: 'writer' })
    }
  }

  /** Asks the Web Locks for the role. `wait`: give up after that many ms; `now`: only if free; `steal`: take it. */
  const requestLock = (how: { wait: number } | 'now' | 'steal') =>
    new Promise<boolean>((resolve) => {
      if (!locks || closed) return resolve(false)
      const abort = typeof how === 'object' ? new AbortController() : undefined
      const timer = abort && setTimeout(() => abort.abort(), (how as { wait: number }).wait)
      // an option that is false or absent is not sent: `steal` together with `ifAvailable` (even false) is an error
      const lockOptions: Parameters<LockManagerLike['request']>[1] = {}
      if (how === 'now') lockOptions.ifAvailable = true
      if (how === 'steal') lockOptions.steal = true
      if (abort) lockOptions.signal = abort.signal
      locks
        .request(WRITER_LOCK_NAME, lockOptions, (lock) => {
          clearTimeout(timer)
          if (!lock || closed) {
            resolve(false)
            return
          }
          holding = true
          resolve(true)
          // the lock is held for as long as this promise is pending
          return new Promise<void>((release) => {
            releaseHeld = release
          })
        })
        .catch(() => {
          clearTimeout(timer)
          // refused or stolen. Before the lock was held that is "no"; afterwards the role was taken from this tab.
          if (holding) {
            holding = false
            releaseHeld = undefined
            options.onLost()
          } else resolve(false)
        })
    })

  return {
    async claim() {
      if (closed) return false
      if (locks) return requestLock({ wait: claimWaitMs })
      if (!channel) {
        holding = true // nothing to coordinate with: edit, as a single tab does
        return true
      }
      const heard = hear('writer', announceWaitMs)
      post({ type: 'who' })
      if (await heard) return false
      holding = true
      return true
    },

    async takeOver() {
      if (closed || holding) return
      if (locks && (await requestLock('now'))) return
      if (channel) {
        const heard = hear('yielded', yieldWaitMs)
        post({ type: 'yield-request' })
        await heard
      }
      if (locks) await requestLock('steal')
      else holding = true
    },

    close() {
      closed = true
      holding = false
      releaseHeld?.()
      releaseHeld = undefined
      if (channel) {
        channel.onmessage = null
        channel.close()
      }
    },
  }
}
