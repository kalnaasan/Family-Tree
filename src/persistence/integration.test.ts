import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTreeStore } from '../domain/store.ts'
import { usePersistenceStatus } from './saveStatus.ts'
import { startPersistence } from './session.ts'
import { createTreeStorage } from './storage.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
})

// Real store + real session + real IndexedDB code (fake-indexeddb), real timers. Guards against passing
// store state (which contains action functions) to IndexedDB, which cannot clone functions.
describe('persistence end to end (store -> IndexedDB -> store)', () => {
  it('saves edits made through the real store and loads them into a new store', async () => {
    const store = createTreeStore()
    const stop = await startPersistence(store, createTreeStorage())
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    store.getState().addParentLink(id(2), id(1))
    await expect.poll(() => usePersistenceStatus.getState().save, { timeout: 3000 }).toBe('saved')
    stop()

    const reloaded = createTreeStore()
    const stop2 = await startPersistence(reloaded, createTreeStorage())
    expect(reloaded.getState().persons.map((p) => p.firstName)).toEqual(['Anna', 'Ben'])
    expect(reloaded.getState().parentLinks).toHaveLength(1)
    expect(reloaded.getState().focusPersonId).toBe(id(1))
    stop2()
  })
})
