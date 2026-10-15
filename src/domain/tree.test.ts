import { describe, expect, it } from 'vitest'
import { IntegrityError, type IntegrityRule } from './integrity.ts'
import { partialDateSchema } from './schema.ts'
import {
  addParentLink,
  addPartnership,
  addPerson,
  deletePerson,
  emptyTree,
  removeParentLink,
  removePartnership,
  setFocusPerson,
  updatePartnership,
  updatePerson,
} from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function expectRule(fn: () => unknown, rule: IntegrityRule) {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(IntegrityError)
    expect((error as IntegrityError).rule).toBe(rule)
    return
  }
  throw new Error(`Expected IntegrityError ${rule}`)
}

/** Anna (1) and Karl (2) are partners with child Ben (3); Ben has no other links. */
function family() {
  let t = emptyTree()
  t = addPerson(t, { id: id(1), firstName: 'Anna', gender: 'female' })
  t = addPerson(t, { id: id(2), firstName: 'Karl', gender: 'male' })
  t = addPerson(t, { id: id(3), firstName: 'Ben' })
  t = addParentLink(t, id(3), id(1))
  t = addParentLink(t, id(3), id(2))
  t = addPartnership(t, { id: id(100), personIds: [id(1), id(2)], status: 'current' })
  return t
}

