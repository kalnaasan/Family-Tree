import { assertTreeIntegrity } from './integrity.ts'
import {
  type ParentLink,
  type ParentLinkKind,
  type Partnership,
  type PartnershipStatus,
  type Person,
  type Tree,
  parentLinkSchema,
  partnershipSchema,
  personSchema,
} from './schema.ts'

/** What a delete took with it, so callers can name it (delete toast) and clean up photo Blobs. */
export interface DeletedPersonInfo {
  person: Person
  parentLinks: ParentLink[]
  partnerships: Partnership[]
}

export type NewPerson = Omit<Partial<Person>, 'id'> & { firstName: string; id?: string }
export type PersonPatch = Partial<Omit<Person, 'id'>>

export function emptyTree(): Tree {
  return { focusPersonId: null, persons: [], parentLinks: [], partnerships: [] }
}

/** Validates the candidate Tree and returns it; the single exit for every change. */
function checked(tree: Tree): Tree {
  assertTreeIntegrity(tree)
  return tree
}

/** The first Person created becomes the Focus person. */
export function addPerson(tree: Tree, input: NewPerson): Tree {
  const person = personSchema.parse({ ...input, id: input.id ?? crypto.randomUUID() })
  return checked({
    ...tree,
    focusPersonId: tree.focusPersonId ?? person.id,
    persons: [...tree.persons, person],
  })
}

export function updatePerson(tree: Tree, id: string, patch: PersonPatch): Tree {
  const existing = tree.persons.find((p) => p.id === id)
  if (!existing) throw new Error(`No Person with id ${id}`)
  const updated = personSchema.parse({ ...existing, ...patch, id })
  return checked({ ...tree, persons: tree.persons.map((p) => (p.id === id ? updated : p)) })
}

/**
 * Removes the Person with their Parent links and Partnerships. If they were the Focus person, the first
 * remaining Person takes over (or none). The caller deletes the photo Blob via `info.person.photoId`.
 */
export function deletePerson(tree: Tree, id: string): { tree: Tree; deleted: DeletedPersonInfo } {
  const person = tree.persons.find((p) => p.id === id)
  if (!person) throw new Error(`No Person with id ${id}`)
  const parentLinks = tree.parentLinks.filter((l) => l.childId === id || l.parentId === id)
  const partnerships = tree.partnerships.filter((p) => p.personIds.includes(id))
  const persons = tree.persons.filter((p) => p.id !== id)
  const next = checked({
    focusPersonId: tree.focusPersonId === id ? (persons[0]?.id ?? null) : tree.focusPersonId,
    persons,
    parentLinks: tree.parentLinks.filter((l) => !parentLinks.includes(l)),
    partnerships: tree.partnerships.filter((p) => !partnerships.includes(p)),
  })
  return { tree: next, deleted: { person, parentLinks, partnerships } }
}

export function addParentLink(tree: Tree, childId: string, parentId: string, kind: ParentLinkKind = 'birth'): Tree {
  const link = parentLinkSchema.parse({ childId, parentId, kind })
  return checked({ ...tree, parentLinks: [...tree.parentLinks, link] })
}

export function removeParentLink(tree: Tree, childId: string, parentId: string): Tree {
  const parentLinks = tree.parentLinks.filter((l) => !(l.childId === childId && l.parentId === parentId))
  if (parentLinks.length === tree.parentLinks.length) throw new Error('No such Parent link')
  return checked({ ...tree, parentLinks })
}

export function setParentLinkKind(tree: Tree, childId: string, parentId: string, kind: ParentLinkKind): Tree {
  if (!tree.parentLinks.some((l) => l.childId === childId && l.parentId === parentId)) throw new Error('No such Parent link')
  const parentLinks = tree.parentLinks.map((l) => (l.childId === childId && l.parentId === parentId ? { ...l, kind } : l))
  return checked({ ...tree, parentLinks })
}

export interface NewPartnership {
  id?: string
  personIds: [string, string]
  status: PartnershipStatus
  startDate?: string
  endDate?: string
}

export function addPartnership(tree: Tree, input: NewPartnership): Tree {
  const partnership = partnershipSchema.parse({ ...input, id: input.id ?? crypto.randomUUID() })
  return checked({ ...tree, partnerships: [...tree.partnerships, partnership] })
}

export function updatePartnership(
  tree: Tree,
  id: string,
  patch: Partial<Pick<Partnership, 'status' | 'startDate' | 'endDate'>>,
): Tree {
  const existing = tree.partnerships.find((p) => p.id === id)
  if (!existing) throw new Error(`No Partnership with id ${id}`)
  const updated = partnershipSchema.parse({ ...existing, ...patch, id })
  return checked({ ...tree, partnerships: tree.partnerships.map((p) => (p.id === id ? updated : p)) })
}

export function removePartnership(tree: Tree, id: string): Tree {
  const partnerships = tree.partnerships.filter((p) => p.id !== id)
  if (partnerships.length === tree.partnerships.length) throw new Error(`No Partnership with id ${id}`)
  return checked({ ...tree, partnerships })
}

export function setFocusPerson(tree: Tree, id: string): Tree {
  return checked({ ...tree, focusPersonId: id })
}
