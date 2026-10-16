import { describe, expect, it, vi } from 'vitest'
import { HISTORY_LIMIT, emptyHistory, pushStep, redoStep, undoStep } from './history.ts'
import type { Tree } from './schema.ts'
import { createTreeStore } from './store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const treeOf = (tree: Tree) => ({
  focusPersonId: tree.focusPersonId,
  persons: tree.persons,
  parentLinks: tree.parentLinks,
  partnerships: tree.partnerships,
})
const snapshot = (store: ReturnType<typeof createTreeStore>) => treeOf(store.getState())

function family() {
  // Ben (1) with parents Karl (2) and Maria (3), partner Eva (4).
  let tree = ['Ben', 'Karl', 'Maria', 'Eva'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  tree = addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3))
  tree = addPartnership(tree, { personIds: [id(1), id(4)], status: 'current' })
  return createTreeStore(tree)
}

describe('pure history helpers', () => {
  const step = (n: number) => ({ id: n, label: `s${n}`, before: emptyTree(), after: emptyTree() })

  it('push, undo and redo move steps between the lists', () => {
    let history = pushStep(emptyHistory(), step(1)).history
    history = pushStep(history, step(2)).history
    const undone = undoStep(history)!
    expect(undone.step.id).toBe(2)
    expect(undone.history.past.map((s) => s.id)).toEqual([1])
    expect(undone.history.future.map((s) => s.id)).toEqual([2])
    const redone = redoStep(undone.history)!
    expect(redone.history.past.map((s) => s.id)).toEqual([1, 2])
    expect(redone.history.future).toEqual([])
  })

  it('has nothing to undo or redo when empty', () => {
    expect(undoStep(emptyHistory())).toBeNull()
    expect(redoStep(emptyHistory())).toBeNull()
  })

  it('a new step ends the redo chain and returns what was dropped', () => {
    let history = pushStep(emptyHistory(), step(1)).history
    history = pushStep(history, step(2)).history
    history = undoStep(history)!.history
    const pushed = pushStep(history, step(3))
    expect(pushed.history.future).toEqual([])
    expect(pushed.discarded.map((s) => s.id)).toEqual([2])
  })

  it('keeps at most the limit, oldest out first', () => {
    let history = emptyHistory()
    const dropped: number[] = []
    for (let n = 1; n <= HISTORY_LIMIT + 5; n++) {
      const pushed = pushStep(history, step(n))
      history = pushed.history
      dropped.push(...pushed.discarded.map((s) => s.id))
    }
    expect(history.past).toHaveLength(HISTORY_LIMIT)
    expect(dropped).toEqual([1, 2, 3, 4, 5])
    expect(history.past[0]!.id).toBe(6)
  })
})

