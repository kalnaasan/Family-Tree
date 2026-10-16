import type { Gender, PartnershipStatus, Person, Tree } from './schema.ts'
import { type NewPerson, addParentLink, addPartnership, addPerson } from './tree.ts'

/**
 * Add-relative (spec section 5). One user action is one pure function: it adds the new Person, every Parent link
 * and the Partnership that belong to it, or throws and changes nothing. `questionFor` says whether the user has
 * to answer something first, and `previewFor` words what will be created.
 */

export type Relation =
  | 'father'
  | 'mother'
  | 'brother'
  | 'sister'
  | 'husband'
  | 'wife'
  | 'partner'
  | 'son'
  | 'daughter'
  | 'child'

export type RelationKind = 'parent' | 'sibling' | 'partner' | 'child'

export const RELATIONS: Record<Relation, { kind: RelationKind; gender: Gender }> = {
  father: { kind: 'parent', gender: 'male' },
  mother: { kind: 'parent', gender: 'female' },
  brother: { kind: 'sibling', gender: 'male' },
  sister: { kind: 'sibling', gender: 'female' },
  husband: { kind: 'partner', gender: 'male' },
  wife: { kind: 'partner', gender: 'female' },
  partner: { kind: 'partner', gender: 'unknown' },
  son: { kind: 'child', gender: 'male' },
  daughter: { kind: 'child', gender: 'female' },
  child: { kind: 'child', gender: 'unknown' },
}

/** Name given to the parent created for a sibling of a Person with no recorded parents. Renameable. */
export const UNNAMED_PARENT = 'Unnamed parent'

export type ParentPartnershipAnswer = 'current' | 'ended' | 'none'

export type Question =
  | { kind: 'none' }
  | { kind: 'blocked'; message: string }
  /** The new parent's link to the one birth parent the Person already has. */
  | { kind: 'parent-partnership'; existingParent: Person }
  /** A Person with two birth parents: a full sibling shares both, a half-sibling only one. */
  | { kind: 'sibling-parents'; parents: [Person, Person] }
  | { kind: 'child-other-parent'; partners: { person: Person; status: PartnershipStatus }[]; defaultParentId: string | null }
  | { kind: 'partner-status' }

export interface RelativeAnswers {
  /** Default `current`. */
  parentPartnership?: ParentPartnershipAnswer
  /** `both`, or the id of the one parent shared with a half-sibling. Default `both`. */
  siblingParents?: 'both' | string
  /** Default: the latest current partner, or nobody. `null` is "Nobody / not recorded". */
  otherParentId?: string | null
  /** Default `current`. */
  partnerStatus?: PartnershipStatus
}

export interface AddRelativeRequest {
  anchorId: string
  relation: Relation
  /** `gender` overrides the one the relation presets. */
  person: Omit<NewPerson, 'id'>
  answers?: RelativeAnswers
}

const name = (person: Person) => person.firstName
const aPartnership = (status: string) => `${status === 'ended' ? 'An' : 'A'} ${status} partnership`

function personOf(tree: Tree, id: string): Person {
  const person = tree.persons.find((p) => p.id === id)
  if (!person) throw new Error(`No Person with id ${id}`)
  return person
}

function birthParentsOf(tree: Tree, id: string): Person[] {
  return tree.parentLinks
    .filter((l) => l.childId === id && l.kind === 'birth')
    .map((l) => personOf(tree, l.parentId))
}

/** Partners of a Person, each once, in the order the Partnerships were recorded. */
export function partnersOf(tree: Tree, id: string): { person: Person; status: PartnershipStatus }[] {
  const seen = new Map<string, { person: Person; status: PartnershipStatus }>()
  for (const partnership of tree.partnerships) {
    if (!partnership.personIds.includes(id)) continue
    const other = partnership.personIds[0] === id ? partnership.personIds[1] : partnership.personIds[0]
    const existing = seen.get(other)
    // a current Partnership wins over an ended one with the same Person
    if (!existing || partnership.status === 'current') {
      seen.set(other, { person: personOf(tree, other), status: partnership.status })
    }
  }
  return [...seen.values()]
}

export function questionFor(tree: Tree, anchorId: string, relation: Relation): Question {
  const anchor = personOf(tree, anchorId)
  const parents = birthParentsOf(tree, anchorId)
  switch (RELATIONS[relation].kind) {
    case 'parent':
      if (parents.length >= 2) {
        return { kind: 'blocked', message: `${name(anchor)} already has two birth parents, so a third cannot be added.` }
      }
      return parents.length === 1 ? { kind: 'parent-partnership', existingParent: parents[0]! } : { kind: 'none' }
    case 'sibling':
      return parents.length === 2 ? { kind: 'sibling-parents', parents: [parents[0]!, parents[1]!] } : { kind: 'none' }
    case 'partner':
      return { kind: 'partner-status' }
    case 'child': {
      const partners = partnersOf(tree, anchorId)
      if (partners.length === 0) return { kind: 'none' }
      const latestCurrent = [...partners].reverse().find((p) => p.status === 'current')
      return { kind: 'child-other-parent', partners, defaultParentId: latestCurrent?.person.id ?? null }
    }
  }
}

