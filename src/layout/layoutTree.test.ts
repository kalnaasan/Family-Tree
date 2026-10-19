import { describe, expect, it } from 'vitest'
import { assertTreeIntegrity } from '../domain/integrity.ts'
import type { Gender, ParentLinkKind, Tree } from '../domain/schema.ts'
import { addParentLink, addPerson } from '../domain/tree.ts'
import { generateTree } from './fixtures.ts'
import { type TreeLayout, layoutTree } from './layoutTree.ts'
import { findOverlaps } from './overlap.ts'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const NODE_DIAMETER = 64 // two default node radii

interface Spec {
  focus?: string
  people: string[]
  /** [child, parent, kind?] */
  parents?: [string, string, ParentLinkKind?][]
  /** [a, b, status?] */
  partners?: [string, string, ('current' | 'ended')?][]
}

function build(spec: Spec) {
  const ids = Object.fromEntries(spec.people.map((name, i) => [name, uuid(i + 1)])) as Record<string, string>
  const tree: Tree = {
    focusPersonId: ids[spec.focus ?? spec.people[0]!]!,
    persons: spec.people.map((name) => ({ id: ids[name]!, firstName: name, gender: 'unknown' as Gender, deceased: false })),
    parentLinks: (spec.parents ?? []).map(([c, p, kind = 'birth']) => ({ childId: ids[c]!, parentId: ids[p]!, kind })),
    partnerships: (spec.partners ?? []).map(([a, b, status = 'current'], i) => ({
      id: uuid(1000 + i),
      personIds: [ids[a]!, ids[b]!] as [string, string],
      status,
    })),
  }
  assertTreeIntegrity(tree)
  const layout = layoutTree(tree)
  const at = (name: string) => layout.ids.indexOf(ids[name]!)
  return {
    tree,
    layout,
    ids,
    at,
    generation: (name: string) => layout.generation[at(name)]!,
    radius: (name: string) => layout.radius[at(name)]!,
  }
}

/** Two root couples whose children marry, an ended partnership, a half-sibling, four generations. */
const bigFamily: Spec = {
  people: [
    'GF1', 'GM1', 'GF2', 'GM2', // root couples
    'A', 'B', 'C', 'D', // A, B children of couple 1; C, D children of couple 2
    'AD', 'BC', // extra marry-ins
    'X', 'Y', 'Z', // X: child of A+C, Y: child of B+D, Z: half-sibling of X (A + ex)
    'Ex', 'W', // ex of A; W child of X
  ],
  parents: [
    ['A', 'GF1'], ['A', 'GM1'], ['B', 'GF1'], ['B', 'GM1'],
    ['C', 'GF2'], ['C', 'GM2'], ['D', 'GF2'], ['D', 'GM2'],
    ['X', 'A'], ['X', 'C'], ['Y', 'B'], ['Y', 'D'], ['Z', 'A'], ['Z', 'Ex'],
    ['W', 'X'],
  ],
  partners: [
    ['GF1', 'GM1'], ['GF2', 'GM2'], ['A', 'C'], ['B', 'D'], ['A', 'Ex', 'ended'], ['AD', 'D'], ['BC', 'Y'],
  ],
}

