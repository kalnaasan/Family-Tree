import { describe, expect, it } from 'vitest'
import { IntegrityError } from './integrity.ts'
import { createTreeStore } from './store.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

describe('tree store', () => {
  it('starts empty and keeps the first Person as Focus person', () => {
    const store = createTreeStore()
    expect(store.getState().persons).toEqual([])
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    store.getState().addPerson({ id: id(2), firstName: 'Ben' })
    expect(store.getState().focusPersonId).toBe(id(1))
    expect(store.getState().persons).toHaveLength(2)
  })

  it('leaves the state unchanged when an integrity rule rejects an action', () => {
    const store = createTreeStore()
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    const before = store.getState().parentLinks
    expect(() => store.getState().addParentLink(id(1), id(1))).toThrow(IntegrityError)
    expect(store.getState().parentLinks).toBe(before)
  })

  it('returns what a delete removed and applies the cascade', () => {
    const store = createTreeStore()
    const s = () => store.getState()
    s().addPerson({ id: id(1), firstName: 'Anna' })
    s().addPerson({ id: id(2), firstName: 'Ben' })
    s().addParentLink(id(2), id(1))
    s().addPartnership({ id: id(100), personIds: [id(1), id(2)], status: 'current' })
    const deleted = s().deletePerson(id(1))
    expect(deleted.parentLinks).toHaveLength(1)
    expect(deleted.partnerships).toHaveLength(1)
    expect(s().persons.map((p) => p.id)).toEqual([id(2)])
    expect(s().focusPersonId).toBe(id(2))
  })

  it('loadTree replaces everything', () => {
    const store = createTreeStore()
    store.getState().addPerson({ id: id(1), firstName: 'Anna' })
    store.getState().loadTree({
      focusPersonId: id(5),
      persons: [{ id: id(5), firstName: 'Zoe', gender: 'unknown', deceased: false }],
      parentLinks: [],
      partnerships: [],
    })
    expect(store.getState().persons.map((p) => p.firstName)).toEqual(['Zoe'])
    expect(store.getState().focusPersonId).toBe(id(5))
  })
})
