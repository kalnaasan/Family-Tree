import type { Gender, ParentLink, Partnership, Person, Tree } from '../domain/schema.ts'

/** Small, fast, seedable PRNG (mulberry32). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

interface Couple {
  a: number
  /** null for a single parent */
  b: number | null
}

/**
 * A realistic family Tree of exactly `size` people, the same for the same seed. Used by the layout tests, the
 * benchmarks and the large-tree performance tests (sizes 15 / 150 / 500 / 1,000 / 5,000).
 *
 * It grows generation by generation from founding couples: couples have 1 to 3 children, most children partner
 * up (some partners are ended, some marry-ins are existing unpartnered relatives so the families connect), some
 * people have a second, ended partnership with children (half-siblings), a few raise children alone. The Focus
 * person is the most recently born child.
 */
export function generateTree(size: number, seed = 1): Tree {
  const random = createRandom(seed)
  const persons: Person[] = []
  const parentLinks: ParentLink[] = []
  const partnerships: Partnership[] = []
  const parentsOf: number[][] = []
  const unpartnered: number[] = [] // grown children without a partner yet: candidates to marry in
  const queue: Couple[] = []
  let lastChild = 0
  let partnershipCount = 0

  const full = () => persons.length >= size
  const pickGender = (): Gender => {
    const r = random()
    return r < 0.48 ? 'female' : r < 0.96 ? 'male' : r < 0.98 ? 'other' : 'unknown'
  }
  const addPerson = (generation: number): number => {
    const index = persons.length
    persons.push({
      id: uuid(index + 1),
      firstName: `P${index + 1}`,
      gender: pickGender(),
      deceased: generation < 2 && random() < 0.7,
    })
    parentsOf.push([])
    return index
  }
  const partner = (a: number, b: number, status: 'current' | 'ended') => {
    partnerships.push({
      id: uuid(0x100000 + partnershipCount++),
      personIds: [persons[a]!.id, persons[b]!.id],
      status,
    })
  }
  const addChild = (couple: Couple, generation: number): number => {
    const child = addPerson(generation)
    for (const parent of [couple.a, couple.b]) {
      if (parent === null) continue
      parentLinks.push({ childId: persons[child]!.id, parentId: persons[parent]!.id, kind: 'birth' })
      parentsOf[child]!.push(parent)
    }
    return child
  }

  const founders = 1 + Math.floor(size / 400)
  const foundCouple = () => {
    const a = addPerson(0)
    if (full()) return
    const b = addPerson(0)
    partner(a, b, 'current')
    queue.push({ a, b })
  }
  for (let f = 0; f < founders && !full(); f++) foundCouple()

  // generation of each queued couple, to keep `deceased` plausible
  const depth = new Map<number, number>()
  while (!full()) {
    const couple = queue.shift()
    if (couple === undefined) {
      foundCouple() // everyone ran out of children: start another family
      continue
    }
    const generation = (depth.get(couple.a) ?? 0) + 1
    const children = 1 + Math.floor(random() * 3)
    for (let k = 0; k < children && !full(); k++) {
      const child = addChild(couple, generation)
      lastChild = child
      depth.set(child, generation)
      const roll = random()
      if (roll < 0.75) {
        // partner: sometimes an existing unpartnered relative who is not a sibling, otherwise someone new
        let mate = -1
        if (random() < 0.25) {
          const candidates = unpartnered.filter(
            (u) => u !== child && !parentsOf[u]!.some((p) => parentsOf[child]!.includes(p)),
          )
          if (candidates.length > 0) {
            mate = candidates[Math.floor(random() * candidates.length)]!
            unpartnered.splice(unpartnered.indexOf(mate), 1)
          }
        }
        if (mate < 0) {
          if (full()) continue
          mate = addPerson(generation)
        }
        partner(child, mate, random() < 0.15 ? 'ended' : 'current')
        queue.push({ a: child, b: mate })
      } else if (roll < 0.85) {
        queue.push({ a: child, b: null })
      } else {
        unpartnered.push(child)
      }
    }
    // some people also had an earlier or later, ended partnership with children of its own (half-siblings)
    if (!full() && couple.b !== null && random() < 0.1) {
      const ex = addPerson(generation)
      partner(couple.a, ex, 'ended')
      queue.push({ a: couple.a, b: ex })
      depth.set(ex, generation - 1)
    }
  }

  return {
    focusPersonId: persons[lastChild]?.id ?? persons[0]?.id ?? null,
    persons,
    parentLinks,
    partnerships,
  }
}