/** The parents the new Person gets when they are a sibling, per the answer. Empty means a new parent is made. */
function siblingParentIds(tree: Tree, anchorId: string, answers: RelativeAnswers): string[] {
  const parents = birthParentsOf(tree, anchorId)
  const choice = answers.siblingParents ?? 'both'
  if (parents.length === 2 && choice !== 'both') {
    if (!parents.some((p) => p.id === choice)) throw new Error('That Person is not a parent of the sibling')
    return [choice]
  }
  return parents.map((p) => p.id)
}

function otherParentId(tree: Tree, anchorId: string, answers: RelativeAnswers): string | null {
  if (answers.otherParentId !== undefined) {
    if (answers.otherParentId === anchorId) throw new Error('A child cannot have the same Person as both parents')
    if (answers.otherParentId !== null) personOf(tree, answers.otherParentId)
    return answers.otherParentId
  }
  const question = questionFor(tree, anchorId, 'child')
  return question.kind === 'child-other-parent' ? question.defaultParentId : null
}

export function addRelative(tree: Tree, request: AddRelativeRequest): { tree: Tree; personId: string } {
  const { anchorId, relation, person } = request
  const answers = request.answers ?? {}
  personOf(tree, anchorId)
  const personId = crypto.randomUUID()
  let next = addPerson(tree, { gender: RELATIONS[relation].gender, ...person, id: personId })

  switch (RELATIONS[relation].kind) {
    case 'parent': {
      const existing = birthParentsOf(tree, anchorId)
      next = addParentLink(next, anchorId, personId)
      const answer = answers.parentPartnership ?? 'current'
      if (existing.length === 1 && answer !== 'none') {
        next = addPartnership(next, { personIds: [existing[0]!.id, personId], status: answer })
      }
      break
    }
    case 'sibling': {
      let parentIds = siblingParentIds(tree, anchorId, answers)
      if (parentIds.length === 0) {
        const parentId = crypto.randomUUID()
        next = addPerson(next, { id: parentId, firstName: UNNAMED_PARENT })
        next = addParentLink(next, anchorId, parentId)
        parentIds = [parentId]
      }
      for (const parentId of parentIds) next = addParentLink(next, personId, parentId)
      break
    }
    case 'partner':
      next = addPartnership(next, { personIds: [anchorId, personId], status: answers.partnerStatus ?? 'current' })
      break
    case 'child': {
      next = addParentLink(next, personId, anchorId)
      const other = otherParentId(tree, anchorId, answers)
      if (other) next = addParentLink(next, personId, other)
      break
    }
  }
  return { tree: next, personId }
}

/** Plain-language lines for "This will create: ...". */
export function previewFor(tree: Tree, request: AddRelativeRequest): string[] {
  const { anchorId, relation } = request
  const answers = request.answers ?? {}
  const anchor = personOf(tree, anchorId)
  const who = request.person.firstName.trim() || 'The new person'
  const lines: string[] = []

  switch (RELATIONS[relation].kind) {
    case 'parent': {
      lines.push(`${who}, ${relation} of ${name(anchor)}`)
      const existing = birthParentsOf(tree, anchorId)
      const answer = answers.parentPartnership ?? 'current'
      if (existing.length === 1) {
        lines.push(
          answer === 'none'
            ? `No partnership with ${name(existing[0]!)}`
            : `${aPartnership(answer)} with ${name(existing[0]!)}`,
        )
      }
      break
    }
    case 'sibling': {
      lines.push(`${who}, ${relation} of ${name(anchor)}`)
      const parents = birthParentsOf(tree, anchorId)
      if (parents.length === 0) {
        lines.push(`A new parent, "${UNNAMED_PARENT}", of both (you can rename them)`)
      } else {
        const shared = siblingParentIds(tree, anchorId, answers).map((id) => name(personOf(tree, id)))
        lines.push(
          parents.length === 2 && shared.length === 1
            ? `Half-sibling: shares only ${shared[0]} as parent`
            : `Same ${shared.length > 1 ? 'parents' : 'parent'}: ${shared.join(' and ')}`,
        )
      }
      break
    }
    case 'partner':
      lines.push(`${who}, ${relation} of ${name(anchor)}`)
      lines.push(aPartnership(answers.partnerStatus ?? 'current'))
      break
    case 'child': {
      const other = otherParentId(tree, anchorId, answers)
      lines.push(`${who}, ${relation} of ${name(anchor)}${other ? ` and ${name(personOf(tree, other))}` : ''}`)
      break
    }
  }
  return lines
}
