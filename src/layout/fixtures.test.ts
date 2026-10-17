import { describe, expect, it } from 'vitest'
import { assertTreeIntegrity } from '../domain/integrity.ts'
import { TRICKY_ARABIC_NAMES, createRandom, generateTree } from './fixtures.ts'

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

describe('generateTree with Arabic names', () => {
  const arabic = /^[\p{Script=Arabic}\p{M} ]+$/u

  it('names everyone in Arabic, the same way for the same seed', () => {
    const tree = generateTree(200, 4, { names: 'arabic' })
    expect(tree.persons.every((p) => arabic.test(p.firstName) && p.lastName !== undefined && arabic.test(p.lastName))).toBe(true)
    expect(JSON.stringify(generateTree(200, 4, { names: 'arabic' }))).toBe(JSON.stringify(tree))
    // a real variety, not one name repeated
    expect(new Set(tree.persons.map((p) => p.firstName)).size).toBeGreaterThan(20)
  })

  it('does not change the shape of the Tree: the same people, links and partnerships as with the default names', () => {
    for (const size of [15, 150, 1000]) {
      const plain = generateTree(size, 9)
      const named = generateTree(size, 9, { names: 'arabic' })
      expect(named.focusPersonId).toBe(plain.focusPersonId)
      expect(named.parentLinks).toEqual(plain.parentLinks)
      expect(named.partnerships).toEqual(plain.partnerships)
      expect(named.persons.map(({ id, gender, deceased }) => ({ id, gender, deceased }))).toEqual(
        plain.persons.map(({ id, gender, deceased }) => ({ id, gender, deceased })),
      )
    }
  })

  it('leaves the default names alone', () => {
    expect(generateTree(5, 1).persons.map((p) => p.firstName)).toEqual(['P1', 'P2', 'P3', 'P4', 'P5'])
  })
})

describe('the tricky Arabic names', () => {
  const full = TRICKY_ARABIC_NAMES.map((n) => [n.firstName, n.lastName].filter(Boolean).join(' '))

  it('cover a plain name, a long one, a mixed-script one, one with diacritics and one that starts with the article', () => {
    expect(full.some((name) => /^[\p{Script=Arabic}]+$/u.test(name))).toBe(true)
    expect(full.some((name) => Array.from(name).length > 18)).toBe(true)
    expect(full.some((name) => /\p{Script=Arabic}/u.test(name) && /\p{Script=Latin}/u.test(name))).toBe(true)
    expect(full.some((name) => /\p{M}/u.test(name))).toBe(true)
    expect(full.some((name) => name.startsWith('ال'))).toBe(true)
  })
})