describe('shape', () => {
  it('lays out an empty Tree', () => {
    const layout = layoutTree({ focusPersonId: null, persons: [], parentLinks: [], partnerships: [] })
    expect(layout.count).toBe(0)
    expect(layout.x).toHaveLength(0)
    expect(Number.isFinite(layout.bounds.x1 - layout.bounds.x0)).toBe(true)
  })

  it('puts a single Person at the top of the trunk', () => {
    const { layout } = build({ people: ['Solo'] })
    expect(layout.count).toBe(1)
    expect(layout.x[0]).toBeCloseTo(0)
    expect(layout.y[0]).toBeCloseTo(-130) // innerRadius straight up from the origin
  })

  it('puts the oldest generation innermost and each later generation on a larger ring', () => {
    const f = build({
      people: ['Dad', 'Mom', 'GF', 'Kid1', 'Kid2', 'GKid'],
      parents: [['Dad', 'GF'], ['Kid1', 'Dad'], ['Kid1', 'Mom'], ['Kid2', 'Dad'], ['Kid2', 'Mom'], ['GKid', 'Kid1']],
      partners: [['Dad', 'Mom']],
    })
    expect([f.generation('GF'), f.generation('Dad'), f.generation('Kid1'), f.generation('GKid')]).toEqual([0, 1, 2, 3])
    expect(f.radius('GF')).toBeLessThan(f.radius('Dad'))
    expect(f.radius('Dad')).toBeLessThan(f.radius('Kid1'))
    expect(f.radius('Kid1')).toBeLessThan(f.radius('GKid'))
    expect(f.radius('Kid1')).toBe(f.radius('Kid2'))
  })

  it('moves a married-in partner without parents to their partner’s generation, next to them', () => {
    const f = build({
      people: ['GF', 'Dad', 'Mom', 'Kid', 'Sis', 'Other'],
      parents: [['Dad', 'GF'], ['Sis', 'GF'], ['Kid', 'Dad'], ['Kid', 'Mom']],
      partners: [['Dad', 'Mom']],
    })
    expect(f.generation('Mom')).toBe(f.generation('Dad'))
    // partners are neighbours in the row: nothing between them
    const row = f.tree.persons
      .map((p) => f.layout.ids.indexOf(p.id))
      .filter((i) => f.layout.generation[i] === f.generation('Dad'))
      .sort((a, b) => f.layout.lineX[a]! - f.layout.lineX[b]!)
    const gap = Math.abs(row.indexOf(f.at('Dad')) - row.indexOf(f.at('Mom')))
    expect(gap).toBe(1)
  })

  it('places children between their parents', () => {
    const f = build({
      people: ['Dad', 'Mom', 'K1', 'K2', 'K3'],
      parents: [['K1', 'Dad'], ['K1', 'Mom'], ['K2', 'Dad'], ['K2', 'Mom'], ['K3', 'Dad'], ['K3', 'Mom']],
      partners: [['Dad', 'Mom']],
    })
    const mid = (f.layout.lineX[f.at('Dad')]! + f.layout.lineX[f.at('Mom')]!) / 2
    const kids = ['K1', 'K2', 'K3'].map((k) => f.layout.lineX[f.at(k)]!)
    expect(kids.reduce((a, b) => a + b, 0) / 3).toBeCloseTo(mid, 0)
  })

  it('weights each Person by 1 + descendants', () => {
    const f = build({
      people: ['Root', 'A', 'B', 'C'],
      parents: [['A', 'Root'], ['B', 'Root'], ['C', 'A']],
    })
    expect(['Root', 'A', 'B', 'C'].map((n) => f.layout.weight[f.at(n)])).toEqual([4, 2, 1, 1])
  })

  it('draws step links but does not let them shape the layout', () => {
    const f = build({ people: ['Old', 'Kid'], parents: [['Kid', 'Old', 'step']] })
    expect(f.generation('Kid')).toBe(0)
    expect([...f.layout.parentEdges]).toEqual([f.at('Kid'), f.at('Old')])
    expect([...f.layout.parentEdgeKind]).toEqual([2])
  })

  it('exports edges and the ended flag', () => {
    const f = build({
      people: ['A', 'B', 'C', 'K'],
      parents: [['K', 'A', 'adoptive']],
      partners: [['A', 'B'], ['A', 'C', 'ended']],
    })
    expect([...f.layout.partnerEdges]).toEqual([f.at('A'), f.at('B'), f.at('A'), f.at('C')])
    expect([...f.layout.partnerEnded]).toEqual([0, 1])
    expect([...f.layout.parentEdgeKind]).toEqual([1])
  })

  it('lays out two root couples, a half-sibling and an ended partnership without overlap', () => {
    const f = build(bigFamily)
    expect(findOverlaps(f.layout, NODE_DIAMETER)).toEqual([])
    expect(f.generation('GF1')).toBe(0)
    expect(f.generation('W')).toBe(f.generation('X') + 1)
    // ended partner shares the row of their former partner
    expect(f.generation('Ex')).toBe(f.generation('A'))
  })

  it('uses one ring radius per generation and spaces rings by at least the ring step', () => {
    const layout = layoutTree(generateTree(200, 4))
    const radii = new Map<number, Set<number>>()
    for (let i = 0; i < layout.count; i++) {
      const g = layout.generation[i]!
      if (!radii.has(g)) radii.set(g, new Set())
      radii.get(g)!.add(Math.round(layout.radius[i]! * 100))
    }
    for (const set of radii.values()) expect(set.size).toBe(1)
    const ordered = [...radii.keys()].sort((a, b) => a - b).map((g) => [...radii.get(g)!][0]! / 100)
    for (let k = 1; k < ordered.length; k++) expect(ordered[k]! - ordered[k - 1]!).toBeGreaterThanOrEqual(139.9)
  })

  it('returns typed arrays that survive structuredClone (Web Worker transfer)', () => {
    const layout = layoutTree(generateTree(50, 2))
    expect(layout.x).toBeInstanceOf(Float32Array)
    expect(layout.parentEdges).toBeInstanceOf(Int32Array)
    const copy = structuredClone(layout)
    expect([...copy.x]).toEqual([...layout.x])
    expect(copy.ids).toEqual(layout.ids)
  })
})

