import type { Tree } from './schema.ts'

export type IntegrityRule =
  | 'duplicate-id'
  | 'dangling-reference'
  | 'self-link'
  | 'self-partnership'
  | 'duplicate-link'
  | 'duplicate-partnership'
  | 'third-birth-parent'
  | 'parent-cycle'
  | 'missing-focus-person'

export class IntegrityError extends Error {
  readonly rule: IntegrityRule

  constructor(rule: IntegrityRule, message: string) {
    super(message)
    this.name = 'IntegrityError'
    this.rule = rule
  }
}

const MAX_BIRTH_PARENTS = 2

/** Throws an IntegrityError for the first violated rule. One definition, used by every store function and by import. */
export function assertTreeIntegrity(tree: Tree): void {
  const personIds = new Set<string>()
  for (const person of tree.persons) {
    if (personIds.has(person.id)) throw new IntegrityError('duplicate-id', `Duplicate Person id ${person.id}`)
    personIds.add(person.id)
  }

  const linkKeys = new Set<string>()
  const birthParentCount = new Map<string, number>()
  const parentsOf = new Map<string, string[]>()
  for (const link of tree.parentLinks) {
    if (link.childId === link.parentId) {
      throw new IntegrityError('self-link', `Person ${link.childId} cannot be their own parent`)
    }
    if (!personIds.has(link.childId) || !personIds.has(link.parentId)) {
      throw new IntegrityError('dangling-reference', 'A Parent link points to a Person that does not exist')
    }
    const key = `${link.childId}>${link.parentId}`
    if (linkKeys.has(key)) {
      throw new IntegrityError('duplicate-link', `Duplicate Parent link ${link.parentId} -> ${link.childId}`)
    }
    linkKeys.add(key)
    if (link.kind === 'birth') {
      const count = (birthParentCount.get(link.childId) ?? 0) + 1
      if (count > MAX_BIRTH_PARENTS) {
        throw new IntegrityError('third-birth-parent', `Person ${link.childId} would have more than two birth parents`)
      }
      birthParentCount.set(link.childId, count)
    }
    const parents = parentsOf.get(link.childId)
    if (parents) parents.push(link.parentId)
    else parentsOf.set(link.childId, [link.parentId])
  }

  const partnershipIds = new Set<string>()
  const pairKeys = new Set<string>()
  for (const partnership of tree.partnerships) {
    const [a, b] = partnership.personIds
    if (partnershipIds.has(partnership.id)) {
      throw new IntegrityError('duplicate-id', `Duplicate Partnership id ${partnership.id}`)
    }
    partnershipIds.add(partnership.id)
    if (a === b) throw new IntegrityError('self-partnership', `Person ${a} cannot partner themselves`)
    if (!personIds.has(a) || !personIds.has(b)) {
      throw new IntegrityError('dangling-reference', 'A Partnership points to a Person that does not exist')
    }
    const pairKey = a < b ? `${a}|${b}` : `${b}|${a}`
    if (pairKeys.has(pairKey)) {
      throw new IntegrityError('duplicate-partnership', `Duplicate Partnership between ${a} and ${b}`)
    }
    pairKeys.add(pairKey)
  }

  if (tree.focusPersonId !== null && !personIds.has(tree.focusPersonId)) {
    throw new IntegrityError('missing-focus-person', 'The Focus person does not exist')
  }

  assertNoParentCycle(personIds, parentsOf)
}

/** Iterative three-colour depth-first search over child -> parent edges. */
function assertNoParentCycle(personIds: Set<string>, parentsOf: Map<string, string[]>): void {
  const state = new Map<string, 1 | 2>() // 1 = on the current path, 2 = finished
  for (const start of personIds) {
    if (state.has(start)) continue
    const stack: { id: string; next: number }[] = [{ id: start, next: 0 }]
    state.set(start, 1)
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!
      const parents = parentsOf.get(frame.id) ?? []
      if (frame.next >= parents.length) {
        state.set(frame.id, 2)
        stack.pop()
        continue
      }
      const parent = parents[frame.next++]!
      const parentState = state.get(parent)
      if (parentState === 1) throw new IntegrityError('parent-cycle', 'Parent links must not form a cycle')
      if (parentState === undefined) {
        state.set(parent, 1)
        stack.push({ id: parent, next: 0 })
      }
    }
  }
}
