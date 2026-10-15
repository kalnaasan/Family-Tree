import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it } from 'vitest'
import { addParentLink, addPerson, emptyTree } from '../domain/tree.ts'
import { TREE_KEY, openFamilyTreeDb } from './db.ts'
import { createTreeStorage } from './storage.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory() // fresh database for every test
})

describe('tree storage', () => {
  it('reports an empty database', async () => {
    expect(await createTreeStorage().load()).toEqual({ status: 'empty' })
  })

  it('round-trips a Tree through IndexedDB', async () => {
    let tree = addPerson(emptyTree(), { id: id(1), firstName: 'Anna', birthDate: '1962-05-14' })
    tree = addPerson(tree, { id: id(2), firstName: 'Ben' })
    tree = addParentLink(tree, id(2), id(1))
    await createTreeStorage().save(tree)
    // a new connection, as after a reload
    expect(await createTreeStorage().load()).toEqual({ status: 'loaded', tree })
  })

  it('overwrites the single stored document on every save', async () => {
    const storage = createTreeStorage()
    await storage.save(addPerson(emptyTree(), { id: id(1), firstName: 'Anna' }))
    await storage.save(addPerson(emptyTree(), { id: id(2), firstName: 'Zoe' }))
    const loaded = await storage.load()
    expect(loaded.status === 'loaded' && loaded.tree.persons.map((p) => p.firstName)).toEqual(['Zoe'])
  })

  it('reports an unreadable document and leaves it untouched', async () => {
    const db = await openFamilyTreeDb()
    const bad = { format: 'family-tree', schemaVersion: 99, persons: [] }
    await db.put('tree', bad as never, TREE_KEY)
    db.close()
    const result = await createTreeStorage().load()
    expect(result).toMatchObject({ status: 'invalid', rule: 'unsupported-version' })
    const after = await openFamilyTreeDb()
    expect(await after.get('tree', TREE_KEY)).toEqual(bad)
  })

  it('creates the photo and snapshot stores for later tickets', async () => {
    const db = await openFamilyTreeDb()
    expect([...db.objectStoreNames].sort()).toEqual(['photos', 'snapshots', 'tree'])
  })

  it('lets a later call retry after a failed open', async () => {
    let attempts = 0
    const storage = createTreeStorage(() => (++attempts === 1 ? Promise.reject(new Error('blocked')) : openFamilyTreeDb()))
    await expect(storage.load()).rejects.toThrow('blocked')
    expect(await storage.load()).toEqual({ status: 'empty' })
  })
})
