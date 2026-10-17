import { describe, expect, it, vi } from 'vitest'
import { renderEnglish } from '../i18n/testing.ts'
import { UNNAMED_PARENT, addRelative, previewFor as previewRefs, questionFor } from './addRelative.ts'
import { IntegrityError } from './integrity.ts'
import { deriveRelationships } from './labels.ts'
import type { Tree } from './schema.ts'
import { createTreeStore } from './store.ts'
import { addParentLink, addPartnership, addPerson, emptyTree, updatePerson } from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const person = (tree: Tree, firstName: string) => tree.persons.find((p) => p.firstName === firstName)!
const parentsOf = (tree: Tree, childId: string) =>
  tree.parentLinks.filter((l) => l.childId === childId).map((l) => tree.persons.find((p) => p.id === l.parentId)!.firstName)

function withPeople(...names: string[]): Tree {
  return names.reduce((tree, firstName, i) => addPerson(tree, { id: id(i + 1), firstName }), emptyTree())
}

/** Ben has birth parents Karl and Maria. */
function benWithTwoParents(): Tree {
  let tree = withPeople('Ben', 'Karl', 'Maria')
  tree = addParentLink(tree, id(1), id(2))
  return addParentLink(tree, id(1), id(3))
}

describe('adding a parent', () => {
  it('asks nothing when the Person has no parents, and presets the gender', () => {
    const tree = withPeople('Ben')
    expect(questionFor(tree, id(1), 'father')).toEqual({ kind: 'none' })
    const result = addRelative(tree, { anchorId: id(1), relation: 'father', person: { firstName: 'Karl' } })
    expect(person(result.tree, 'Karl').gender).toBe('male')
    expect(parentsOf(result.tree, id(1))).toEqual(['Karl'])
    expect(result.tree.partnerships).toHaveLength(0)
  })

  it('with one parent, asks about the partnership and defaults to a current one', () => {
    const base = addRelative(withPeople('Ben'), { anchorId: id(1), relation: 'father', person: { firstName: 'Karl' } }).tree
    const question = questionFor(base, id(1), 'mother')
    expect(question.kind).toBe('parent-partnership')
    const result = addRelative(base, { anchorId: id(1), relation: 'mother', person: { firstName: 'Maria' } })
    expect(parentsOf(result.tree, id(1)).sort()).toEqual(['Karl', 'Maria'])
    expect(result.tree.partnerships).toHaveLength(1)
    expect(result.tree.partnerships[0]!.status).toBe('current')
  })

  it.each([
    ['ended', 1, 'ended'],
    ['none', 0, undefined],
  ] as const)('the answer "%s" sets the partnership accordingly', (answer, count, status) => {
    const base = addRelative(withPeople('Ben'), { anchorId: id(1), relation: 'father', person: { firstName: 'Karl' } }).tree
    const result = addRelative(base, {
      anchorId: id(1),
      relation: 'mother',
      person: { firstName: 'Maria' },
      answers: { parentPartnership: answer },
    })
    expect(result.tree.partnerships).toHaveLength(count)
    expect(result.tree.partnerships[0]?.status).toBe(status)
  })

  it('blocks a third birth parent with a message, and the action changes nothing', () => {
    const tree = benWithTwoParents()
    const question = questionFor(tree, id(1), 'father')
    expect(question.kind).toBe('blocked')
    expect(question.kind === 'blocked' && renderEnglish(question.message)).toContain('two birth parents')
    expect(() => addRelative(tree, { anchorId: id(1), relation: 'father', person: { firstName: 'Third' } })).toThrow(
      IntegrityError,
    )
  })
})

