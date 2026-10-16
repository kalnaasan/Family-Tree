import { partnersOf } from './addRelative.ts'
import type { PartnershipStatus, Person, Tree } from './schema.ts'

/** The relatives of one Person, grouped as the detail panel shows them (spec section 5). */
export interface Relatives {
  parents: Person[]
  partners: { person: Person; status: PartnershipStatus }[]
  siblings: { person: Person; half: boolean }[]
  children: Person[]
}

export function relativesOf(tree: Tree, id: string): Relatives {
  const byId = new Map(tree.persons.map((p) => [p.id, p]))
  const blood = tree.parentLinks.filter((l) => l.kind !== 'step')

  const parentIds = blood.filter((l) => l.childId === id).map((l) => l.parentId)
  const parents = parentIds.map((p) => byId.get(p)).filter((p): p is Person => p !== undefined)
  const children = blood
    .filter((l) => l.parentId === id)
    .map((l) => byId.get(l.childId))
    .filter((p): p is Person => p !== undefined)

  const siblingIds = new Set<string>()
  for (const parentId of parentIds) {
    for (const link of blood) if (link.parentId === parentId && link.childId !== id) siblingIds.add(link.childId)
  }
  const siblings = [...siblingIds].map((siblingId) => {
    const theirs = new Set(blood.filter((l) => l.childId === siblingId).map((l) => l.parentId))
    const mine = new Set(parentIds)
    // a half-sibling: they share a parent, and at least one side has a parent the other does not
    const half = [...theirs].some((p) => !mine.has(p)) || [...mine].some((p) => !theirs.has(p))
    return { person: byId.get(siblingId)!, half }
  })

  return { parents, partners: partnersOf(tree, id), siblings, children }
}
