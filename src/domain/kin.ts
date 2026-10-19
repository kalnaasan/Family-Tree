import type { Tree } from './schema.ts'

export interface Kin {
  ancestors: Set<string>
  descendants: Set<string>
  /** Current and former partners of the Person. */
  partners: Set<string>
}

/**
 * Who is an ancestor, a descendant or a partner of a Person: what the chart marks when someone is open. Birth and
 * adoptive links count; step links do not. Pure; each person is counted once however many paths lead to them.
 */
export function kinOf(tree: Pick<Tree, 'parentLinks' | 'partnerships'>, personId: string): Kin {
  const parents = new Map<string, string[]>()
  const children = new Map<string, string[]>()
  for (const link of tree.parentLinks) {
    if (link.kind === 'step') continue
    parents.set(link.childId, [...(parents.get(link.childId) ?? []), link.parentId])
    children.set(link.parentId, [...(children.get(link.parentId) ?? []), link.childId])
  }
  const reach = (from: Map<string, string[]>) => {
    const seen = new Set<string>()
    const queue = [...(from.get(personId) ?? [])]
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!
      if (seen.has(id) || id === personId) continue
      seen.add(id)
      queue.push(...(from.get(id) ?? []))
    }
    return seen
  }
  const partners = new Set<string>()
  for (const partnership of tree.partnerships) {
    const [a, b] = partnership.personIds
    if (a === personId) partners.add(b)
    else if (b === personId) partners.add(a)
  }
  return { ancestors: reach(parents), descendants: reach(children), partners }
}