describe('robustness', () => {
  it('is deterministic', () => {
    const tree = generateTree(300, 9)
    const a = layoutTree(tree)
    const b = layoutTree(tree)
    expect([...a.x]).toEqual([...b.x])
    expect([...a.y]).toEqual([...b.y])
    expect([...a.generation]).toEqual([...b.generation])
  })

  it('ends and stays finite when a partner is also a child (rules that cannot both hold)', () => {
    const f = build({
      people: ['Parent', 'Child', 'Other'],
      parents: [['Child', 'Parent']],
      partners: [['Parent', 'Child']],
    })
    for (let i = 0; i < f.layout.count; i++) {
      expect(Number.isFinite(f.layout.x[i]!)).toBe(true)
      expect(Number.isFinite(f.layout.y[i]!)).toBe(true)
    }
    expect(f.layout.maxGeneration).toBeLessThan(5) // dense ranks: no runaway generations
  })

  it('handles a very deep line of descent without recursion limits', () => {
    const depth = 3000
    const people = Array.from({ length: depth }, (_, i) => `P${i}`)
    const parents = people.slice(1).map((name, i) => [name, people[i]!] as [string, string])
    const f = build({ people, parents })
    expect(f.layout.maxGeneration).toBe(depth - 1)
    expect(f.layout.weight[f.at('P0')]).toBe(depth)
  })

  it('keeps disconnected families apart without overlap', () => {
    const f = build({
      people: ['A1', 'A2', 'AK', 'B1', 'B2', 'BK', 'Loner'],
      parents: [['AK', 'A1'], ['AK', 'A2'], ['BK', 'B1'], ['BK', 'B2']],
      partners: [['A1', 'A2'], ['B1', 'B2']],
    })
    expect(findOverlaps(f.layout, NODE_DIAMETER)).toEqual([])
  })
})

describe('fixtures: no overlaps at any size', () => {
  it.each([15, 150, 500, 1000, 5000])('%i people', (size) => {
    for (const seed of [1, 2]) {
      const layout = layoutTree(generateTree(size, seed))
      expect(findOverlaps(layout, NODE_DIAMETER)).toEqual([])
    }
  })
})

