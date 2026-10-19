import { describe, expect, it } from 'vitest'
import { kinOf } from './kin.ts'

const link = (childId: string, parentId: string, kind: 'birth' | 'adoptive' | 'step' = 'birth') => ({ childId, parentId, kind })

describe('kinOf', () => {
  const tree = {
    parentLinks: [link('c', 'b'), link('b', 'a'), link('d', 'b'), link('e', 'c'), link('c', 'x', 'step'), link('f', 'a', 'adoptive')],
    partnerships: [
      { id: 'p1', personIds: ['b', 'q'] as [string, string], status: 'current' as const },
      { id: 'p2', personIds: ['z', 'b'] as [string, string], status: 'ended' as const },
    ],
  }

  it('finds every ancestor and descendant, however far', () => {
    const kin = kinOf(tree, 'c')
    expect([...kin.ancestors].sort()).toEqual(['a', 'b'])
    expect([...kin.descendants]).toEqual(['e'])
  })

  it('leaves out step parents, and counts adoptive links', () => {
    expect(kinOf(tree, 'c').ancestors.has('x')).toBe(false)
    expect([...kinOf(tree, 'a').descendants].sort()).toEqual(['b', 'c', 'd', 'e', 'f'])
  })

  it('finds current and former partners on either side of the link', () => {
    expect([...kinOf(tree, 'b').partners].sort()).toEqual(['q', 'z'])
    expect([...kinOf(tree, 'z').partners]).toEqual(['b'])
  })

  it('is empty for someone with no links', () => {
    const kin = kinOf(tree, 'nobody')
    expect(kin.ancestors.size + kin.descendants.size + kin.partners.size).toBe(0)
  })
})