describe('undo and redo in the store', () => {
  it('undo of an add-relative restores the exact prior document, and redo brings it back', () => {
    const store = family()
    const before = snapshot(store)
    store.getState().addRelative({ anchorId: id(1), relation: 'brother', person: { firstName: 'Tom' } })
    const after = snapshot(store)
    expect(after.persons).toHaveLength(5)

    const undone = store.getState().undo()
    expect(undone?.label).toBe('Add brother')
    const restored = snapshot(store)
    expect(restored.persons).toBe(before.persons)
    expect(restored.parentLinks).toBe(before.parentLinks)
    expect(restored.partnerships).toBe(before.partnerships)
    expect(restored).toEqual(before)

    store.getState().redo()
    expect(snapshot(store)).toEqual(after)
  })

  it('a flow that created a Person, links and a Partnership is undone in one step', () => {
    const store = createTreeStore(addPerson(emptyTree(), { id: id(1), firstName: 'Ben' }))
    const before = snapshot(store)
    store.getState().addRelative({ anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })
    expect(store.getState().persons).toHaveLength(3) // Ben, Anna, the unnamed shared parent
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(snapshot(store)).toEqual(before)
  })

  it('undo of a delete restores the Person, their links, Partnerships and Focus', () => {
    const store = family()
    store.getState().setFocusPerson(id(1))
    const before = snapshot(store)
    const removed = store.getState().deletePerson(id(1))
    expect(removed.parentLinks).toHaveLength(2)
    expect(removed.partnerships).toHaveLength(1)
    expect(store.getState().focusPersonId).not.toBe(id(1))

    expect(store.getState().undo()?.label).toBe('Delete Ben')
    expect(snapshot(store)).toEqual(before)
    expect(store.getState().focusPersonId).toBe(id(1))
  })

  it('a Focus change is undoable', () => {
    const store = family()
    store.getState().setFocusPerson(id(2))
    expect(store.getState().focusPersonId).toBe(id(2))
    store.getState().undo()
    expect(store.getState().focusPersonId).toBe(id(1))
  })

  it('edits are one step each', () => {
    const store = family()
    store.getState().updatePerson(id(1), { firstName: 'Benno' })
    expect(store.getState().persons[0]!.firstName).toBe('Benno')
    store.getState().undo()
    expect(store.getState().persons[0]!.firstName).toBe('Ben')
  })

  it('undo then a new action drops the redo chain', () => {
    const store = family()
    store.getState().updatePerson(id(1), { firstName: 'A' })
    store.getState().undo()
    expect(store.getState().future).toHaveLength(1)
    store.getState().updatePerson(id(1), { firstName: 'B' })
    expect(store.getState().future).toHaveLength(0)
    expect(store.getState().redo()).toBeNull()
  })

  it('undo and redo with nothing to do return null and change nothing', () => {
    const store = family()
    const listener = vi.fn()
    store.subscribe(listener)
    expect(store.getState().undo()).toBeNull()
    expect(store.getState().redo()).toBeNull()
    expect(listener).not.toHaveBeenCalled()
  })

  it('a refused action records no step', () => {
    const store = family()
    expect(() => store.getState().addRelative({ anchorId: id(1), relation: 'father', person: { firstName: 'Third' } })).toThrow()
    expect(store.getState().past).toHaveLength(0)
  })

  it('every action, undo and redo is exactly one store update', () => {
    const store = family()
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().addRelative({ anchorId: id(1), relation: 'son', person: { firstName: 'Leo' } })
    store.getState().undo()
    store.getState().redo()
    expect(listener).toHaveBeenCalledTimes(3)
  })

  it('keeps the latest 50 steps', () => {
    const store = family()
    for (let n = 0; n < 60; n++) store.getState().updatePerson(id(1), { firstName: `Ben${n}` })
    expect(store.getState().past).toHaveLength(HISTORY_LIMIT)
    for (let n = 0; n < HISTORY_LIMIT; n++) store.getState().undo()
    expect(store.getState().undo()).toBeNull()
    expect(store.getState().persons[0]!.firstName).toBe('Ben9') // the 10 oldest edits cannot be undone
  })
})

describe('what undo does not touch', () => {
  it('loadTree (storage load, import, restore) clears the history: import is not undoable', () => {
    const store = family()
    store.getState().updatePerson(id(1), { firstName: 'A' })
    store.getState().undo()
    store.getState().updatePerson(id(1), { firstName: 'B' })
    store.getState().loadTree(addPerson(emptyTree(), { id: id(9), firstName: 'Imported' }))
    expect(store.getState().past).toEqual([])
    expect(store.getState().future).toEqual([])
    expect(store.getState().undo()).toBeNull()
    expect(store.getState().persons.map((p) => p.firstName)).toEqual(['Imported'])
  })

  it('a new store starts with no history, as after a reload', () => {
    const store = family()
    expect(store.getState().past).toEqual([])
    expect(store.getState().future).toEqual([])
  })
})

describe('release: deleted photo Blobs stay until the step leaves history', () => {
  it('is not called by undo or redo', () => {
    const store = family()
    const release = vi.fn()
    store.getState().deletePerson(id(1), { release })
    store.getState().undo()
    store.getState().redo()
    expect(release).not.toHaveBeenCalled()
  })

  it('is called when the step is pushed out by newer ones', () => {
    const store = family()
    const release = vi.fn()
    store.getState().deletePerson(id(4), { release })
    for (let n = 0; n < HISTORY_LIMIT - 1; n++) store.getState().updatePerson(id(1), { firstName: `Ben${n}` })
    expect(release).not.toHaveBeenCalled()
    store.getState().updatePerson(id(1), { firstName: 'one more' })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('is called when a new action discards an undone step', () => {
    const store = family()
    const release = vi.fn()
    store.getState().deletePerson(id(4), { release })
    store.getState().undo()
    expect(release).not.toHaveBeenCalled()
    store.getState().updatePerson(id(1), { firstName: 'New' })
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('is called when a load clears the history', () => {
    const store = family()
    const release = vi.fn()
    store.getState().deletePerson(id(4), { release })
    store.getState().loadTree(emptyTree())
    expect(release).toHaveBeenCalledTimes(1)
  })
})