describe('adding a sibling', () => {
  it('with two parents asks which are shared; both is the default', () => {
    const tree = benWithTwoParents()
    expect(questionFor(tree, id(1), 'sister').kind).toBe('sibling-parents')
    const result = addRelative(tree, { anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })
    expect(parentsOf(result.tree, person(result.tree, 'Anna').id).sort()).toEqual(['Karl', 'Maria'])
    expect(person(result.tree, 'Anna').gender).toBe('female')
  })

  it('with two parents can share only one: a half-sibling', () => {
    const tree = benWithTwoParents()
    const result = addRelative(tree, {
      anchorId: id(1),
      relation: 'brother',
      person: { firstName: 'Max' },
      answers: { siblingParents: id(2) },
    })
    expect(parentsOf(result.tree, person(result.tree, 'Max').id)).toEqual(['Karl'])
    const labels = deriveRelationships({ ...result.tree, focusPersonId: id(1) })
    expect(labels.get(person(result.tree, 'Max').id)!.label).toBe('half-brother')
  })

  it('rejects "only this parent" for someone who is not a parent', () => {
    const tree = addPerson(benWithTwoParents(), { id: id(9), firstName: 'Stranger' })
    expect(() =>
      addRelative(tree, { anchorId: id(1), relation: 'brother', person: { firstName: 'Max' }, answers: { siblingParents: id(9) } }),
    ).toThrow()
  })

  it('with one parent attaches silently', () => {
    let tree = withPeople('Ben', 'Karl')
    tree = addParentLink(tree, id(1), id(2))
    expect(questionFor(tree, id(1), 'sister')).toEqual({ kind: 'none' })
    const result = addRelative(tree, { anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })
    expect(parentsOf(result.tree, person(result.tree, 'Anna').id)).toEqual(['Karl'])
    expect(result.tree.persons).toHaveLength(3)
  })

  it('with no parents creates an unnamed shared parent, who can be renamed', () => {
    const tree = withPeople('Ben')
    expect(questionFor(tree, id(1), 'sister')).toEqual({ kind: 'none' })
    const result = addRelative(tree, { anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })
    const parent = person(result.tree, UNNAMED_PARENT)
    expect(parentsOf(result.tree, id(1))).toEqual([UNNAMED_PARENT])
    expect(parentsOf(result.tree, person(result.tree, 'Anna').id)).toEqual([UNNAMED_PARENT])
    expect(updatePerson(result.tree, parent.id, { firstName: 'Karl' }).persons).toHaveLength(3)
  })
})

describe('adding a child', () => {
  it('without partners is a single-parent child and asks nothing', () => {
    const tree = withPeople('Ben')
    expect(questionFor(tree, id(1), 'son')).toEqual({ kind: 'none' })
    const result = addRelative(tree, { anchorId: id(1), relation: 'son', person: { firstName: 'Leo' } })
    expect(parentsOf(result.tree, person(result.tree, 'Leo').id)).toEqual(['Ben'])
    expect(person(result.tree, 'Leo').gender).toBe('male')
  })

  it('with partners asks for the other parent, defaulting to the latest current partner', () => {
    let tree = withPeople('Ben', 'Old', 'Mid', 'New')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'ended' })
    tree = addPartnership(tree, { personIds: [id(1), id(3)], status: 'current' })
    tree = addPartnership(tree, { personIds: [id(1), id(4)], status: 'current' })
    const question = questionFor(tree, id(1), 'child')
    expect(question.kind === 'child-other-parent' && question.defaultParentId).toBe(id(4))
    expect(question.kind === 'child-other-parent' && question.partners).toHaveLength(3)
    const result = addRelative(tree, { anchorId: id(1), relation: 'child', person: { firstName: 'Kid' } })
    expect(parentsOf(result.tree, person(result.tree, 'Kid').id).sort()).toEqual(['Ben', 'New'])
  })

  it('defaults to nobody when every partnership has ended', () => {
    let tree = withPeople('Ben', 'Old')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'ended' })
    const question = questionFor(tree, id(1), 'child')
    expect(question.kind === 'child-other-parent' && question.defaultParentId).toBeNull()
  })

  it('"Nobody / not recorded" and an explicit other parent are both possible', () => {
    let tree = withPeople('Ben', 'Eva')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
    const alone = addRelative(tree, {
      anchorId: id(1),
      relation: 'daughter',
      person: { firstName: 'Mia' },
      answers: { otherParentId: null },
    })
    expect(parentsOf(alone.tree, person(alone.tree, 'Mia').id)).toEqual(['Ben'])
    const both = addRelative(tree, {
      anchorId: id(1),
      relation: 'daughter',
      person: { firstName: 'Mia' },
      answers: { otherParentId: id(2) },
    })
    expect(parentsOf(both.tree, person(both.tree, 'Mia').id).sort()).toEqual(['Ben', 'Eva'])
  })

  it('cannot name the Person themselves as the other parent', () => {
    expect(() =>
      addRelative(withPeople('Ben'), {
        anchorId: id(1),
        relation: 'child',
        person: { firstName: 'Kid' },
        answers: { otherParentId: id(1) },
      }),
    ).toThrow()
  })
})

