import type { Tree } from './schema.ts'

/**
 * Collapsing a branch of the chart (UI redesign). A **branch group** is the children who share the same set of
 * parents (birth and adoptive links; step links do not shape the chart): "Anna and Ben's children". Collapsing a
 * group hides those children and everyone below them; the parents stay. Half-siblings are different groups, so one
 * family can be collapsed without the other. Pure and DOM-free.
 */
export interface BranchGroup {
  /** The parents' ids, sorted and joined: stable for as long as the parents are the same. */
  key: string
  parents: string[]
  children: string[]
}

const keyOf = (parents: readonly string[]) => [...parents].sort().join('|')

/** The groups of the Tree, in the order their first child was added. Children without parents belong to no group. */
export function branchGroups(tree: Tree): BranchGroup[] {
  const parentsOf = new Map<string, string[]>()
  for (const link of tree.parentLinks) {
    if (link.kind === 'step') continue
    const list = parentsOf.get(link.childId)
    if (list) list.push(link.parentId)
    else parentsOf.set(link.childId, [link.parentId])
  }
  const groups = new Map<string, BranchGroup>()
  for (const person of tree.persons) {
    const parents = parentsOf.get(person.id)
    if (!parents) continue
    const key = keyOf(parents)
    const group = groups.get(key)
    if (group) group.children.push(person.id)
    else groups.set(key, { key, parents: [...parents].sort(), children: [person.id] })
  }
  return [...groups.values()]
}

/**
 * Who is hidden when the groups in `collapsed` are collapsed. A child is hidden when their group is collapsed or all of
 * their parents that belong to the family are hidden (a parent who married in does not count: they follow their partner).
 * A partner who has no parents of their own (they married in) goes with their partners: hidden when every partner is
 * hidden and so is every child, so they never stand alone with nothing to attach to. Anyone who is a parent of a
 * collapsed group stays, and so does their partner.
 */
export function hiddenBy(tree: Tree, collapsed: ReadonlySet<string>): Set<string> {
  const hidden = new Set<string>()
  if (collapsed.size === 0) return hidden
  const groups = branchGroups(tree)
  const groupOf = new Map<string, BranchGroup>()
  for (const group of groups) for (const child of group.children) groupOf.set(child, group)
  const partnersOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  for (const partnership of tree.partnerships) {
    const [a, b] = partnership.personIds
    partnersOf.set(a, [...(partnersOf.get(a) ?? []), b])
    partnersOf.set(b, [...(partnersOf.get(b) ?? []), a])
  }
  for (const group of groups) for (const parent of group.parents) childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), ...group.children])

  // someone with no parents of their own and a partner: they belong to their partner's side
  const marriedIn = (id: string) => !groupOf.has(id) && (partnersOf.get(id)?.length ?? 0) > 0

  let changed = true
  while (changed) {
    changed = false
    for (const person of tree.persons) {
      if (hidden.has(person.id)) continue
      const group = groupOf.get(person.id)
      let hide = false
      if (group) {
        const own = group.parents.filter((parent) => !marriedIn(parent))
        hide = collapsed.has(group.key) || (own.length > 0 && own.every((parent) => hidden.has(parent)))
      } else {
        const partners = partnersOf.get(person.id) ?? []
        hide =
          partners.length > 0 &&
          partners.every((partner) => hidden.has(partner)) &&
          (childrenOf.get(person.id) ?? []).every((child) => hidden.has(child))
      }
      if (hide) {
        hidden.add(person.id)
        changed = true
      }
    }
  }
  return hidden
}

/** How many people collapsing this one group would hide: the number on its "+N" button. */
export function branchSize(tree: Tree, key: string): number {
  return hiddenBy(tree, new Set([key])).size
}

/**
 * The collapsed set with whatever hides `personIds` taken out, so each of them is shown. Used when a Person is opened,
 * searched for, or reached with the keyboard: the way to them opens, other branches stay as they are.
 */
export function revealPersons(tree: Tree, collapsed: ReadonlySet<string>, personIds: readonly string[]): ReadonlySet<string> {
  let next = collapsed
  for (let pass = 0; pass < 8 && next.size > 0; pass++) {
    const hidden = hiddenBy(tree, next)
    const wanted = personIds.filter((id) => hidden.has(id))
    if (wanted.length === 0) return next
    const covering = [...next].filter((key) => {
      const alone = hiddenBy(tree, new Set([key]))
      return wanted.some((id) => alone.has(id))
    })
    // nothing single explains it (a partner hidden through two groups): open everything rather than leave them hidden
    next = new Set(covering.length > 0 ? [...next].filter((key) => !covering.includes(key)) : [])
  }
  return next
}

/** Every group that has children: what "Collapse all" collapses (each group's own children, all the way down). */
export function allGroupKeys(tree: Tree): Set<string> {
  return new Set(branchGroups(tree).map((group) => group.key))
}
