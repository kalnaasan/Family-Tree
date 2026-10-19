import { describe, expect, it } from 'vitest'
import { branchGroups, branchSize } from '../domain/collapse.ts'
import type { Tree } from '../domain/schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from '../domain/tree.ts'
import { layoutTree } from '../layout/layoutTree.ts'
import { type GroupInfo, buildChartScene, selectVisibleChart } from './chartScene.ts'
import { CARD_PITCH, ROW_STEP } from './geometry.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/** Karl (1) + Maria (2): Ben (3) and Anna (4). Ben + Eva (5): Leo (6). */
function family(): Tree {
  let tree = ['Karl', 'Maria', 'Ben', 'Anna', 'Eva', 'Leo'].reduce((t, firstName, i) => addPerson(t, { id: id(i + 1), firstName }), emptyTree())
  for (const [c, p] of [[3, 1], [3, 2], [4, 1], [4, 2], [6, 3], [6, 5]] as const) tree = addParentLink(tree, id(c), id(p))
  tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
  return addPartnership(tree, { personIds: [id(3), id(5)], status: 'ended' })
}

const infos = (tree: Tree, collapsed: string[] = []): GroupInfo[] =>
  branchGroups(tree).map((g) => ({ ...g, collapsed: collapsed.includes(g.key), hiddenCount: collapsed.includes(g.key) ? branchSize(tree, g.key) : 0 }))

const layoutOf = (tree: Tree) => layoutTree(tree, { shape: 'rows', gapX: CARD_PITCH, rowStep: ROW_STEP })

describe('buildChartScene', () => {
  it('makes one connector group for each family, with a button at the middle of a couple', () => {
    const tree = family()
    const layout = layoutOf(tree)
    const scene = buildChartScene(layout, infos(tree))
    expect(scene.groups).toHaveLength(2)
    const karl = scene.groups.find((g) => g.parents.includes(layout.ids.indexOf(id(1))))!
    const middle = (layout.x[layout.ids.indexOf(id(1))]! + layout.x[layout.ids.indexOf(id(2))]!) / 2
    expect(karl.chip.x).toBeCloseTo(middle, 0)
    expect(karl.solid).toContain('M')
    expect(karl.collapsed).toBe(false)
    expect(scene.partnerPaths).toHaveLength(2)
  })

  it('draws a collapsed family as a button on a short stem, with no bus to its children', () => {
    const tree = family()
    const key = branchGroups(tree)[0]!.key
    const layout = layoutOf({ ...tree, persons: tree.persons.filter((p) => ![id(3), id(4), id(5), id(6)].includes(p.id)), parentLinks: [], partnerships: [tree.partnerships[0]!] })
    const scene = buildChartScene(layout, infos(tree, [key]))
    const group = scene.groups.find((g) => g.key === key)!
    expect(group.collapsed).toBe(true)
    expect(group.shownChildren).toBe(0)
    expect(group.hiddenCount).toBe(4)
    expect(group.dashed).toBe('')
  })

  it('skips a family whose parents are not on the chart', () => {
    const tree = family()
    const layout = layoutOf({ ...tree, persons: tree.persons.filter((p) => p.id === id(6)), parentLinks: [], partnerships: [] })
    expect(buildChartScene(layout, infos(tree)).groups).toHaveLength(0)
  })

  it('draws an adoptive link dashed and a step link as its own elbow', () => {
    let tree = family()
    tree = addPerson(tree, { id: id(7), firstName: 'Ada' })
    tree = addParentLink(tree, id(7), id(4), 'adoptive')
    tree = addParentLink(tree, id(7), id(1), 'step')
    const scene = buildChartScene(layoutOf(tree), infos(tree))
    expect(scene.groups.some((g) => g.dashed.length > 0)).toBe(true)
    expect(scene.steps).toHaveLength(1)
  })
})

describe('selectVisibleChart', () => {
  it('returns only what is near the rectangle', () => {
    const tree = family()
    const layout = layoutOf(tree)
    const scene = buildChartScene(layout, infos(tree))
    const all = selectVisibleChart(scene, layout.bounds)
    expect(all.persons).toHaveLength(6)
    expect(all.groups).toHaveLength(2)
    const nowhere = selectVisibleChart(scene, { x0: 99999, y0: 99999, x1: 100000, y1: 100000 })
    expect(nowhere.persons).toHaveLength(0)
    expect(nowhere.groups).toHaveLength(0)
  })
})
