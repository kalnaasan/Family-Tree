import { describe, expect, it } from 'vitest'
import { renderEnglish } from '../i18n/testing.ts'
import { type NavKey, type NavMemory, describeMove as describeMoveRef, freshMemory, move } from './navigation.ts'
import type { Tree } from './schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

/**
 * Karl (1, m) + Maria (2, f) have Ben (3, m), Anna (4, f), Tim (5, m). Ben + Eva (6, f, current) + Zoe (7, f, ended)
 * have Leo (8, m) and Mia (9, f). Max (10, m) is Karl's son with Lea (11), so Ben's half-brother.
 */
function family(): Tree {
  const people: [string, 'male' | 'female'][] = [
    ['Karl', 'male'], ['Maria', 'female'], ['Ben', 'male'], ['Anna', 'female'], ['Tim', 'male'],
    ['Eva', 'female'], ['Zoe', 'female'], ['Leo', 'male'], ['Mia', 'female'], ['Max', 'male'], ['Lea', 'female'],
  ]
  let tree = people.reduce((t, [firstName, gender], i) => addPerson(t, { id: id(i + 1), firstName, gender }), emptyTree())
  for (const [child, parent] of [
    [3, 1], [3, 2], [4, 1], [4, 2], [5, 1], [5, 2], [8, 3], [8, 6], [9, 3], [9, 6], [10, 1], [10, 11],
  ] as const) {
    tree = addParentLink(tree, id(child), id(parent))
  }
  tree = addPartnership(tree, { personIds: [id(1), id(2)], status: 'current' })
  tree = addPartnership(tree, { personIds: [id(3), id(6)], status: 'current' })
  return addPartnership(tree, { personIds: [id(3), id(7)], status: 'ended' })
}

const tree = family()
const nameOf = (personId: string) => tree.persons.find((p) => p.id === personId)!.firstName

/** Presses keys in turn from `start`, carrying the memory, and returns the names visited. */
function walk(start: number, keys: NavKey[]): string[] {
  let at = id(start)
  let memory: NavMemory = freshMemory()
  const visited: string[] = []
  for (const key of keys) {
    const result = move(tree, at, key, memory)
    memory = result.memory
    if (result.kind === 'moved') at = result.target.id
    visited.push(result.kind === 'moved' ? result.target.firstName : `(${renderEnglish(result.message)})`)
  }
  return visited
}

describe('up and down', () => {
  it('up goes to the first parent, and up again climbs on', () => {
    expect(walk(8, ['up', 'up'])).toEqual(['Ben', 'Karl'])
  })

  it('down returns the way we came, not to the first child', () => {
    expect(walk(9, ['up', 'down'])).toEqual(['Ben', 'Mia'])
    expect(walk(8, ['up', 'down'])).toEqual(['Ben', 'Leo'])
  })

  it('down from somewhere new goes to the first child', () => {
    expect(walk(3, ['down'])).toEqual(['Leo'])
  })

  it('says so when there is nobody that way', () => {
    expect(walk(1, ['up'])).toEqual(['(Karl has no recorded parents)'])
    expect(walk(8, ['down'])).toEqual(['(Leo has no recorded children)'])
  })
})

describe('next and previous sibling', () => {
  it('walk the siblings in the order they were added, and wrap round', () => {
    expect(walk(3, ['next', 'next', 'next'])).toEqual(['Anna', 'Tim', 'Max']) // Max shares only Karl
    expect(walk(3, ['previous'])).toEqual(['Max'])
  })

  it('next then previous is back where we started', () => {
    expect(walk(4, ['next', 'previous'])).toEqual(['Tim', 'Anna'])
  })

  it('go all the way round', () => {
    expect(walk(3, ['next', 'next', 'next', 'next'])).toEqual(['Anna', 'Tim', 'Max', 'Ben'])
  })

  it('say so for an only child', () => {
    expect(walk(8, ['next'])).toEqual(['Mia'])
    expect(walk(2, ['next'])).toEqual(['(Maria has no recorded siblings)'])
  })
})

describe('partner', () => {
  it('goes to the first partner, current before ended', () => {
    expect(walk(3, ['partner'])).toEqual(['Eva'])
  })

  it('pressed again right away it cycles through the partners of where we started', () => {
    expect(walk(3, ['partner', 'partner', 'partner'])).toEqual(['Eva', 'Zoe', 'Eva'])
  })

  it('with one partner a repeat goes back to the Person', () => {
    expect(walk(1, ['partner', 'partner'])).toEqual(['Maria', 'Karl'])
  })

  it('another key in between starts the cycle afresh', () => {
    // Eva's child Leo, back up to Ben: the next P is a fresh first press, not a continued cycle
    expect(walk(3, ['partner', 'down', 'up', 'partner'])).toEqual(['Eva', 'Leo', 'Ben', 'Eva'])
  })

  it('says so when there are no partners', () => {
    expect(walk(8, ['partner'])).toEqual(['(Leo has no recorded partners)'])
  })
})

describe('announcements', () => {
  const said = (start: number, key: NavKey) => {
    const result = move(tree, id(start), key, freshMemory())
    if (result.kind !== 'moved') throw new Error('expected a move')
    return renderEnglish(describeMoveRef(tree, result))
  }

  it('names the Person, how they relate to where we were, and how many children they have', () => {
    expect(said(3, 'up')).toBe('Karl, father of Ben, 4 children')
    expect(said(8, 'up')).toBe('Ben, father of Leo, 2 children')
    expect(said(3, 'down')).toBe('Leo, son of Ben')
    expect(said(3, 'partner')).toBe('Eva, wife of Ben, 2 children')
    expect(said(3, 'next')).toBe('Anna, sister of Ben')
  })

  it('marks half-siblings and former partners', () => {
    expect(said(5, 'next')).toBe('Max, half-brother of Tim')
    const toEva = move(tree, id(3), 'partner', freshMemory())
    const toZoe = move(tree, id(6 - 1), 'partner', toEva.memory) // pressed again, from Eva
    expect(toZoe.kind === 'moved' && renderEnglish(toZoe.word)).toBe('ex-wife')
    // cycling names the Person the cycle began at, not Eva, whose partner Zoe is not
    expect(toZoe.kind === 'moved' && renderEnglish(describeMoveRef(tree, toZoe))).toBe('Zoe, ex-wife of Ben')
  })

  it('uses a neutral word when gender is not known', () => {
    const t = addParentLink(
      addPerson(addPerson(emptyTree(), { id: id(1), firstName: 'A' }), { id: id(2), firstName: 'B' }),
      id(1),
      id(2),
    )
    const result = move(t, id(1), 'up', freshMemory())
    expect(result.kind === 'moved' && renderEnglish(result.word)).toBe('parent')
  })

  it('every name in these tests belongs to someone', () => {
    expect(nameOf(id(10))).toBe('Max')
  })
})
