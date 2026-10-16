import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { memorySnapshots } from './memorySnapshots.ts'
import { MAX_SNAPSHOTS, SNAPSHOT_INTERVAL_MS, createSnapshotKeeper, startSnapshotSchedule } from './snapshots.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** A Tree with `count` people, so that two Trees with different counts differ. */
function treeOf(count: number): Tree {
  let tree = emptyTree()
  for (let i = 1; i <= count; i++) tree = addPerson(tree, { id: id(i), firstName: `Person ${i}` })
  return tree
}

function setup() {
  let time = new Date('2026-05-01T08:00:00Z').getTime()
  let next = 0
  const storage = memorySnapshots()
  const keeper = createSnapshotKeeper(storage, () => new Date(time), () => `snap-${++next}`)
  return { storage, keeper, advance: (ms: number) => void (time += ms) }
}

describe('snapshot keeper', () => {
  it('keeps a copy with its date and number of people, newest first', async () => {
    const { keeper, advance } = setup()
    expect(await keeper.take(treeOf(2), 'load')).toBe(true)
    advance(SNAPSHOT_INTERVAL_MS)
    expect(await keeper.take(treeOf(3), 'hourly')).toBe(true)
    expect(await keeper.list()).toEqual([
      { id: 'snap-2', takenAt: '2026-05-01T09:00:00.000Z', reason: 'hourly', personCount: 3 },
      { id: 'snap-1', takenAt: '2026-05-01T08:00:00.000Z', reason: 'load', personCount: 2 },
    ])
  })

  it(`keeps at most ${MAX_SNAPSHOTS}, dropping the oldest`, async () => {
    const { keeper, advance, storage } = setup()
    for (let people = 1; people <= MAX_SNAPSHOTS + 3; people++) {
      await keeper.take(treeOf(people), 'hourly')
      advance(1000)
    }
    const kept = await keeper.list()
    expect(kept).toHaveLength(MAX_SNAPSHOTS)
    expect(kept.map((s) => s.personCount)).toEqual([8, 7, 6, 5, 4])
    expect(storage.records.size).toBe(MAX_SNAPSHOTS)
  })

  it('does not keep an empty Tree', async () => {
    const { keeper } = setup()
    expect(await keeper.take(emptyTree(), 'load')).toBe(false)
    expect(await keeper.list()).toEqual([])
  })

  it('does not keep a copy identical to the newest, so reloading does not push real versions out', async () => {
    const { keeper, advance } = setup()
    await keeper.take(treeOf(2), 'load')
    for (let reload = 0; reload < 10; reload++) {
      advance(1000)
      expect(await keeper.take(treeOf(2), 'load')).toBe(false)
    }
    expect(await keeper.list()).toHaveLength(1)
    advance(1000)
    expect(await keeper.take(treeOf(3), 'hourly')).toBe(true)
  })

  it('reads a copy back as the Tree it was', async () => {
    const { keeper } = setup()
    const tree = { ...treeOf(3), focusPersonId: id(2) }
    await keeper.take(tree, 'import')
    expect(await keeper.get('snap-1')).toEqual(tree)
    expect(await keeper.get('nothing')).toBeUndefined()
  })

  it('refuses to claim success when it could not write, and drops nothing then', async () => {
    const { keeper, storage, advance } = setup()
    for (let people = 1; people <= MAX_SNAPSHOTS; people++) {
      await keeper.take(treeOf(people), 'hourly')
      advance(1000)
    }
    storage.failPut = true
    await expect(keeper.take(treeOf(9), 'import')).rejects.toThrow()
    expect(storage.records.size).toBe(MAX_SNAPSHOTS)
  })

  it('knows which photos its copies refer to, and notices a new copy', async () => {
    const { keeper } = setup()
    const photo = id(77)
    const tree = addPerson(emptyTree(), { id: id(1), firstName: 'Anna', photoId: photo })
    expect(await keeper.referencedPhotoIds()).toEqual(new Set())
    await keeper.take(tree, 'import')
    expect(await keeper.referencedPhotoIds()).toEqual(new Set([photo]))
  })
})

describe('snapshot schedule', () => {
  beforeEach(() => vi.useFakeTimers({ now: new Date('2026-05-01T08:00:00Z') }))
  afterEach(() => vi.useRealTimers())

  function schedule(tree: Tree = treeOf(2)) {
    const take = vi.fn().mockResolvedValue(true)
    let current = tree
    const listeners = new Set<() => void>()
    const stop = startSnapshotSchedule({
      subscribe: (listener) => {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
      getTree: () => current,
      keeper: { take },
    })
    const edit = (next: Tree) => {
      current = next
      for (const listener of listeners) listener()
    }
    return { take, edit, stop, listeners }
  }

  it('takes a Snapshot of the loaded Tree at once', () => {
    const { take } = schedule()
    expect(take).toHaveBeenCalledTimes(1)
    expect(take).toHaveBeenCalledWith(expect.objectContaining({ persons: expect.any(Array) }), 'load')
  })

  it('takes nothing during a quiet hour', async () => {
    const { take } = schedule()
    await vi.advanceTimersByTimeAsync(5 * SNAPSHOT_INTERVAL_MS)
    expect(take).toHaveBeenCalledTimes(1)
  })

  it('takes one an hour after the last one, however many edits came meanwhile, and not before', async () => {
    const { take, edit } = schedule()
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    edit(treeOf(3))
    edit(treeOf(4))
    await vi.advanceTimersByTimeAsync(49 * 60 * 1000 + 59 * 1000)
    expect(take).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(take).toHaveBeenCalledTimes(2)
    expect(take.mock.lastCall![0].persons).toHaveLength(4) // the Tree as it is then, not as it was at the first edit
    expect(take.mock.lastCall![1]).toBe('hourly')
  })

  it('waits a full hour again after that, and an edit after a long quiet spell is taken at once', async () => {
    const { take, edit } = schedule()
    edit(treeOf(3))
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS)
    expect(take).toHaveBeenCalledTimes(2)
    edit(treeOf(4))
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS - 1000)
    expect(take).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(take).toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(3 * SNAPSHOT_INTERVAL_MS) // a long quiet spell
    edit(treeOf(5))
    await vi.advanceTimersByTimeAsync(0)
    expect(take).toHaveBeenCalledTimes(4)
  })

  it('keeps going when a Snapshot cannot be written', async () => {
    const take = vi.fn().mockRejectedValue(new Error('full'))
    let listener = () => {}
    startSnapshotSchedule({
      subscribe: (l) => {
        listener = l
        return () => {}
      },
      getTree: () => treeOf(2),
      keeper: { take },
    })
    listener()
    await vi.advanceTimersByTimeAsync(SNAPSHOT_INTERVAL_MS)
    expect(take).toHaveBeenCalledTimes(2)
  })

  it('stops with the session', async () => {
    const { take, edit, stop, listeners } = schedule()
    edit(treeOf(3))
    stop()
    expect(listeners.size).toBe(0)
    await vi.advanceTimersByTimeAsync(2 * SNAPSHOT_INTERVAL_MS)
    expect(take).toHaveBeenCalledTimes(1)
  })
})
