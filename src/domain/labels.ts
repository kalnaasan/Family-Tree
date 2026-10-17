import type { Language } from '../i18n/languageType.ts'
import { labelForEnglish } from './labelsEn.ts'
import type { Gender, Tree } from './schema.ts'

/**
 * Relationship labels (spec section 3). Pure and DOM-free: one pass from the Focus person yields a descriptor per
 * Person; a table per language turns a descriptor into a word when it is drawn. Nothing here is stored.
 *
 * A descriptor also records the genders of the relatives the link passes through, which English ignores and
 * languages with separate words for them (Arabic: a cousin through a father's brother, or a mother's sister) need.
 * A gender that is not known is `'unknown'`.
 */

export type Side = 'paternal' | 'maternal'

export type InLawVia = 'partner-parent' | 'partner-sibling' | 'sibling-partner' | 'child-partner'

export type RelationDescriptor =
  | { kind: 'self' }
  | { kind: 'partner'; ex: boolean }
  /**
   * Blood or adoptive relative: `up` generations to the nearest common ancestor, then `down` generations.
   * `sharedParent` is the gender of the one parent a half-sibling shares (only there is there exactly one common
   * ancestor; for anyone else there can be two, and which would come first is not meaningful). `downFirst` is the
   * gender of the first Person below the common ancestor on the way to this one: the sibling a nephew comes
   * through, the uncle or aunt a cousin comes through, the child a grandchild comes through. It is absent in the
   * direct line up.
   */
  | { kind: 'blood'; up: number; down: number; half: boolean; side?: Side; sharedParent?: Gender; downFirst?: Gender }
  /** From a `step` Parent link only (dormant in the v1 interface). */
  | { kind: 'step'; direction: 'parent' | 'child' }
  /**
   * `link` is the gender of the Focus person's own relative the connection runs through, which depends on `via`:
   * `partner-parent` and `partner-sibling`: the partner; `sibling-partner`: the sibling; `child-partner`: the child.
   */
  | { kind: 'in-law'; via: InLawVia; link?: Gender }
  /** The partner of an uncle or aunt: called uncle/aunt, without "in-law". `uncle` is that uncle's or aunt's gender. */
  | { kind: 'uncle-partner'; side?: Side; uncle?: Gender }
  /** Connected to the Focus person, but by a relation v1 has no word for. */
  | { kind: 'other' }
  /** Not connected to the Focus person by any link. */
  | { kind: 'unconnected' }

export interface Relationship {
  descriptor: RelationDescriptor
  /** For `other`: Person ids from the Focus person to this Person along the shortest chain of links. */
  path?: string[]
}

// ---------------------------------------------------------------------------------------------
// The word for a descriptor, in a language
// ---------------------------------------------------------------------------------------------

/**
 * One table per language. PLACEHOLDER: `ar` reads as English until "Arabic relationship labels" adds its own table
 * module (docs/spec/arabic-relationship-labels.md) and replaces this entry. Arabic is not offered to users before
 * that (`AVAILABLE_LANGUAGES`, spec section 13.8), so this cannot show English words in an Arabic interface.
 */
const TABLES: Record<Language, (descriptor: RelationDescriptor, gender: Gender) => string | null> = {
  en: labelForEnglish,
  ar: labelForEnglish,
}

/**
 * The word for a descriptor in a language, gendered when the gender of the Person is known and neutral otherwise.
 * Called when a label is drawn, so a language switch changes the words without deriving the Tree again.
 */
export function labelFor(descriptor: RelationDescriptor, gender: Gender, language: Language): string | null {
  return TABLES[language](descriptor, gender)
}

// ---------------------------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------------------------

interface Candidate {
  up: number
  down: number
  via: string | undefined
  /** The nearest common ancestor this path runs through. */
  ancestorId: string
  /** The first Person below that ancestor on the way down (none for the ancestor themself). */
  first: string | undefined
}

/** Direct line beats collateral, then the shorter path, then the closer generation, then fewer steps up. */
function better(a: Candidate, b: Candidate): boolean {
  const aDirect = a.up === 0 || a.down === 0
  const bDirect = b.up === 0 || b.down === 0
  if (aDirect !== bDirect) return aDirect
  if (a.up + a.down !== b.up + b.down) return a.up + a.down < b.up + b.down
  const aSkew = Math.abs(a.up - a.down)
  const bSkew = Math.abs(b.up - b.down)
  if (aSkew !== bSkew) return aSkew < bSkew
  return a.up < b.up
}

