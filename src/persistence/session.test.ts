import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTreeStore } from '../domain/store.ts'
import { addPerson, emptyTree } from '../domain/tree.ts'
import { usePersistenceStatus } from './saveStatus.ts'
import { startPersistence } from './session.ts'
import type { LoadResult, TreeStorage } from './storage.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function fakeStorage(load: () => Promise<LoadResult>, save = vi.fn().mockResolvedValue(undefined)) {
  return { storage: { load, save } satisfies TreeStorage, save }
}

function beforeUnload() {
  const event = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

let stop: (() => void) | undefined
const persist = vi.fn().mockResolvedValue(true)

beforeEach(() => {
  vi.useFakeTimers()
  persist.mockClear()
  Object.defineProperty(navigator, 'storage', { value: { persist }, configurable: true })
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.useRealTimers()
})

describe('persistence session', () => {
  it('loads the saved Tree without treating the load as an edit', async () => {
    const saved = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
    const { storage, save } = fakeStorage(async () => ({ status: 'loaded', tree: saved }))
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    expect(store.getState().persons).toEqual(saved.persons)
    expect(usePersistenceStatus.getState().load).toBe('ready')
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
  })

  it('requests persistent storage once, on the first edit', async () => {
    const { storage } = fakeStorage(async () => ({ status: 'empty' }))
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    await vi.advanceTimersByTimeAsync(0)
    expect(persist).toHaveBeenCalledTimes(1)
    expect(usePersistenceStatus.getState().persistent).toBe(true)
  })

  it('warns before leaving only while a save is pending or failed', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { storage } = fakeStorage(async () => ({ status: 'empty' }), save)
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    expect(beforeUnload()).toBe(false) // nothing to save
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    expect(beforeUnload()).toBe(true) // pending
    await vi.advanceTimersByTimeAsync(500)
    expect(usePersistenceStatus.getState().save).toBe('saved')
    expect(beforeUnload()).toBe(false) // saved again

    save.mockRejectedValueOnce(new Error('disk full'))
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    await vi.advanceTimersByTimeAsync(500)
    expect(usePersistenceStatus.getState().save).toBe('error')
    expect(beforeUnload()).toBe(true) // failed
  })

  it('keeps the in-memory Tree after a failed write and saves it on the next change', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('disk full')).mockResolvedValue(undefined)
    const { storage } = fakeStorage(async () => ({ status: 'empty' }), save)
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    await vi.advanceTimersByTimeAsync(500)
    expect(store.getState().persons).toHaveLength(1)
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    await vi.advanceTimersByTimeAsync(500)
    const saved = save.mock.lastCall![0]
    expect(saved.persons.map((p: { firstName: string }) => p.firstName)).toEqual(['Anna', 'Ben'])
    expect(usePersistenceStatus.getState().save).toBe('saved')
  })

  it('never overwrites an unreadable saved document', async () => {
    const { storage, save } = fakeStorage(async () => ({ status: 'invalid', rule: 'invalid-data', message: 'bad' }))
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    expect(usePersistenceStatus.getState().load).toBe('invalid')
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    await vi.advanceTimersByTimeAsync(5000)
    expect(save).not.toHaveBeenCalled()
    expect(beforeUnload()).toBe(false)
  })

  it('still autosaves, and shows failures, when storage is unavailable', async () => {
    const save = vi.fn().mockRejectedValue(new Error('no storage'))
    const { storage } = fakeStorage(() => Promise.reject(new Error('IndexedDB blocked')), save)
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    expect(usePersistenceStatus.getState()).toMatchObject({ load: 'unavailable', loadMessage: 'IndexedDB blocked' })
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    await vi.advanceTimersByTimeAsync(500)
    expect(usePersistenceStatus.getState().save).toBe('error')
  })

  describe('photo cleanup', () => {
    const fakeGc = () => ({ sweep: vi.fn().mockResolvedValue(undefined), start: vi.fn(), stop: vi.fn() })

    it('sweeps orphan photos once the saved Tree is in the store, then keeps sweeping, and stops with the session', async () => {
      const saved = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
      const { storage } = fakeStorage(async () => ({ status: 'loaded', tree: saved }))
      const gc = fakeGc()
      const store = createTreeStore()
      const treeAtSweep: number[] = []
      gc.sweep.mockImplementation(async () => void treeAtSweep.push(store.getState().persons.length))
      const cleanup = await startPersistence(store, storage, gc)
      expect(treeAtSweep).toEqual([1]) // the saved Tree was loaded before the sweep, or it would find no photo in use
      expect(gc.start).toHaveBeenCalledTimes(1)
      cleanup()
      expect(gc.stop).toHaveBeenCalledTimes(1)
    })

    it('sweeps for a brand-new, empty database too', async () => {
      const { storage } = fakeStorage(async () => ({ status: 'empty' }))
      const gc = fakeGc()
      stop = await startPersistence(createTreeStore(), storage, gc)
      expect(gc.sweep).toHaveBeenCalledTimes(1)
      expect(gc.start).toHaveBeenCalledTimes(1)
    })

    it('never sweeps when the saved document cannot be read: the Tree in memory is not the real one', async () => {
      const { storage } = fakeStorage(async () => ({ status: 'invalid', rule: 'invalid-data', message: 'bad' }))
      const gc = fakeGc()
      stop = await startPersistence(createTreeStore(), storage, gc)
      expect(gc.sweep).not.toHaveBeenCalled()
      expect(gc.start).not.toHaveBeenCalled()
    })

    it('never sweeps when storage is unavailable', async () => {
      const { storage } = fakeStorage(() => Promise.reject(new Error('IndexedDB blocked')))
      const gc = fakeGc()
      stop = await startPersistence(createTreeStore(), storage, gc)
      expect(gc.sweep).not.toHaveBeenCalled()
      expect(gc.start).not.toHaveBeenCalled()
    })
  })

  describe('when the saved Tree is loaded', () => {
    it('starts what needs it once the Tree is in the store, and stops it with the session', async () => {
      const saved = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
      const { storage } = fakeStorage(async () => ({ status: 'loaded', tree: saved }))
      const store = createTreeStore()
      const seen: number[] = []
      const stopHook = vi.fn()
      const cleanup = await startPersistence(store, storage, undefined, () => {
        seen.push(store.getState().persons.length)
        return stopHook
      })
      expect(seen).toEqual([1])
      cleanup()
      expect(stopHook).toHaveBeenCalledTimes(1)
    })

    it('starts it for a brand-new, empty database too', async () => {
      const { storage } = fakeStorage(async () => ({ status: 'empty' }))
      const start = vi.fn(() => () => {})
      stop = await startPersistence(createTreeStore(), storage, undefined, start)
      expect(start).toHaveBeenCalledTimes(1)
    })

    it('never starts it when the saved document cannot be read, or storage is unavailable', async () => {
      const start = vi.fn(() => () => {})
      const invalid = fakeStorage(async () => ({ status: 'invalid', rule: 'invalid-data', message: 'bad' }))
      stop = await startPersistence(createTreeStore(), invalid.storage, undefined, start)
      const unavailable = fakeStorage(() => Promise.reject(new Error('IndexedDB blocked')))
      stop = await startPersistence(createTreeStore(), unavailable.storage, undefined, start)
      expect(start).not.toHaveBeenCalled()
    })
  })

  it('counts a browser without persistent storage as a refusal, so the backup banner can show', async () => {
    Object.defineProperty(navigator, 'storage', { value: {}, configurable: true })
    usePersistenceStatus.setState({ persistent: null })
    const { storage } = fakeStorage(async () => ({ status: 'empty' }))
    const store = createTreeStore()
    stop = await startPersistence(store, storage)
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    expect(usePersistenceStatus.getState().persistent).toBe(false)
  })

  it('stops listening after cleanup', async () => {
    const save = vi.fn().mockResolvedValue(undefined)
    const { storage } = fakeStorage(async () => ({ status: 'empty' }), save)
    const store = createTreeStore()
    const cleanup = await startPersistence(store, storage)
    cleanup()
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    await vi.advanceTimersByTimeAsync(2000)
    expect(save).not.toHaveBeenCalled()
    expect(beforeUnload()).toBe(false)
  })

  describe('as a read-only tab (another tab is editing)', () => {
    it('shows the saved Tree but refuses changes, and never saves, sweeps or snapshots', async () => {
      const saved = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
      const { storage, save } = fakeStorage(async () => ({ status: 'loaded', tree: saved }))
      const gc = { sweep: vi.fn(), start: vi.fn(), stop: vi.fn() }
      const onLoaded = vi.fn(() => () => {})
      const store = createTreeStore()
      stop = await startPersistence(store, storage, gc, onLoaded, 'reader')

      expect(store.getState().persons).toEqual(saved.persons)
      expect(store.getState().readOnly).toBe(true)
      expect(() => store.getState().addPerson({ id: id(2), firstName: 'Ben' })).toThrow(/read-only/)
      await vi.advanceTimersByTimeAsync(2000)
      expect(save).not.toHaveBeenCalled()
      expect(gc.sweep).not.toHaveBeenCalled()
      expect(onLoaded).not.toHaveBeenCalled()
      expect(beforeUnload()).toBe(false)
      expect(persist).not.toHaveBeenCalled()
    })

    it('becoming the editing tab allows changes and saves them', async () => {
      const { storage, save } = fakeStorage(async () => ({ status: 'empty' }))
      const store = createTreeStore()
      const reader = await startPersistence(store, storage, undefined, undefined, 'reader')
      reader()
      stop = await startPersistence(store, storage, undefined, undefined, 'writer')
      expect(store.getState().readOnly).toBe(false)
      store.getState().addPerson({ id: id(1), firstName: 'Anna' })
      await vi.advanceTimersByTimeAsync(600)
      expect(save).toHaveBeenCalledTimes(1)
    })

    it('an editing tab asked to let go can save what is pending first', async () => {
      const { storage, save } = fakeStorage(async () => ({ status: 'empty' }))
      const store = createTreeStore()
      const editing = await startPersistence(store, storage)
      stop = editing
      store.getState().addPerson({ id: id(1), firstName: 'Anna' })
      expect(save).not.toHaveBeenCalled()
      await editing.flush()
      expect(save).toHaveBeenCalledTimes(1)
    })
  })
})