describe('warm start', () => {
  function median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]!
  }
  /** Median distance the Persons of `before` moved in `after`. */
  function medianMove(before: TreeLayout, after: TreeLayout) {
    const where = new Map(after.ids.map((id, i) => [id, i]))
    const moves = before.ids.map((id, i) => {
      const j = where.get(id)!
      return Math.hypot(before.x[i]! - after.x[j]!, before.y[i]! - after.y[j]!)
    })
    return median(moves)
  }

  function edit(tree: Tree): Tree {
    // a new child for a Person in the middle of the Tree
    const parent = tree.persons[Math.floor(tree.persons.length / 2)]!
    let next = addPerson(tree, { id: uuid(900000), firstName: 'Newborn' })
    next = addParentLink(next, uuid(900000), parent.id)
    return next
  }

  it('moves existing Persons little after one edit, much less than a fresh layout', () => {
    const tree = generateTree(200, 3)
    const first = layoutTree(tree)
    const edited = edit(tree)
    const cold = layoutTree(edited)
    const warm = layoutTree(edited, { previous: first })
    const warmMove = medianMove(first, warm)
    const coldMove = medianMove(first, cold)
    expect(findOverlaps(warm, NODE_DIAMETER)).toEqual([])
    expect(warmMove).toBeLessThanOrEqual(coldMove)
    expect(warmMove).toBeLessThan(25) // pixels; the crown is about 4,700 px wide at this size
  })

  it('places the new Person next to their relatives', () => {
    const tree = generateTree(200, 3)
    const first = layoutTree(tree)
    const edited = edit(tree)
    const warm = layoutTree(edited, { previous: first })
    const parentIndex = warm.ids.indexOf(edited.persons[Math.floor(tree.persons.length / 2)]!.id)
    const newIndex = warm.ids.indexOf(uuid(900000))
    const distance = Math.hypot(warm.x[parentIndex]! - warm.x[newIndex]!, warm.y[parentIndex]! - warm.y[newIndex]!)
    expect(distance).toBeLessThan(1500)
  })

  it('also copes with a Person removed since the previous layout', () => {
    const tree = generateTree(100, 8)
    const first = layoutTree(tree)
    const last = tree.persons[tree.persons.length - 1]!
    const smaller: Tree = {
      ...tree,
      persons: tree.persons.slice(0, -1),
      parentLinks: tree.parentLinks.filter((l) => l.childId !== last.id && l.parentId !== last.id),
      partnerships: tree.partnerships.filter((p) => !p.personIds.includes(last.id)),
      focusPersonId: tree.focusPersonId === last.id ? tree.persons[0]!.id : tree.focusPersonId,
    }
    const warm = layoutTree(smaller, { previous: first })
    expect(warm.count).toBe(99)
    expect(findOverlaps(warm, NODE_DIAMETER)).toEqual([])
  })

  it('keeps a small family together instead of spreading it over the whole crown', () => {
    const { tree } = build({
      people: ['grandad', 'dad', 'mum', 'sophia', 'serena'],
      parents: [['dad', 'grandad'], ['sophia', 'dad'], ['sophia', 'mum'], ['serena', 'dad'], ['serena', 'mum']],
      partners: [['dad', 'mum']],
    })
    const layout = layoutTree(tree)
    const angle = (name: string) => layout.theta[layout.ids.indexOf(uuid(['grandad', 'dad', 'mum', 'sophia', 'serena'].indexOf(name) + 1))]!
    // a couple are neighbours: well under a quarter turn apart, and the family hangs symmetrically above the trunk
    expect(Math.abs(angle('dad') - angle('mum'))).toBeLessThan(Math.PI / 3)
    expect(Math.abs(angle('sophia') - angle('serena'))).toBeLessThan(Math.PI / 3)
    expect(Math.max(...layout.theta) + Math.min(...layout.theta)).toBeCloseTo(0, 5)
    expect(findOverlaps(layout, NODE_DIAMETER)).toEqual([])
  })
})

