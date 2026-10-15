import type { Gender, Tree } from './schema.ts'

/**
 * Relationship labels (spec section 3). Pure and DOM-free: one pass from the Focus person yields a
 * descriptor per Person; a separate English lookup turns it into a word. Nothing here is stored.
 */

export type Side = 'paternal' | 'maternal'

export type InLawVia = 'partner-parent' | 'partner-sibling' | 'sibling-partner' | 'child-partner'

export type RelationDescriptor =
  | { kind: 'self' }
  | { kind: 'partner'; ex: boolean }
  /** Blood or adoptive relative: `up` generations to the nearest common ancestor, then `down` generations. */
  | { kind: 'blood'; up: number; down: number; half: boolean; side?: Side }
  /** From a `step` Parent link only (dormant in the v1 interface). */
  | { kind: 'step'; direction: 'parent' | 'child' }
  | { kind: 'in-law'; via: InLawVia }
  /** The partner of an uncle or aunt: called uncle/aunt, without "in-law". */
  | { kind: 'uncle-partner' }
  /** Connected to the Focus person, but by a relation v1 has no word for. */
  | { kind: 'other' }
  /** Not connected to the Focus person by any link. */
  | { kind: 'unconnected' }

export interface Relationship {
  descriptor: RelationDescriptor
  /** null for the Focus person, who is marked visually instead. */
  label: string | null
  /** For `other`: Person ids from the Focus person to this Person along the shortest chain of links. */
  path?: string[]
}

// ---------------------------------------------------------------------------------------------
// English lookup
// ---------------------------------------------------------------------------------------------

const pick = (gender: Gender, male: string, female: string, neutral: string) =>
  gender === 'male' ? male : gender === 'female' ? female : neutral

const great = (n: number) => 'great-'.repeat(Math.max(0, n))

function ordinal(n: number): string {
  const lastTwo = n % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`
  switch (n % 10) {
    case 1:
      return `${n}st`
    case 2:
      return `${n}nd`
    case 3:
      return `${n}rd`
    default:
      return `${n}th`
  }
}

function bloodLabel(up: number, down: number, half: boolean, gender: Gender): string {
  if (down === 0) {
    // ancestors
    if (up === 1) return pick(gender, 'father', 'mother', 'parent')
    return great(up - 2) + 'grand' + pick(gender, 'father', 'mother', 'parent')
  }
  if (up === 0) {
    // descendants
    if (down === 1) return pick(gender, 'son', 'daughter', 'child')
    return great(down - 2) + 'grand' + pick(gender, 'son', 'daughter', 'child')
  }
  if (up === 1 && down === 1) {
    const sibling = pick(gender, 'brother', 'sister', 'sibling')
    return half ? `half-${sibling}` : sibling
  }
  if (down === 1) return great(up - 2) + pick(gender, 'uncle', 'aunt', 'uncle/aunt')
  if (up === 1) {
    const nephew = pick(gender, 'nephew', 'niece', 'nephew/niece')
    if (down === 2) return nephew
    return great(down - 3) + 'grand' + nephew
  }
  // cousins: the degree comes from the shorter side, the removal from the difference
  const degree = Math.min(up, down) - 1
  const removal = Math.abs(up - down)
  const base = degree === 1 ? 'cousin' : `${ordinal(degree)} cousin`
  if (removal === 0) return base
  if (removal === 1) return `${base} once removed`
  if (removal === 2) return `${base} twice removed`
  return `${base} ${removal} times removed`
}

/** The English word for a descriptor. Gendered when the gender is known, neutral otherwise. */
export function labelFor(descriptor: RelationDescriptor, gender: Gender): string | null {
  switch (descriptor.kind) {
    case 'self':
      return null
    case 'partner': {
      const word = pick(gender, 'husband', 'wife', 'partner')
      return descriptor.ex ? `ex-${word}` : word
    }
    case 'blood':
      return bloodLabel(descriptor.up, descriptor.down, descriptor.half, gender)
    case 'step':
      return descriptor.direction === 'parent'
        ? pick(gender, 'stepfather', 'stepmother', 'step-parent')
        : pick(gender, 'stepson', 'stepdaughter', 'stepchild')
    case 'in-law':
      switch (descriptor.via) {
        case 'partner-parent':
          return pick(gender, 'father-in-law', 'mother-in-law', 'parent-in-law')
        case 'partner-sibling':
        case 'sibling-partner':
          return pick(gender, 'brother-in-law', 'sister-in-law', 'sibling-in-law')
        case 'child-partner':
          return pick(gender, 'son-in-law', 'daughter-in-law', 'child-in-law')
      }
      return null
    case 'uncle-partner':
      return pick(gender, 'uncle', 'aunt', 'uncle/aunt')
    case 'other':
      return 'Relative'
    case 'unconnected':
      return 'Not connected'
  }
}

// ---------------------------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------------------------

interface Candidate {
  up: number
  down: number
  via: string | undefined
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

  const assign = (id: string, descriptor: RelationDescriptor) => {
    if (result.has(id)) return
    result.set(id, { descriptor, label: labelFor(descriptor, gender.get(id) ?? 'unknown') })
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
    for (let i = 0; i < down.length; i++) {
      const [id, distance] = down[i]!
      if (id !== focusId) {
        const candidate: Candidate = { up, down: distance, via }
        const current = best.get(id)
        if (!current || better(candidate, current)) best.set(id, candidate)
      }
      for (const child of childrenOf.get(id) ?? []) {
        if (seen.has(child) || ancestors.has(child)) continue
        seen.add(child)
        down.push([child, distance + 1])
      }
    }
  }

  const focusParents = new Set(parentsOf.get(focusId) ?? [])
  for (const [id, { up, down, via }] of best) {
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
    assign(id, { kind: 'blood', up, down, half, ...(side ? { side } : {}) })
  }

  // 3. Step relatives (only from `step` links).
  for (const id of stepParentsOf.get(focusId) ?? []) assign(id, { kind: 'step', direction: 'parent' })
  for (const id of stepChildrenOf.get(focusId) ?? []) assign(id, { kind: 'step', direction: 'child' })

  // 4. In-laws, through current Partnerships only. Direct line before collateral.
  for (const partner of currentPartners(focusId)) {
    for (const parent of parentsOf.get(partner) ?? []) assign(parent, { kind: 'in-law', via: 'partner-parent' })
  }
  for (const child of childrenOf.get(focusId) ?? []) {
    for (const partner of currentPartners(child)) assign(partner, { kind: 'in-law', via: 'child-partner' })
  }
  for (const partner of currentPartners(focusId)) {
    for (const sibling of siblingsOf(partner)) assign(sibling, { kind: 'in-law', via: 'partner-sibling' })
  }
  for (const sibling of siblingsOf(focusId)) {
    for (const partner of currentPartners(sibling)) assign(partner, { kind: 'in-law', via: 'sibling-partner' })
  }
  for (const parent of parentsOf.get(focusId) ?? []) {
    for (const uncle of siblingsOf(parent)) {
      for (const partner of currentPartners(uncle)) assign(partner, { kind: 'uncle-partner' })
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
