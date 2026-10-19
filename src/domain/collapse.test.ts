import { describe, expect, it } from 'vitest'
import { allGroupKeys, branchGroups, branchSize, hiddenBy, revealPersons } from './collapse.ts'
import type { ParentLinkKind, Tree } from './schema.ts'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Spec {
  people: string[]
  parents?: [string, string, ParentLinkKind?][]
  partners?: [string, string][]
}

function build(spec: Spec) {
  const ids = Object.fromEntries(spec.people.map((name, i) => [name, uuid(i + 1)])) as Record<string, string>
  const tree: Tree = {
    focusPersonId: ids[spec.people[0]!]!,
    persons: spec.people.map((name) => ({ id: ids[name]!, firstName: name, gender: 'unknown' as const, deceased: false })),
    parentLinks: (spec.parents ?? []).map(([c, p, kind = 'birth']) => ({ childId: ids[c]!, parentId: ids[p]!, kind })),
    partnerships: (spec.partners ?? []).map(([a, b], i) => ({
      id: uuid(1000 + i),
      personIds: [ids[a]!, ids[b]!] as [string, string],
      status: 'current' as const,
    })),
  }
  const key = (...names: string[]) => names.map((n) => ids[n]!).sort().join('|')
  const named = (set: ReadonlySet<string>) => spec.people.filter((n) => set.has(ids[n]!))
  return { tree, ids, key, named }
}

/** Gran + Gramps: Ann, Bob. Ann + Ed (marries in): Cy, Di. Cy + Flo (marries in): Gus. Bob + Hal: Ivy. */
const family: Spec = {
  people: ['Gran', 'Gramps', 'Ann', 'Bob', 'Ed', 'Hal', 'Cy', 'Di', 'Flo', 'Gus', 'Ivy'],
  parents: [
    ['Ann', 'Gran'], ['Ann', 'Gramps'], ['Bob', 'Gran'], ['Bob', 'Gramps'],
    ['Cy', 'Ann'], ['Cy', 'Ed'], ['Di', 'Ann'], ['Di', 'Ed'],
    ['Gus', 'Cy'], ['Gus', 'Flo'], ['Ivy', 'Bob'], ['Ivy', 'Hal'],
  ],
  partners: [['Gran', 'Gramps'], ['Ann', 'Ed'], ['Cy', 'Flo'], ['Bob', 'Hal']],
}

describe('branchGroups', () => {
  it('groups children by the parents they share', () => {
    const { tree, key } = build(family)
    const groups = branchGroups(tree)
    expect(groups.map((g) => g.key)).toEqual([key('Gran', 'Gramps'), key('Ann', 'Ed'), key('Cy', 'Flo'), key('Bob', 'Hal')])
    expect(groups[0]!.children).toHaveLength(2)
  })

  it('makes half-siblings different groups, and a single parent a group of one parent', () => {
    const { tree, key, ids } = build({
      people: ['Mia', 'Dad', 'Mum', 'Step', 'A', 'B', 'C'],
      parents: [['A', 'Mia'], ['B', 'Mia'], ['B', 'Dad'], ['C', 'Mum'], ['C', 'Dad', 'step']],
    })
    const groups = branchGroups(tree)
    expect(groups.map((g) => g.key)).toEqual([key('Mia'), key('Mia', 'Dad'), key('Mum')])
    // a step link does not make a group of its own, nor change C's parents
    expect(groups.find((g) => g.key === key('Mum'))!.children).toEqual([ids.C])
  })
})

