import { type MessageRef, msg } from '../i18n/messageRef.ts'
import { type Relation, type RelativeAnswers, previewLines, relate } from './addRelative.ts'
import { IntegrityError } from './integrity.ts'
import type { Person, Tree } from './schema.ts'

/**
 * Linking an existing Person as a relative (spec section 5.1). It does what `addRelative` does, with a picked Person
 * instead of a new one: one pure function, all or nothing. `candidatesFor` finds out who can be picked by running
 * the link as a dry run, so the list and the domain can never disagree.
 */

export interface LinkExistingRequest {
  anchorId: string
  relation: Relation
  /** The Person picked from the list. */
  personId: string
  answers?: RelativeAnswers
  /** The name of the parent made for a sibling of a Person with no parents (see `AddRelativeRequest`). */
  unnamedParentName: string
}

export type LinkRefusal = 'self' | 'already-linked' | 'own-ancestor' | 'third-birth-parent' | 'already-partners'

export interface Candidate {
  person: Person
  status: { valid: true } | { valid: false; reason: LinkRefusal }
}

/** Only the shape of the dry run matters; the made parent is thrown away. */
const DRY_RUN_PARENT = '?'

const REASON: Partial<Record<IntegrityError['rule'], LinkRefusal>> = {
  'self-link': 'self',
  'self-partnership': 'self',
  'duplicate-link': 'already-linked',
  'parent-cycle': 'own-ancestor',
  'third-birth-parent': 'third-birth-parent',
  'duplicate-partnership': 'already-partners',
}

export function linkExisting(tree: Tree, request: LinkExistingRequest): Tree {
  const { anchorId, relation, personId } = request
  for (const id of [anchorId, personId]) {
    if (!tree.persons.some((p) => p.id === id)) throw new Error(`No Person with id ${id}`)
  }
  if (anchorId === personId) throw new IntegrityError('self-link', 'A Person cannot be linked to themselves')
  return relate(tree, anchorId, relation, personId, request.answers ?? {}, request.unnamedParentName)
}

/** Every other Person, each valid for this link or with the reason it is not (the answers are the defaults). */
export function candidatesFor(tree: Tree, anchorId: string, relation: Relation): Candidate[] {
  return tree.persons
    .filter((person) => person.id !== anchorId)
    .map((person): Candidate => {
      try {
        linkExisting(tree, { anchorId, relation, personId: person.id, unnamedParentName: DRY_RUN_PARENT })
        return { person, status: { valid: true } }
      } catch (error) {
        const reason = error instanceof IntegrityError ? REASON[error.rule] : undefined
        if (!reason) throw error
        return { person, status: { valid: false, reason } }
      }
    })
}

/** The lines of "This will link: ...", as messages the picker words in the language in use. */
export function previewLinkFor(tree: Tree, request: LinkExistingRequest): MessageRef[] {
  const picked = tree.persons.find((p) => p.id === request.personId)
  if (!picked) throw new Error(`No Person with id ${request.personId}`)
  return previewLines(tree, request, picked.firstName.trim() || msg('preview.newPerson'), request.personId)
}
