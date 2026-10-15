import { describe, expect, it } from 'vitest'
import { assertTreeIntegrity } from '../domain/integrity.ts'
import { createRandom, generateTree } from './fixtures.ts'

describe('generateTree', () => {
  it.each([1, 2, 15, 150, 500, 1000, 5000])('makes a valid Tree of exactly %i people', (size) => {
    const tree = generateTree(size, 11)
    expect(tree.persons).toHaveLength(size)
    expect(() => assertTreeIntegrity(tree)).not.toThrow()
    expect(tree.persons.some((p) => p.id === tree.focusPersonId)).toBe(true)
  })

  it('is the same for the same seed and different for another', () => {
    const a = JSON.stringify(generateTree(300, 5))
    expect(JSON.stringify(generateTree(300, 5))).toBe(a)
    expect(JSON.stringify(generateTree(300, 6))).not.toBe(a)
  })

  it('has families: partners, ended partnerships, half-siblings, single parents, several generations', () => {
    const tree = generateTree(500, 3)
    expect(tree.partnerships.some((p) => p.status === 'ended')).toBe(true)
    expect(tree.partnerships.some((p) => p.status === 'current')).toBe(true)
    const birthParents = new Map<string, number>()
    for (const link of tree.parentLinks) birthParents.set(link.childId, (birthParents.get(link.childId) ?? 0) + 1)
    expect([...birthParents.values()].some((count) => count === 1)).toBe(true)
    expect([...birthParents.values()].some((count) => count === 2)).toBe(true)
    expect(tree.persons.some((p) => p.deceased)).toBe(true)
  })

  it('produces a deterministic random sequence from a seed', () => {
    const first = createRandom(42)
    const second = createRandom(42)
    const run = (random: () => number) => Array.from({ length: 5 }, () => random())
    expect(run(first)).toEqual(run(second))
    expect(run(createRandom(43))).not.toEqual(run(createRandom(42)))
  })
})
