import type { Person } from '../domain/schema.ts'

const MAX_NAME_LENGTH = 18

/** "First Last", shortened with an ellipsis so a long name cannot overlap its neighbours. */
export function displayName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim()
  const letters = Array.from(full)
  return letters.length <= MAX_NAME_LENGTH ? full : `${letters.slice(0, MAX_NAME_LENGTH - 1).join('').trimEnd()}…`
}

export function initialOf(person: Pick<Person, 'firstName'>): string {
  return (Array.from(person.firstName.trim())[0] ?? '?').toUpperCase()
}

/** Years only, from partial ISO dates: "1962", "1930–2001", "d. 2001". Empty when nothing is known. */
export function lifeSpan(person: Pick<Person, 'birthDate' | 'deathDate'>): string {
  const birth = person.birthDate?.slice(0, 4)
  const death = person.deathDate?.slice(0, 4)
  if (birth && death) return `${birth}–${death}`
  if (death) return `d. ${death}`
  return birth ?? ''
}

/** A stable 32-bit hash of an id, used to give each Person their own leaves. */
export function hashId(id: string): number {
  let hash = 2166136261
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619)
  return hash >>> 0
}
