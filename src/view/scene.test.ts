import { describe, expect, it } from 'vitest'
import { addParentLink, addPerson, emptyTree } from '../domain/tree.ts'
import { generateTree } from '../layout/fixtures.ts'
import { layoutTree } from '../layout/layoutTree.ts'
import { buildScene, selectVisible } from './scene.ts'

const everything = { x0: -1e9, y0: -1e9, x1: 1e9, y1: 1e9 }
const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

describe('buildScene', () => {
  it('roots are the Persons without a birth or adoptive parent', () => {
    const tree = generateTree(150, 1)
    const scene = buildScene(layoutTree(tree))
    const withParent = new Set(tree.parentLinks.filter((l) => l.kind !== 'step').map((l) => l.childId))
    const expected = tree.persons.filter((p) => !withParent.has(p.id)).map((p) => p.id)
    expect([...scene.rootIndices].map((i) => scene.layout.ids[i])).toEqual(expected)
    expect(expected.length).toBeGreaterThan(0)
  })

  it('a Person with only a step parent still grows from the trunk', () => {
    let tree = emptyTree()
    tree = addPerson(tree, { id: id(1), firstName: 'Step' })
    tree = addPerson(tree, { id: id(2), firstName: 'Child' })
    tree = addParentLink(tree, id(2), id(1), 'step')
    const scene = buildScene(layoutTree(tree))
    expect(scene.rootIndices).toHaveLength(2)
    const visible = selectVisible(scene, everything)
    expect(visible.stepBranches).toHaveLength(1)
    expect(visible.branches).toHaveLength(0)
  })

  it('caches branch outlines', () => {
    const scene = buildScene(layoutTree(generateTree(15, 1)))
    const first = scene.branchPath(0)
    expect(first.startsWith('M')).toBe(true)
    expect(first).not.toContain('NaN')
    expect(scene.branchPath(0)).toBe(first)
    expect(scene.branchPath(1)).not.toBe(first)
    expect(scene.rootBranchPath(scene.rootIndices[0]!)).toMatch(/^M.*Z$/)
  })

  it('handles an empty Tree', () => {
    const scene = buildScene(layoutTree(emptyTree()))
    expect(scene.rootIndices).toHaveLength(0)
    expect(selectVisible(scene, everything).persons).toEqual([])
  })
})

describe('selectVisible', () => {
  const tree = generateTree(500, 1)
  const scene = buildScene(layoutTree(tree))
  const { layout } = scene

  it('returns everything for a rectangle covering the whole Tree', () => {
    const visible = selectVisible(scene, everything)
    expect(visible.persons).toHaveLength(500)
    expect(visible.branches.length + visible.stepBranches.length).toBe(layout.parentEdgeKind.length)
    expect(visible.partners).toHaveLength(layout.partnerEnded.length)
    expect(visible.roots).toHaveLength(scene.rootIndices.length)
  })

  it('culls: a small rectangle returns a small part of the Tree', () => {
    const target = 250
    const x = layout.x[target]!
    const y = layout.y[target]!
    const visible = selectVisible(scene, { x0: x - 150, y0: y - 150, x1: x + 150, y1: y + 150 })
    expect(visible.persons).toContain(target)
    expect(visible.persons.length).toBeLessThan(60)
    expect(visible.branches.length).toBeLessThan(120)
  })

  it('never returns a Person who is far outside the rectangle', () => {
    const rect = { x0: -300, y0: -300, x1: 300, y1: 300 }
    for (const i of selectVisible(scene, rect).persons) {
      expect(Math.abs(layout.x[i]!)).toBeLessThan(300 + 200)
      expect(Math.abs(layout.y[i]!)).toBeLessThan(300 + 200)
    }
  })

  it('returns nothing for a rectangle far from the Tree', () => {
    const far = { x0: 1e7, y0: 1e7, x1: 1e7 + 100, y1: 1e7 + 100 }
    const visible = selectVisible(scene, far)
    expect(visible.persons).toEqual([])
    expect(visible.branches).toEqual([])
    expect(visible.partners).toEqual([])
  })
})
