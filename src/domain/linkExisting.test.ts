import { describe, expect, it } from 'vitest'
import { renderEnglish } from '../i18n/testing.ts'
import { type Relation, questionFor } from './addRelative.ts'
import { IntegrityError } from './integrity.ts'
import { type Candidate, candidatesFor, linkExisting, previewLinkFor } from './linkExisting.ts'
import type { Tree } from './schema.ts'
import { createTreeStore } from './store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree, setParentLinkKind } from './tree.ts'

const UNNAMED = 'Unnamed parent'
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const nameOf = (tree: Tree, personId: string) => tree.persons.find((p) => p.id === personId)!.firstName
const parentsOf = (tree: Tree, childId: string) =>
  tree.parentLinks.filter((l) => l.childId === childId).map((l) => nameOf(tree, l.parentId))

function withPeople(...names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}
const link = (tree: Tree, relation: Relation, anchor: number, picked: number, answers = {}) =>
  linkExisting(tree, { anchorId: id(anchor), relation, personId: id(picked), answers, unnamedParentName: UNNAMED })

describe('linking an existing parent', () => {
  it('adds a birth Parent link and nothing else when the Person has no parents', () => {
    const tree = link(withPeople('Ben', 'Karl'), 'father', 1, 2)
    expect(tree.parentLinks).toEqual([{ childId: id(1), parentId: id(2), kind: 'birth' }])
    expect(tree.partnerships).toHaveLength(0)
    expect(tree.persons).toHaveLength(2)
  })

  it('reuses the question about the partnership with the existing parent', () => {
    const base = link(withPeople('Ben', 'Karl', 'Maria'), 'father', 1, 2)
    expect(questionFor(base, id(1), 'mother').kind).toBe('parent-partnership')
    expect(link(base, 'mother', 1, 3).partnerships).toMatchObject([{ personIds: [id(2), id(3)], status: 'current' }])
    expect(link(base, 'mother', 1, 3, { parentPartnership: 'ended' }).partnerships[0]!.status).toBe('ended')
    expect(link(base, 'mother', 1, 3, { parentPartnership: 'none' }).partnerships).toHaveLength(0)
  })

  it('does not add a second Partnership when the two parents already are partners', () => {
    let base = link(withPeople('Ben', 'Karl', 'Maria'), 'father', 1, 2)
    base = addPartnership(base, { personIds: [id(2), id(3)], status: 'ended' })
    expect(link(base, 'mother', 1, 3).partnerships).toHaveLength(1)
    expect(candidatesFor(base, id(1), 'mother').find((c) => c.person.id === id(3))!.status).toEqual({ valid: true })
  })
})

describe('linking an existing child', () => {
  it('adds the Parent link, with the latest current partner as the other parent by default', () => {
    let base = withPeople('Anna', 'Ben', 'Cora')
    base = addPartnership(base, { personIds: [id(1), id(2)], status: 'current' })
    expect(parentsOf(link(base, 'child', 1, 3), id(3)).sort()).toEqual(['Anna', 'Ben'])
    expect(parentsOf(link(base, 'child', 1, 3, { otherParentId: null }), id(3))).toEqual(['Anna'])
  })

  it('does not make the picked child their own other parent', () => {
    let base = withPeople('Anna', 'Ben')
    base = addPartnership(base, { personIds: [id(1), id(2)], status: 'current' })
    expect(link(base, 'child', 1, 2).parentLinks).toEqual([{ childId: id(2), parentId: id(1), kind: 'birth' }])
    expect(() => link(base, 'child', 1, 2, { otherParentId: id(2) })).toThrow()
  })
})

describe('linking an existing partner', () => {
  it('adds a Partnership with the answered status', () => {
    const base = withPeople('Anna', 'Ben')
    expect(link(base, 'partner', 1, 2).partnerships).toMatchObject([{ personIds: [id(1), id(2)], status: 'current' }])
    expect(link(base, 'partner', 1, 2, { partnerStatus: 'ended' }).partnerships[0]!.status).toBe('ended')
  })
})

describe('linking an existing sibling', () => {
  it("links to the anchor's birth parents", () => {
    let base = withPeople('Ben', 'Karl', 'Maria', 'Eva')
    base = addParentLink(addParentLink(base, id(1), id(2)), id(1), id(3))
    expect(parentsOf(link(base, 'sister', 1, 4), id(4)).sort()).toEqual(['Karl', 'Maria'])
    expect(parentsOf(link(base, 'sister', 1, 4, { siblingParents: id(2) }), id(4))).toEqual(['Karl'])
  })

  it('makes one unnamed shared parent when the anchor has none', () => {
    const tree = link(withPeople('Ben', 'Eva'), 'sister', 1, 2)
    expect(tree.persons).toHaveLength(3)
    expect(parentsOf(tree, id(1))).toEqual([UNNAMED])
    expect(parentsOf(tree, id(2))).toEqual([UNNAMED])
  })

  it('is all or nothing: a refused link changes nothing', () => {
    const base = addParentLink(withPeople('Ben', 'Karl', 'Eva'), id(3), id(2))
    const snapshot = JSON.stringify(base)
    expect(() => link(base, 'sister', 1, 1)).toThrow()
    expect(JSON.stringify(base)).toBe(snapshot)
  })
})

