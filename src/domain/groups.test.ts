import { describe, expect, it } from 'vitest'
import { relativesOf } from './groups.ts'
import type { Tree } from './schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const names = (people: { firstName: string }[]) => people.map((p) => p.firstName)

function family(): Tree {
  // Karl + Maria: Ben, Anna. Karl + Eva: Max (half-brother of Ben and Anna). Ben + Lea: Leo.
  let tree = ['Ben', 'Anna', 'Karl', 'Maria', 'Max', 'Eva', 'Lea', 'Leo'].reduce(
    (t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }),
    emptyTree(),
  )
  for (const [child, parent] of [
    [1, 3], [1, 4], [2, 3], [2, 4], [5, 3], [5, 6], [8, 1], [8, 7],
  ] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(3), id(4)], status: 'current' })
  return addPartnership(tree, { personIds: [id(1), id(7)], status: 'ended' })
}

describe('relativesOf', () => {
  const tree = family()

  it('lists parents, partners with their status, and children', () => {
    const ben = relativesOf(tree, id(1))
    expect(names(ben.parents)).toEqual(['Karl', 'Maria'])
    expect(ben.partners.map((p) => [p.person.firstName, p.status])).toEqual([['Lea', 'ended']])
    expect(names(ben.children)).toEqual(['Leo'])
  })

  it('marks a sibling who shares only one parent as a half-sibling', () => {
    const ben = relativesOf(tree, id(1))
    expect(ben.siblings.map((s) => [s.person.firstName, s.half])).toEqual([
      ['Anna', false],
      ['Max', true],
    ])
  })

  it('a Person without links has no relatives', () => {
    const alone = relativesOf(addPerson(emptyTree(), { id: id(1), firstName: 'Solo' }), id(1))
    expect(alone).toEqual({ parents: [], partners: [], siblings: [], children: [], stepParents: [], stepChildren: [] })
  })

  it('does not count step parents as parents or siblings', () => {
    let t = ['A', 'B', 'C'].reduce((acc, firstName, i) => addPerson(acc, { id: id(i + 1), firstName }), emptyTree())
    t = addParentLink(t, id(1), id(3), 'step')
    t = addParentLink(t, id(2), id(3), 'step')
    const a = relativesOf(t, id(1))
    expect([a.parents, a.partners, a.siblings, a.children]).toEqual([[], [], [], []])
    expect(names(a.stepParents)).toEqual(['C'])
  })

  it('lists step parents and step children apart, so they are not siblings or blood relatives', () => {
    let withStep = addPerson(addPerson(emptyTree(), { id: id(1), firstName: 'Ben' }), { id: id(2), firstName: 'Karl' })
    withStep = addParentLink(withStep, id(1), id(2), 'step')
    const ben = relativesOf(withStep, id(1))
    expect(names(ben.parents)).toEqual([])
    expect(names(ben.stepParents)).toEqual(['Karl'])
    expect(names(relativesOf(withStep, id(2)).stepChildren)).toEqual(['Ben'])
  })
})