function addTo<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key)
  if (list) list.push(value)
  else map.set(key, [value])
}

/**
 * Relationship of every Person to the Focus person. Empty if there is no Focus person.
 *
 * Priority when a Person qualifies several ways: partner, then blood (direct line before collateral,
 * shortest path), then step, then in-law (direct line before collateral). Cost is roughly
 * (ancestors of the Focus person) x (their descendants); a few thousand steps even at 5,000 people.
 */
export function deriveRelationships(tree: Tree): Map<string, Relationship> {
  const result = new Map<string, Relationship>()
  const focusId = tree.focusPersonId
  const gender = new Map(tree.persons.map((p) => [p.id, p.gender]))
  if (focusId === null || !gender.has(focusId)) return result

  // Birth and adoptive links make blood relatives; step links are kept apart.
  const parentsOf = new Map<string, string[]>()
  const childrenOf = new Map<string, string[]>()
  const stepParentsOf = new Map<string, string[]>()
  const stepChildrenOf = new Map<string, string[]>()
  for (const link of tree.parentLinks) {
    if (link.kind === 'step') {
      addTo(stepParentsOf, link.childId, link.parentId)
      addTo(stepChildrenOf, link.parentId, link.childId)
    } else {
      addTo(parentsOf, link.childId, link.parentId)
      addTo(childrenOf, link.parentId, link.childId)
    }
  }
  const partnersOf = new Map<string, { other: string; status: 'current' | 'ended' }[]>()
  for (const { personIds: [a, b], status } of tree.partnerships) {
    addTo(partnersOf, a, { other: b, status })
    addTo(partnersOf, b, { other: a, status })
  }

  const genderOf = (id: string): Gender => gender.get(id) ?? 'unknown'
  const assign = (id: string, descriptor: RelationDescriptor) => {
    if (result.has(id)) return
    result.set(id, { descriptor })
  }
  const currentPartners = (id: string) =>
    (partnersOf.get(id) ?? []).filter((p) => p.status === 'current').map((p) => p.other)
  const siblingsOf = (id: string) => {
    const found = new Set<string>()
    for (const parent of parentsOf.get(id) ?? []) for (const child of childrenOf.get(parent) ?? []) found.add(child)
    found.delete(id)
    return found
  }

  assign(focusId, { kind: 'self' })

  // 1. Partners. If a pair somehow had a current and an ended Partnership, current wins.
  const partners = new Map<string, boolean>() // id -> ended?
  for (const { other, status } of partnersOf.get(focusId) ?? []) {
    partners.set(other, (partners.get(other) ?? true) && status === 'ended')
  }
  for (const [id, ex] of partners) assign(id, { kind: 'partner', ex })

  // 2. Blood relatives. Ancestors first (nearest distance), remembering which parent of the Focus person leads there.
  const ancestors = new Map<string, { up: number; via: string | undefined }>([[focusId, { up: 0, via: undefined }]])
  const queue = [focusId]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    const entry = ancestors.get(current)!
    for (const parent of parentsOf.get(current) ?? []) {
      if (ancestors.has(parent)) continue
      ancestors.set(parent, { up: entry.up + 1, via: current === focusId ? parent : entry.via })
      queue.push(parent)
    }
  }

  // From every ancestor walk down, but never through the Focus person's own ancestors (that leads back to them).
  const best = new Map<string, Candidate>()
  for (const [ancestorId, { up, via }] of ancestors) {
    const seen = new Set<string>([ancestorId])
    const down: [string, number][] = [[ancestorId, 0]]
    const firstBelow = new Map<string, string>() // Person -> the first Person below the ancestor on the way to them
    for (let i = 0; i < down.length; i++) {
      const [id, distance] = down[i]!
      if (id !== focusId) {
        const candidate: Candidate = { up, down: distance, via, ancestorId, first: firstBelow.get(id) }
        const current = best.get(id)
        if (!current || better(candidate, current)) best.set(id, candidate)
      }
      for (const child of childrenOf.get(id) ?? []) {
        if (seen.has(child) || ancestors.has(child)) continue
        seen.add(child)
        firstBelow.set(child, id === ancestorId ? child : firstBelow.get(id)!)
        down.push([child, distance + 1])
      }
    }
  }

  const focusParents = new Set(parentsOf.get(focusId) ?? [])
  for (const [id, { up, down, via, ancestorId, first }] of best) {
    let half = false
    if (up === 1 && down === 1) {
      // Exactly one shared parent, and at least one of the two has another parent who is not shared.
      // Two people who both record only the same single parent are not assumed to be half-siblings.
      const theirParents = new Set(parentsOf.get(id) ?? [])
      const shared = [...theirParents].filter((p) => focusParents.has(p)).length
      const union = new Set([...theirParents, ...focusParents]).size
      half = shared === 1 && union > shared
    }
    const viaGender = via === undefined ? undefined : gender.get(via)
    const side: Side | undefined = viaGender === 'male' ? 'paternal' : viaGender === 'female' ? 'maternal' : undefined
    assign(id, {
      kind: 'blood',
      up,
      down,
      half,
      ...(side ? { side } : {}),
      ...(half ? { sharedParent: genderOf(ancestorId) } : {}),
      ...(first ? { downFirst: genderOf(first) } : {}),
    })
  }

  // 3. Step relatives (only from `step` links).
  for (const id of stepParentsOf.get(focusId) ?? []) assign(id, { kind: 'step', direction: 'parent' })
  for (const id of stepChildrenOf.get(focusId) ?? []) assign(id, { kind: 'step', direction: 'child' })

  // 4. In-laws, through current Partnerships only. Direct line before collateral.
  for (const partner of currentPartners(focusId)) {
    for (const parent of parentsOf.get(partner) ?? []) {
      assign(parent, { kind: 'in-law', via: 'partner-parent', link: genderOf(partner) })
    }
  }
  for (const child of childrenOf.get(focusId) ?? []) {
    for (const partner of currentPartners(child)) {
      assign(partner, { kind: 'in-law', via: 'child-partner', link: genderOf(child) })
    }
  }
  for (const partner of currentPartners(focusId)) {
    for (const sibling of siblingsOf(partner)) {
      assign(sibling, { kind: 'in-law', via: 'partner-sibling', link: genderOf(partner) })
    }
  }
  for (const sibling of siblingsOf(focusId)) {
    for (const partner of currentPartners(sibling)) {
      assign(partner, { kind: 'in-law', via: 'sibling-partner', link: genderOf(sibling) })
    }
  }
  for (const parent of parentsOf.get(focusId) ?? []) {
    const parentGender = genderOf(parent)
    const side: Side | undefined = parentGender === 'male' ? 'paternal' : parentGender === 'female' ? 'maternal' : undefined
    for (const uncle of siblingsOf(parent)) {
      for (const partner of currentPartners(uncle)) {
        assign(partner, { kind: 'uncle-partner', ...(side ? { side } : {}), uncle: genderOf(uncle) })
      }
    }
  }

  // 5. Everyone else: "Relative" with the chain of links if connected, otherwise not connected.
  const previous = shortestChains(tree, focusId)
  for (const person of tree.persons) {
    if (result.has(person.id)) continue
    if (!previous.has(person.id)) {
      assign(person.id, { kind: 'unconnected' })
      continue
    }
    assign(person.id, { kind: 'other' })
    const path: string[] = []
    for (let at: string | null = person.id; at !== null; at = previous.get(at) ?? null) path.unshift(at)
    result.get(person.id)!.path = path
  }

  return result
}

/** Breadth-first over every link (any Parent link kind, any Partnership); id -> the Person before it on the shortest chain. */
function shortestChains(tree: Tree, from: string): Map<string, string | null> {
  const neighbours = new Map<string, string[]>()
  for (const link of tree.parentLinks) {
    addTo(neighbours, link.childId, link.parentId)
    addTo(neighbours, link.parentId, link.childId)
  }
  for (const { personIds: [a, b] } of tree.partnerships) {
    addTo(neighbours, a, b)
    addTo(neighbours, b, a)
  }
  const previous = new Map<string, string | null>([[from, null]])
  const queue = [from]
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i]!
    for (const next of neighbours.get(current) ?? []) {
      if (previous.has(next)) continue
      previous.set(next, current)
      queue.push(next)
    }
  }
  return previous
}