describe('adding a partner', () => {
  it('always asks current or ended, defaulting to current', () => {
    const tree = withPeople('Ben')
    expect(questionFor(tree, id(1), 'wife')).toEqual({ kind: 'partner-status' })
    const current = addRelative(tree, { anchorId: id(1), relation: 'wife', person: { firstName: 'Eva' } })
    expect(current.tree.partnerships[0]!.status).toBe('current')
    expect(person(current.tree, 'Eva').gender).toBe('female')
    const ended = addRelative(tree, {
      anchorId: id(1),
      relation: 'partner',
      person: { firstName: 'Sam' },
      answers: { partnerStatus: 'ended' },
    })
    expect(ended.tree.partnerships[0]!.status).toBe('ended')
    expect(person(ended.tree, 'Sam').gender).toBe('unknown')
  })

  it('a chosen gender overrides the preset', () => {
    const result = addRelative(withPeople('Ben'), {
      anchorId: id(1),
      relation: 'husband',
      person: { firstName: 'Alex', gender: 'other' },
    })
    expect(person(result.tree, 'Alex').gender).toBe('other')
  })
})

describe('as one store action', () => {
  it('is a single update with every Person, link and Partnership in it', () => {
    const store = createTreeStore(benWithTwoParents())
    const listener = vi.fn()
    store.subscribe(listener)
    const newId = store.getState().addRelative({
      anchorId: id(1),
      relation: 'brother',
      person: { firstName: 'Max' },
      answers: { siblingParents: id(2) },
    })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().persons.some((p) => p.id === newId)).toBe(true)
  })

  it('a flow that creates a parent, links and a partnership is still one update', () => {
    const store = createTreeStore(addRelative(withPeople('Ben'), { anchorId: id(1), relation: 'father', person: { firstName: 'Karl' } }).tree)
    const listener = vi.fn()
    store.subscribe(listener)
    store.getState().addRelative({ anchorId: id(1), relation: 'mother', person: { firstName: 'Maria' } })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(store.getState().partnerships).toHaveLength(1)
  })

  it('a refused flow leaves the store exactly as it was', () => {
    const store = createTreeStore(benWithTwoParents())
    const before = store.getState().persons
    const listener = vi.fn()
    store.subscribe(listener)
    expect(() =>
      store.getState().addRelative({ anchorId: id(1), relation: 'mother', person: { firstName: 'Third' } }),
    ).toThrow(IntegrityError)
    expect(listener).not.toHaveBeenCalled()
    expect(store.getState().persons).toBe(before)
  })
})

/** What the user reads: the lines of the preview, in English. */
const previewFor = (...args: Parameters<typeof previewRefs>) => previewRefs(...args).map(renderEnglish)

describe('previewFor', () => {
  it('words what will be created', () => {
    const tree = benWithTwoParents()
    expect(previewFor(tree, { anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' } })).toEqual([
      'Anna, sister of Ben',
      'Same parents: Karl and Maria',
    ])
    expect(
      previewFor(tree, { anchorId: id(1), relation: 'sister', person: { firstName: 'Anna' }, answers: { siblingParents: id(2) } }),
    ).toEqual(['Anna, sister of Ben', 'Half-sibling: shares only Karl as parent'])
    expect(previewFor(withPeople('Ben'), { anchorId: id(1), relation: 'brother', person: { firstName: 'Max' } })[1]).toContain(
      UNNAMED_PARENT,
    )
    expect(
      previewFor(withPeople('Ben'), { anchorId: id(1), relation: 'wife', person: { firstName: 'Eva' }, answers: { partnerStatus: 'ended' } }),
    ).toEqual(['Eva, wife of Ben', 'An ended partnership'])
  })

  it('names the other parent of a child and uses a placeholder before a name is typed', () => {
    let tree = withPeople('Ben', 'Eva')
    tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
    expect(previewFor(tree, { anchorId: id(1), relation: 'son', person: { firstName: '' } })).toEqual([
      'The new person, son of Ben and Eva',
    ])
  })
})