describe('candidatesFor', () => {
  const reasonOf = (candidates: Candidate[], n: number) => {
    const status = candidates.find((c) => c.person.id === id(n))!.status
    return status.valid ? 'valid' : status.reason
  }

  it('lists every other Person, never the anchor, each valid or with its reason', () => {
    const candidates = candidatesFor(withPeople('Ben', 'Karl', 'Maria', 'Eva'), id(1), 'father')
    expect(candidates.map((c) => c.person.id)).toEqual([id(2), id(3), id(4)])
    expect(candidates.every((c) => c.status.valid)).toBe(true)
  })

  it('already-linked: an existing parent or child', () => {
    const base = addParentLink(withPeople('Ben', 'Karl', 'Maria'), id(1), id(2))
    expect(reasonOf(candidatesFor(base, id(1), 'father'), 2)).toBe('already-linked')
    expect(reasonOf(candidatesFor(base, id(2), 'son'), 1)).toBe('already-linked')
    expect(reasonOf(candidatesFor(base, id(1), 'father'), 3)).toBe('valid')
  })

  it('own-ancestor: a descendant cannot become a parent, an ancestor cannot become a child', () => {
    let base = withPeople('Gran', 'Mum', 'Kid')
    base = addParentLink(addParentLink(base, id(2), id(1)), id(3), id(2))
    expect(reasonOf(candidatesFor(base, id(1), 'father'), 3)).toBe('own-ancestor')
    expect(reasonOf(candidatesFor(base, id(3), 'son'), 1)).toBe('own-ancestor')
  })

  it('third-birth-parent: the child would get a third birth parent', () => {
    let base = withPeople('Ben', 'Karl', 'Maria', 'Eva')
    base = addParentLink(addParentLink(base, id(1), id(2)), id(1), id(3))
    expect(reasonOf(candidatesFor(base, id(1), 'mother'), 4)).toBe('third-birth-parent')
    expect(reasonOf(candidatesFor(base, id(4), 'son'), 1)).toBe('third-birth-parent')
    expect(reasonOf(candidatesFor(base, id(4), 'son'), 2)).toBe('valid')
  })

  it('already-partners', () => {
    const base = addPartnership(withPeople('Anna', 'Ben', 'Cora'), { personIds: [id(1), id(2)], status: 'ended' })
    expect(reasonOf(candidatesFor(base, id(1), 'partner'), 2)).toBe('already-partners')
    expect(reasonOf(candidatesFor(base, id(1), 'partner'), 3)).toBe('valid')
  })

  it('self: the anchor is not a candidate, and linkExisting refuses it', () => {
    const base = withPeople('Ben')
    expect(candidatesFor(base, id(1), 'partner')).toEqual([])
    expect(() => link(base, 'partner', 1, 1)).toThrow(IntegrityError)
  })

  it('agrees with linkExisting on a generated tree: valid exactly when it does not throw', () => {
    let seed = 12345
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    const size = 12
    let tree = withPeople(...Array.from({ length: size }, (_, i) => `P${i + 1}`))
    for (let i = 0; i < 40; i++) {
      const a = 1 + Math.floor(random() * size)
      const b = 1 + Math.floor(random() * size)
      try {
        tree =
          random() < 0.7
            ? addParentLink(tree, id(a), id(b), random() < 0.8 ? 'birth' : 'step')
            : addPartnership(tree, { personIds: [id(a), id(b)], status: 'current' })
      } catch {
        // an edge the rules refuse is simply not added
      }
    }
    const relations: Relation[] = ['father', 'mother', 'brother', 'sister', 'husband', 'wife', 'partner', 'son', 'daughter', 'child']
    let compared = 0
    let refused = 0
    for (const anchor of tree.persons) {
      for (const relation of relations) {
        for (const candidate of candidatesFor(tree, anchor.id, relation)) {
          let accepted = true
          try {
            linkExisting(tree, { anchorId: anchor.id, relation, personId: candidate.person.id, unnamedParentName: UNNAMED })
          } catch {
            accepted = false
          }
          expect(candidate.status.valid, `${anchor.firstName} ${relation} ${candidate.person.firstName}`).toBe(accepted)
          compared++
          if (!accepted) refused++
        }
      }
    }
    expect(compared).toBeGreaterThan(500)
    expect(refused).toBeGreaterThan(0)
  })
})

