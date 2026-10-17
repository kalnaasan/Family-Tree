import { describe, expect, it, vi } from 'vitest'
import { type ChannelLike, type LockManagerLike, type WriterLock, createWriterLock } from './writerLock.ts'

/** A Web Locks stand-in shared by the "tabs": one exclusive lock with the request options the app uses. */
function fakeLocks(): LockManagerLike {
  type Holder = { steal: () => void }
  let holder: Holder | null = null
  const waiting: Array<() => void> = []

  return {
    request(_name, options, callback) {
      return new Promise((resolve, reject) => {
        const grant = () => {
          let stolen!: () => void
          const stolenSignal = new Promise<never>((_, fail) => {
            stolen = () => fail(new DOMException('stolen', 'AbortError'))
          })
          const me: Holder = { steal: stolen }
          holder = me
          const free = () => {
            if (holder === me) holder = null
            waiting.shift()?.()
          }
          // the request settles when the callback's promise does, or fails if the lock is stolen
          Promise.race([Promise.resolve(callback({})), stolenSignal]).then(
            () => {
              free()
              resolve(undefined)
            },
            (error) => {
              free()
              reject(error)
            },
          )
        }
        if (options.steal) {
          holder?.steal()
          holder = null
          grant()
        } else if (!holder) grant()
        else if (options.ifAvailable) {
          Promise.resolve(callback(null)).then(() => resolve(undefined))
        } else {
          const enter = () => grant()
          waiting.push(enter)
          options.signal?.addEventListener('abort', () => {
            const at = waiting.indexOf(enter)
            if (at >= 0) waiting.splice(at, 1)
            reject(new DOMException('aborted', 'AbortError'))
          })
        }
      })
    },
  }
}

/** BroadcastChannel stand-in: a message reaches every other open channel, a moment later. */
function fakeChannels() {
  const open: ChannelLike[] = []
  return () => {
    const channel: ChannelLike = {
      onmessage: null,
      postMessage(message) {
        for (const other of open) {
          if (other !== channel) setTimeout(() => other.onmessage?.({ data: message }), 0)
        }
      },
      close() {
        open.splice(open.indexOf(channel), 1)
      },
    }
    open.push(channel)
    return channel
  }
}

const quick = { claimWaitMs: 20, announceWaitMs: 20, yieldWaitMs: 60 }

interface World {
  locks: LockManagerLike | null
  channels: (() => ChannelLike) | null
}

/** One "tab": what it does when asked to save before letting go, and what it was told. */
function tab(world: World, name: string, onYieldRequested: () => Promise<void> = async () => {}) {
  const events: string[] = []
  const flush = vi.fn(onYieldRequested)
  const lock: WriterLock = createWriterLock({
    locks: world.locks,
    openChannel: world.channels ?? (() => null),
    onYieldRequested: flush,
    onLost: () => events.push(`${name} lost`),
    ...quick,
  })
  return { lock, events, flush }
}

describe.each<[string, () => World]>([
  ['Web Locks', () => ({ locks: fakeLocks(), channels: fakeChannels() })],
  ['Web Locks without a channel', () => ({ locks: fakeLocks(), channels: null })],
  ['BroadcastChannel only (no Web Locks)', () => ({ locks: null, channels: fakeChannels() })],
])('single writer over %s', (_name, makeWorld) => {
  it('lets the first tab edit and keeps the second one read-only', async () => {
    const world = makeWorld()
    const a = tab(world, 'a')
    const b = tab(world, 'b')
    expect(await a.lock.claim()).toBe(true)
    expect(await b.lock.claim()).toBe(false)
    a.lock.close()
    b.lock.close()
  })

  it('takeover flips the roles, and back again', async () => {
    const world = makeWorld()
    const a = tab(world, 'a')
    const b = tab(world, 'b')
    await a.lock.claim()
    await b.lock.claim()

    await b.lock.takeOver()
    // a lock that is stolen tells its old holder a moment later
    await vi.waitFor(() => expect(a.events).toEqual(['a lost']))
    expect(b.events).toEqual([])
    // when tabs can talk, the editing one is asked to save first
    if (world.channels) expect(a.flush).toHaveBeenCalledTimes(1)

    await a.lock.takeOver()
    await vi.waitFor(() => expect(b.events).toEqual(['b lost']))
    a.lock.close()
    b.lock.close()
  })

  it('a tab that has closed no longer holds the role, so the next tab can take it at once', async () => {
    const world = makeWorld()
    const a = tab(world, 'a')
    const b = tab(world, 'b')
    await a.lock.claim()
    a.lock.close()
    expect(await b.lock.claim()).toBe(true)
    b.lock.close()
  })
})

describe.each<[string, () => World]>([
  ['Web Locks', () => ({ locks: fakeLocks(), channels: fakeChannels() })],
  ['BroadcastChannel only (no Web Locks)', () => ({ locks: null, channels: fakeChannels() })],
])('saving before the other tab starts, over %s', (_name, makeWorld) => {
  it('the new editor waits until the old one has saved and let go', async () => {
    const world = makeWorld()
    const order: string[] = []
    let finishSaving!: () => void
    const saving = new Promise<void>((resolve) => (finishSaving = resolve))
    const a = tab(world, 'a', async () => {
      order.push('saving')
      await saving
      order.push('saved')
    })
    const b = tab(world, 'b')
    await a.lock.claim()
    await b.lock.claim()

    const taking = b.lock.takeOver().then(() => order.push('taken'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(order).toEqual(['saving'])
    finishSaving()
    await taking
    expect(order).toEqual(['saving', 'saved', 'taken'])
    expect(a.events).toEqual(['a lost'])
    a.lock.close()
    b.lock.close()
  })
})

describe('when the editing tab does not answer', () => {
  it('with Web Locks the role is taken from it', async () => {
    const world: World = { locks: fakeLocks(), channels: fakeChannels() }
    // a frozen tab never finishes saving
    const frozen = tab(world, 'frozen', () => new Promise(() => {}))
    const taker = tab(world, 'taker')
    await frozen.lock.claim()
    expect(await taker.lock.claim()).toBe(false)

    await taker.lock.takeOver()
    await vi.waitFor(() => expect(frozen.events).toEqual(['frozen lost']))
    frozen.lock.close()
    taker.lock.close()
  })

  it('with only a channel the asking tab waits a moment for the answer, then goes ahead', async () => {
    const world: World = { locks: null, channels: fakeChannels() }
    const gone = tab(world, 'gone')
    const taker = tab(world, 'taker')
    await gone.lock.claim()
    // the editing tab went away without telling anyone
    gone.lock.close()
    const started = Date.now()
    await taker.lock.takeOver()
    expect(Date.now() - started).toBeGreaterThanOrEqual(quick.yieldWaitMs - 10)
    // and it is the editing tab now: a newcomer is read-only
    expect(await tab(world, 'newcomer').lock.claim()).toBe(false)
    taker.lock.close()
  })
})

describe('without Web Locks and without a channel', () => {
  it('edits, since there is nothing to coordinate with', async () => {
    const lock = createWriterLock({ locks: null, openChannel: () => null, onYieldRequested: async () => {}, onLost: () => {} })
    expect(await lock.claim()).toBe(true)
    lock.close()
  })
})