describe('hiddenBy', () => {
  it('hides nothing when nothing is collapsed', () => {
    expect(hiddenBy(build(family).tree, new Set()).size).toBe(0)
  })

  it('hides the children of a group and everyone below them, with the partners who married in', () => {
    const { tree, key, named } = build(family)
    expect(named(hiddenBy(tree, new Set([key('Gran', 'Gramps')])))).toEqual(['Ann', 'Bob', 'Ed', 'Hal', 'Cy', 'Di', 'Flo', 'Gus', 'Ivy'])
  })

  it('keeps the parents of a collapsed group, and their partner', () => {
    const { tree, key, named } = build(family)
    const hidden = hiddenBy(tree, new Set([key('Ann', 'Ed')]))
    expect(named(hidden)).toEqual(['Cy', 'Di', 'Flo', 'Gus'])
    expect(hidden.has(build(family).ids.Ann)).toBe(false)
  })

  it('collapsing one family leaves a half-sibling family alone', () => {
    const { tree, key, named } = build({
      people: ['Mia', 'Dad', 'Mum', 'A', 'B', 'C'],
      parents: [['A', 'Mia'], ['A', 'Dad'], ['B', 'Mia'], ['B', 'Mum'], ['C', 'A']],
      partners: [['Mia', 'Dad']],
    })
    expect(named(hiddenBy(tree, new Set([key('Mia', 'Dad')])))).toEqual(['A', 'C'])
    expect(named(hiddenBy(tree, new Set([key('Mia', 'Mum')])))).toEqual(['B'])
  })

  it('keeps a child whose other parent is still shown', () => {
    // Zed is a child of Cy (below a collapsed group) and Pia (a root): Pia keeps Zed on the chart
    const { tree, key, named } = build({
      people: ['Top', 'Cy', 'Pia', 'Zed'],
      parents: [['Cy', 'Top'], ['Zed', 'Cy'], ['Zed', 'Pia']],
    })
    expect(named(hiddenBy(tree, new Set([key('Top')])))).toEqual(['Cy'])
  })

  it('hides a married-in partner with no parents only when their partner is hidden', () => {
    const { tree, key, named } = build({
      people: ['Top', 'Kid', 'Spouse', 'Lone'],
      parents: [['Kid', 'Top']],
      partners: [['Kid', 'Spouse']],
    })
    expect(named(hiddenBy(tree, new Set([key('Top')])))).toEqual(['Kid', 'Spouse'])
    // someone with no partner and no parents is a root of their own part of the Tree: never hidden
    expect(named(hiddenBy(tree, new Set([key('Top')])))).not.toContain('Lone')
  })

  it('does not hide a married-in partner who still has a visible child elsewhere', () => {
    const { tree, key, named } = build({
      people: ['Top', 'Kid', 'Spouse', 'Other'],
      parents: [['Kid', 'Top'], ['Other', 'Spouse']],
      partners: [['Kid', 'Spouse']],
    })
    expect(named(hiddenBy(tree, new Set([key('Top')])))).toEqual(['Kid'])
  })

  it('works across two disconnected parts', () => {
    const { tree, key, named } = build({
      people: ['A1', 'A2', 'B1', 'B2'],
      parents: [['A2', 'A1'], ['B2', 'B1']],
    })
    expect(named(hiddenBy(tree, new Set([key('A1')])))).toEqual(['A2'])
  })

  it('collapsing a group above the Focus person hides the Focus person too', () => {
    const { tree, key, ids } = build({ people: ['Me', 'Dad', 'Gran'], parents: [['Dad', 'Gran'], ['Me', 'Dad']] })
    expect(hiddenBy(tree, new Set([key('Gran')])).has(ids.Me)).toBe(true)
  })
})

describe('branchSize and allGroupKeys', () => {
  it('counts how many people one group hides', () => {
    const { tree, key } = build(family)
    expect(branchSize(tree, key('Ann', 'Ed'))).toBe(4)
    expect(branchSize(tree, key('Bob', 'Hal'))).toBe(1)
  })

  it('collapsing everything leaves only the top parents', () => {
    const { tree, named } = build(family)
    expect(named(hiddenBy(tree, allGroupKeys(tree)))).toEqual(['Ann', 'Bob', 'Ed', 'Hal', 'Cy', 'Di', 'Flo', 'Gus', 'Ivy'])
  })
})

describe('revealPersons', () => {
  it('opens the way to a hidden Person and leaves other branches collapsed', () => {
    const { tree, key, ids, named } = build(family)
    const collapsed = new Set([key('Gran', 'Gramps'), key('Bob', 'Hal')])
    const next = revealPersons(tree, collapsed, [ids.Gus!])
    expect(next.has(key('Gran', 'Gramps'))).toBe(false)
    expect(next.has(key('Bob', 'Hal'))).toBe(true)
    expect(named(hiddenBy(tree, next))).toEqual(['Ivy'])
  })

  it('returns the same set when the Person is not hidden', () => {
    const { tree, key, ids } = build(family)
    const collapsed = new Set([key('Bob', 'Hal')])
    expect(revealPersons(tree, collapsed, [ids.Gus!])).toBe(collapsed)
  })

  it('reveals a married-in partner by opening what hides their partner', () => {
    const { tree, key, ids } = build(family)
    const next = revealPersons(tree, new Set([key('Gran', 'Gramps')]), [ids.Flo!])
    expect(hiddenBy(tree, next).has(ids.Flo!)).toBe(false)
  })
})
