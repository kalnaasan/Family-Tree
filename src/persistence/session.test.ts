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
})