describe('the rows shape (the chart)', () => {
  const rows = (spec: Spec) => {
    const built = build(spec)
    return { ...built, layout: layoutTree(built.tree, { shape: 'rows', gapX: 190, rowStep: 150 }) }
  }

  it('puts each generation on its own straight row, one step apart, with no crown angles', () => {
    const { layout, ids, tree } = rows(bigFamily)
    expect(layout.shape).toBe('rows')
    expect(layout.theta.every((t) => t === 0)).toBe(true)
    expect(layout.radius.every((r) => r === 0)).toBe(true)
    for (let i = 0; i < layout.count; i++) expect(layout.y[i]).toBe(layout.generation[i]! * 150)
    // the same generations as the crown gives
    const crown = layoutTree(tree)
    expect([...layout.generation]).toEqual([...crown.generation])
    expect(ids.GF1).toBeDefined()
  })

  it('keeps neighbours in a row at least gapX apart, and partners next to each other', () => {
    const { layout, at } = rows(bigFamily)
    for (let g = 0; g <= layout.maxGeneration; g++) {
      const xs = [...layout.ids.keys()].filter((i) => layout.generation[i] === g).map((i) => layout.x[i]!).sort((a, b) => a - b)
      for (let k = 1; k < xs.length; k++) expect(xs[k]! - xs[k - 1]!).toBeGreaterThanOrEqual(190 - 0.01)
    }
    expect(Math.abs(layout.x[at('GF1')]! - layout.x[at('GM1')]!)).toBeCloseTo(190, 0)
  })

  it('bounds hold every Person with room for a card', () => {
    const { layout } = rows(bigFamily)
    for (let i = 0; i < layout.count; i++) {
      expect(layout.x[i]! - 82).toBeGreaterThanOrEqual(layout.bounds.x0)
      expect(layout.x[i]! + 82).toBeLessThanOrEqual(layout.bounds.x1)
      expect(layout.y[i]! + 32).toBeLessThanOrEqual(layout.bounds.y1)
    }
  })

  it('a child sits one or more rows below every parent, also for half-siblings and step links', () => {
    const { layout, tree } = rows(bigFamily)
    const row = (id: string) => layout.generation[layout.ids.indexOf(id)]!
    for (const link of tree.parentLinks) if (link.kind !== 'step') expect(row(link.childId)).toBeGreaterThan(row(link.parentId))
  })
})

describe('the rows shape with unconnected parts', () => {
  const spec: Spec = {
    people: ['Ben', 'Karl', 'Maria', 'Eva', 'Olaf', 'Pia'],
    parents: [['Ben', 'Karl'], ['Ben', 'Maria']],
    partners: [['Ben', 'Eva']],
  }

  it('sets each connected part next to the others instead of letting a loner drift away', () => {
    const { tree, ids } = build(spec)
    const layout = layoutTree(tree, { shape: 'rows', gapX: 190, rowStep: 150 })
    expect(layout.ids).toEqual(tree.persons.map((p) => p.id))
    const x = (name: string) => layout.x[layout.ids.indexOf(ids[name]!)]!
    const width = Math.max(...layout.x) - Math.min(...layout.x)
    // Karl, Maria, Ben, Eva form one part (three columns wide); Olaf and Pia follow it, one gap apart each
    expect(width).toBeLessThanOrEqual(190 * 6)
    expect(x('Olaf')).toBeGreaterThan(x('Eva'))
    expect(x('Pia') - x('Olaf')).toBeCloseTo(190, 0)
  })

  it('keeps every part on the top rows, and every edge between the right people', () => {
    const { tree, ids } = build(spec)
    const layout = layoutTree(tree, { shape: 'rows', gapX: 190, rowStep: 150 })
    const at = (name: string) => layout.ids.indexOf(ids[name]!)
    expect(layout.generation[at('Olaf')]).toBe(0)
    expect(layout.generation[at('Ben')]).toBe(1)
    expect(layout.parentEdgeKind).toHaveLength(2)
    const edges = [...layout.parentEdges]
    expect(edges.slice(0, 2)).toEqual([at('Ben'), at('Karl')])
    expect(layout.partnerEdges).toHaveLength(2)
    expect([...layout.partnerEdges].sort()).toEqual([at('Ben'), at('Eva')].sort())
    expect(layout.bounds.x1).toBeGreaterThan(Math.max(...layout.x))
  })
})
