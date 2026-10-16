import { relativesOf } from './groups.ts'
import type { Gender, Person, Tree } from './schema.ts'

/**
 * Keyboard navigation along family links (spec section 7): up = a parent, down = a child, left/right = the
 * previous/next sibling, partner = a partner. Pure; the canvas only moves focus to the result.
 *
 * Stable order, so the same keys always lead the same way:
 * - Up goes to the first parent. Down goes back to the child you came from, else to the first child.
 * - Left/right walk a ring of the Person and their siblings in the order the Persons were added, wrapping round.
 * - Partner goes to the first partner; pressing it again right away cycles through the partners of the Person you
 *   started from, so every partner can be reached.
 */
export type NavKey = 'up' | 'down' | 'left' | 'right' | 'partner'

export interface NavMemory {
  lastKey: NavKey | null
  /** For repeated partner presses: who the cycle started from, and which partner it is on. */
  origin: string | null
  index: number
  /** Parent id -> the child we climbed from, so Down returns the way we came. */
  cameFrom: ReadonlyMap<string, string>
}

export const freshMemory = (): NavMemory => ({ lastKey: null, origin: null, index: 0, cameFrom: new Map() })

export type Move =
  /** `relativeTo` is who `word` is about: the Person we moved from, or, when cycling partners, who the cycle began at. */
  | { kind: 'moved'; target: Person; relativeTo: Person; word: string; memory: NavMemory }
  | { kind: 'none'; message: string; memory: NavMemory }

const pick = (gender: Gender, male: string, female: string, neutral: string) =>
  gender === 'male' ? male : gender === 'female' ? female : neutral

export function move(tree: Tree, currentId: string, key: NavKey, memory: NavMemory): Move {
  const current = tree.persons.find((p) => p.id === currentId)
  if (!current) return { kind: 'none', message: 'Nobody is selected', memory }
  const relatives = relativesOf(tree, currentId)
  const next = (patch: Partial<NavMemory>): NavMemory => ({ ...memory, lastKey: key, ...patch })

  switch (key) {
    case 'up': {
      const target = relatives.parents[0]
      if (!target) return { kind: 'none', message: `${current.firstName} has no recorded parents`, memory: next({ origin: null }) }
      const cameFrom = new Map(memory.cameFrom).set(target.id, current.id)
      return {
        kind: 'moved',
        target,
        relativeTo: current,
        word: pick(target.gender, 'father', 'mother', 'parent'),
        memory: next({ origin: null, cameFrom }),
      }
    }
    case 'down': {
      const remembered = relatives.children.find((c) => c.id === memory.cameFrom.get(currentId))
      const target = remembered ?? relatives.children[0]
      if (!target) return { kind: 'none', message: `${current.firstName} has no recorded children`, memory: next({ origin: null }) }
      return { kind: 'moved', target, relativeTo: current, word: pick(target.gender, 'son', 'daughter', 'child'), memory: next({ origin: null }) }
    }
    case 'left':
    case 'right': {
      const order = new Map(tree.persons.map((p, i) => [p.id, i]))
      const ring = [current, ...relatives.siblings.map((s) => s.person)].sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      if (ring.length === 1) return { kind: 'none', message: `${current.firstName} has no recorded siblings`, memory: next({ origin: null }) }
      const at = ring.findIndex((p) => p.id === currentId)
      const target = ring[(at + (key === 'right' ? 1 : -1) + ring.length) % ring.length]!
      const half = relatives.siblings.find((s) => s.person.id === target.id)?.half ?? false
      const word = `${half ? 'half-' : ''}${pick(target.gender, 'brother', 'sister', 'sibling')}`
      return { kind: 'moved', target, relativeTo: current, word, memory: next({ origin: null }) }
    }
    case 'partner': {
      const repeating = memory.lastKey === 'partner' && memory.origin !== null
      const originPartners = repeating ? relativesOf(tree, memory.origin!).partners : []
      const cycling = repeating && originPartners.length > 1
      const partners = cycling ? originPartners : relatives.partners
      if (partners.length === 0) {
        return { kind: 'none', message: `${current.firstName} has no recorded partners`, memory: next({ origin: null }) }
      }
      const index = cycling ? (memory.index + 1) % partners.length : 0
      const { person, status } = partners[index]!
      const word = pick(person.gender, 'husband', 'wife', 'partner')
      return {
        kind: 'moved',
        target: person,
        relativeTo: cycling ? tree.persons.find((p) => p.id === memory.origin)! : current,
        word: status === 'ended' ? `ex-${word}` : word,
        memory: next({ origin: cycling ? memory.origin : currentId, index }),
      }
    }
  }
}

/** The announcement for a move, e.g. "Karl, father of Ben, 2 children". */
export function describeMove(tree: Tree, moved: Extract<Move, { kind: 'moved' }>): string {
  const children = relativesOf(tree, moved.target.id).children.length
  return [
    `${moved.target.firstName}, ${moved.word} of ${moved.relativeTo.firstName}`,
    children > 0 ? `${children} ${children === 1 ? 'child' : 'children'}` : null,
  ]
    .filter(Boolean)
    .join(', ')
}