describe('previewLinkFor', () => {
  const request = { anchorId: id(1), relation: 'mother' as const, personId: id(3), unnamedParentName: UNNAMED }

  it('words what will be linked, including the partnership with the other parent', () => {
    const base = addParentLink(withPeople('Ben', 'Karl', 'Maria'), id(1), id(2))
    expect(previewLinkFor(base, request).map(renderEnglish)).toEqual(['Maria, mother of Ben', 'A current partnership with Karl'])
  })

  it('leaves the partnership line out when the two parents already are partners', () => {
    let base = addParentLink(withPeople('Ben', 'Karl', 'Maria'), id(1), id(2))
    base = addPartnership(base, { personIds: [id(2), id(3)], status: 'current' })
    expect(previewLinkFor(base, request).map(renderEnglish)).toEqual(['Maria, mother of Ben'])
  })
})

describe('setParentLinkKind', () => {
  const base = () => addParentLink(withPeople('Ben', 'Karl'), id(1), id(2))

  it('changes the kind of one link', () => {
    expect(setParentLinkKind(base(), id(1), id(2), 'adoptive').parentLinks).toEqual([
      { childId: id(1), parentId: id(2), kind: 'adoptive' },
    ])
  })

  it('refuses a third birth parent and a missing link', () => {
    let tree = withPeople('Ben', 'Karl', 'Maria', 'Eva')
    tree = addParentLink(addParentLink(addParentLink(tree, id(1), id(2)), id(1), id(3)), id(1), id(4), 'step')
    expect(() => setParentLinkKind(tree, id(1), id(4), 'birth')).toThrow(IntegrityError)
    expect(() => setParentLinkKind(base(), id(2), id(1), 'step')).toThrow('No such Parent link')
  })
})

describe('store actions', () => {
  function storeWith(...names: string[]) {
    const store = createTreeStore()
    names.forEach((firstName, i) => store.getState().addPerson({ id: id(i + 1), firstName }))
    return store
  }
  type Store = ReturnType<typeof storeWith>
  const doc = (store: Store): Tree => {
    const { focusPersonId, persons, parentLinks, partnerships } = store.getState()
    return structuredClone({ focusPersonId, persons, parentLinks, partnerships })
  }

  it('linkExisting is one Undo step that restores the exact prior document', () => {
    const store = storeWith('Ben', 'Karl')
    const before = doc(store)
    const steps = store.getState().past.length
    store.getState().linkExisting({ anchorId: id(1), relation: 'father', personId: id(2), unnamedParentName: UNNAMED })
    expect(store.getState().past).toHaveLength(steps + 1)
    expect(renderEnglish(store.getState().past.at(-1)!.label)).toBe('Link Karl')
    store.getState().undo()
    expect(doc(store)).toEqual(before)
  })

  it('a refused linkExisting adds no step', () => {
    const store = storeWith('Ben')
    const steps = store.getState().past.length
    expect(() =>
      store.getState().linkExisting({ anchorId: id(1), relation: 'father', personId: id(1), unnamedParentName: UNNAMED }),
    ).toThrow()
    expect(store.getState().past).toHaveLength(steps)
  })

  it('removeParentLink, removePartnership, setParentLinkKind and updatePartnership are each one Undo step', () => {
    const store = storeWith('Ben', 'Karl', 'Maria')
    const s = () => store.getState()
    s().addParentLink(id(1), id(2))
    s().addPartnership({ id: id(100), personIds: [id(2), id(3)], status: 'current' })
    const cases: [string, () => void, string][] = [
      ['setParentLinkKind', () => s().setParentLinkKind(id(1), id(2), 'step'), 'Edit link between Ben and Karl'],
      ['updatePartnership', () => s().updatePartnership(id(100), { status: 'ended' }), 'Edit link between Karl and Maria'],
      ['removePartnership', () => s().removePartnership(id(100)), 'Remove link between Karl and Maria'],
      ['removeParentLink', () => s().removeParentLink(id(1), id(2)), 'Remove link between Ben and Karl'],
    ]
    for (const [name, act, label] of cases) {
      const before = doc(store)
      const steps = s().past.length
      act()
      expect(s().past, name).toHaveLength(steps + 1)
      expect(renderEnglish(s().past.at(-1)!.label), name).toBe(label)
      expect(doc(store), name).not.toEqual(before)
      s().undo()
      expect(doc(store), name).toEqual(before)
      act()
    }
  })

  it('removing a link never deletes a Person', () => {
    const store = storeWith('Ben', 'Karl', 'Maria')
    const s = () => store.getState()
    s().addParentLink(id(1), id(2))
    s().addPartnership({ id: id(100), personIds: [id(2), id(3)], status: 'current' })
    s().removeParentLink(id(1), id(2))
    s().removePartnership(id(100))
    expect(s().persons).toHaveLength(3)
  })
})
