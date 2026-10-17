import type { RelationDescriptor } from './labels.ts'
import type { Gender } from './schema.ts'

/**
 * The English table of Relationship labels (spec section 3): a descriptor and the Person's gender in, a word out.
 * Pure and DOM-free. One module per language; the gender-neutral word is used when the gender is not known.
 */

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
export function labelForEnglish(descriptor: RelationDescriptor, gender: Gender): string | null {
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