describe('Person', () => {
  it('applies defaults and makes the first Person the Focus person', () => {
    const t = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
    expect(t.persons[0]).toMatchObject({ gender: 'unknown', deceased: false })
    expect(t.focusPersonId).toBe(id(1))
    expect(addPerson(t, { id: id(2), firstName: 'Karl' }).focusPersonId).toBe(id(1))
  })

  it('generates a UUID when no id is given', () => {
    const t = addPerson(emptyTree(), { firstName: 'Anna' })
    expect(t.persons[0]!.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('rejects an empty first name and a bad gender', () => {
    expect(() => addPerson(emptyTree(), { firstName: '  ' })).toThrow()
    expect(() => addPerson(emptyTree(), { firstName: 'A', gender: 'x' as never })).toThrow()
  })

  it('updates fields without changing the id', () => {
    const t = updatePerson(family(), id(3), { lastName: 'Meyer', birthDate: '1990-05', id: id(9) } as never)
    expect(t.persons.find((p) => p.id === id(3))).toMatchObject({ id: id(3), lastName: 'Meyer', birthDate: '1990-05' })
  })

  it('accepts only real partial ISO dates', () => {
    for (const ok of ['1962', '1962-05', '1962-05-14', '2024-02-29']) {
      expect(partialDateSchema.safeParse(ok).success).toBe(true)
    }
    for (const bad of ['62', '1962-13', '1962-00', '2023-02-29', '1962-5', '1962-05-1', 'abc', '0000']) {
      expect(partialDateSchema.safeParse(bad).success).toBe(false)
    }
  })
})

describe('Parent link rules', () => {
  it('rejects a self-link', () => {
    expectRule(() => addParentLink(family(), id(3), id(3)), 'self-link')
  })

  it('rejects a duplicate link, even with a different kind', () => {
    expectRule(() => addParentLink(family(), id(3), id(1)), 'duplicate-link')
    expectRule(() => addParentLink(family(), id(3), id(1), 'adoptive'), 'duplicate-link')
  })

  it('rejects a third birth parent but allows adoptive and step parents beside two birth parents', () => {
    let t = addPerson(family(), { id: id(4), firstName: 'Third' })
    expectRule(() => addParentLink(t, id(3), id(4)), 'third-birth-parent')
    t = addParentLink(t, id(3), id(4), 'adoptive')
    expect(t.parentLinks).toHaveLength(3)
  })

  it('does not require parents to differ in gender', () => {
    let t = addPerson(emptyTree(), { id: id(1), firstName: 'A', gender: 'female' })
    t = addPerson(t, { id: id(2), firstName: 'B', gender: 'female' })
    t = addPerson(t, { id: id(3), firstName: 'C' })
    t = addParentLink(addParentLink(t, id(3), id(1)), id(3), id(2))
    expect(t.parentLinks).toHaveLength(2)
  })

  it('rejects a link to a Person that does not exist', () => {
    expectRule(() => addParentLink(family(), id(3), id(99)), 'dangling-reference')
  })

  it('rejects direct and indirect cycles', () => {
    // Anna -> Ben already (Ben is Anna's child); making Anna a child of Ben is a 2-cycle.
    expectRule(() => addParentLink(family(), id(1), id(3)), 'parent-cycle')
    // Chain: Ben's child Cleo; making Anna a child of Cleo closes a 3-cycle.
    let t = addPerson(family(), { id: id(4), firstName: 'Cleo' })
    t = addParentLink(t, id(4), id(3))
    expectRule(() => addParentLink(t, id(1), id(4)), 'parent-cycle')
  })

  it('leaves the original Tree untouched when a change is rejected', () => {
    const t = family()
    const snapshot = JSON.stringify(t)
    expect(() => addParentLink(t, id(3), id(3))).toThrow()
    expect(JSON.stringify(t)).toBe(snapshot)
  })

  it('removes a link', () => {
    expect(removeParentLink(family(), id(3), id(1)).parentLinks).toHaveLength(1)
    expect(() => removeParentLink(family(), id(1), id(2))).toThrow()
  })
})

describe('Partnership rules', () => {
  it('rejects a self-partnership', () => {
    expectRule(() => addPartnership(family(), { personIds: [id(1), id(1)], status: 'current' }), 'self-partnership')
  })

  it('rejects a duplicate Partnership regardless of order, including an ended one', () => {
    expectRule(() => addPartnership(family(), { personIds: [id(2), id(1)], status: 'ended' }), 'duplicate-partnership')
  })

  it('rejects a Partnership with a missing Person', () => {
    expectRule(() => addPartnership(family(), { personIds: [id(1), id(99)], status: 'current' }), 'dangling-reference')
  })

  it('allows several Partnerships per Person and does not imply children', () => {
    const t = addPartnership(family(), { personIds: [id(1), id(3)], status: 'ended', startDate: '2000' })
    expect(t.partnerships).toHaveLength(2)
    expect(t.parentLinks).toHaveLength(2)
  })

  it('updates the status and removes a Partnership', () => {
    const t = updatePartnership(family(), id(100), { status: 'ended', endDate: '2010-06' })
    expect(t.partnerships[0]).toMatchObject({ status: 'ended', endDate: '2010-06' })
    expect(removePartnership(t, id(100)).partnerships).toEqual([])
  })
})

describe('deletePerson', () => {
  it('cascades to Parent links and Partnerships and reports them', () => {
    const { tree, deleted } = deletePerson(family(), id(1))
    expect(tree.persons.map((p) => p.id)).toEqual([id(2), id(3)])
    expect(tree.parentLinks).toEqual([{ childId: id(3), parentId: id(2), kind: 'birth' }])
    expect(tree.partnerships).toEqual([])
    expect(deleted.person.firstName).toBe('Anna')
    expect(deleted.parentLinks).toHaveLength(1)
    expect(deleted.partnerships).toHaveLength(1)
  })

  it('hands the Focus person to the first remaining Person, or none', () => {
    const { tree } = deletePerson(family(), id(1))
    expect(tree.focusPersonId).toBe(id(2))
    const last = deletePerson(addPerson(emptyTree(), { id: id(1), firstName: 'A' }), id(1)).tree
    expect(last.focusPersonId).toBeNull()
  })

  it('reports the photoId so the caller can delete the Blob', () => {
    const t = addPerson(emptyTree(), { id: id(1), firstName: 'A', photoId: id(50) })
    expect(deletePerson(t, id(1)).deleted.person.photoId).toBe(id(50))
  })

  it('allows several disconnected parts in one Tree', () => {
    const t = addPerson(family(), { id: id(7), firstName: 'Stranger' })
    expect(t.persons).toHaveLength(4)
  })
})

describe('Focus person', () => {
  it('can be changed to an existing Person only', () => {
    expect(setFocusPerson(family(), id(3)).focusPersonId).toBe(id(3))
    expectRule(() => setFocusPerson(family(), id(99)), 'missing-focus-person')
  })
})
