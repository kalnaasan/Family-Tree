import { type MessageRef, msg } from '../i18n/messageRef.ts'
import type { MessageKey } from '../i18n/messages.ts'
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
 *
 * The words this says are messages, not sentences: the interface turns them into the language in use.
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
  | { kind: 'moved'; target: Person; relativeTo: Person; word: MessageRef; memory: NavMemory }
  | { kind: 'none'; message: MessageRef; memory: NavMemory }

const pick = (gender: Gender, male: MessageKey, female: MessageKey, neutral: MessageKey): MessageRef =>
  msg(gender === 'male' ? male : gender === 'female' ? female : neutral)

export function move(tree: Tree, currentId: string, key: NavKey, memory: NavMemory): Move {
  const current = tree.persons.find((p) => p.id === currentId)
  if (!current) return { kind: 'none', message: msg('nav.nobodySelected'), memory }
  const relatives = relativesOf(tree, currentId)
  const next = (patch: Partial<NavMemory>): NavMemory => ({ ...memory, lastKey: key, ...patch })
  const nothing = (message: MessageKey): Move => ({
    kind: 'none',
    message: msg(message, { name: current.firstName }),
    memory: next({ origin: null }),
  })

  switch (key) {
    case 'up': {
      const target = relatives.parents[0]
      if (!target) return nothing('nav.noParents')
      const cameFrom = new Map(memory.cameFrom).set(target.id, current.id)
      return {
        kind: 'moved',
        target,
        relativeTo: current,
        word: pick(target.gender, 'relation.father', 'relation.mother', 'relation.parent'),
        memory: next({ origin: null, cameFrom }),
      }
    }
    case 'down': {
      const remembered = relatives.children.find((c) => c.id === memory.cameFrom.get(currentId))
      const target = remembered ?? relatives.children[0]
      if (!target) return nothing('nav.noChildren')
      return {
        kind: 'moved',
        target,
        relativeTo: current,
        word: pick(target.gender, 'relation.son', 'relation.daughter', 'relation.child'),
        memory: next({ origin: null }),
      }
    }
    case 'left':
    case 'right': {
      const order = new Map(tree.persons.map((p, i) => [p.id, i]))
      const ring = [current, ...relatives.siblings.map((s) => s.person)].sort((a, b) => order.get(a.id)! - order.get(b.id)!)
      if (ring.length === 1) return nothing('nav.noSiblings')
      const at = ring.findIndex((p) => p.id === currentId)
      const target = ring[(at + (key === 'right' ? 1 : -1) + ring.length) % ring.length]!
      const half = relatives.siblings.find((s) => s.person.id === target.id)?.half ?? false
      const word = half
        ? pick(target.gender, 'relation.halfBrother', 'relation.halfSister', 'relation.halfSibling')
        : pick(target.gender, 'relation.brother', 'relation.sister', 'relation.sibling')
      return { kind: 'moved', target, relativeTo: current, word, memory: next({ origin: null }) }
    }
    case 'partner': {
      const repeating = memory.lastKey === 'partner' && memory.origin !== null
      const originPartners = repeating ? relativesOf(tree, memory.origin!).partners : []
      const cycling = repeating && originPartners.length > 1
      const partners = cycling ? originPartners : relatives.partners
      if (partners.length === 0) return nothing('nav.noPartners')
      const index = cycling ? (memory.index + 1) % partners.length : 0
      const { person, status } = partners[index]!
      const word =
        status === 'ended'
          ? pick(person.gender, 'relation.exHusband', 'relation.exWife', 'relation.exPartner')
          : pick(person.gender, 'relation.husband', 'relation.wife', 'relation.partner')
      return {
        kind: 'moved',
        target: person,
        relativeTo: cycling ? tree.persons.find((p) => p.id === memory.origin)! : current,
        word,
        memory: next({ origin: cycling ? memory.origin : currentId, index }),
      }
    }
  }
}

/** The announcement for a move, e.g. "Karl, father of Ben, 2 children". */
export function describeMove(tree: Tree, moved: Extract<Move, { kind: 'moved' }>): MessageRef {
  const children = relativesOf(tree, moved.target.id).children.length
  const params = { target: moved.target.firstName, word: moved.word, relativeTo: moved.relativeTo.firstName }
  return children > 0 ? msg('nav.movedChildren', { ...params, count: children }) : msg('nav.moved', params)
}
