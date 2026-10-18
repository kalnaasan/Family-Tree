import type { RelationDescriptor } from './labels.ts'
import type { Gender } from './schema.ts'

/**
 * The Arabic table of Relationship labels (spec sections 3 and 13.6), row for row as in
 * docs/spec/arabic-relationship-labels.md: a descriptor and the Person's gender in, a word out. Pure and DOM-free.
 * Modern Standard Arabic. The words are a draft: the owner signs off every group of the table before Arabic is offered.
 *
 * Arabic has no neutral singular for most of these, so when the gender is not known both words are shown with a
 * slash; and when the descriptor does not say which uncle, sibling or parent a word comes through, a plainer word is
 * used (`قريب`, "relative") rather than a guess.
 */

type Blood = Extract<RelationDescriptor, { kind: 'blood' }>

/** The word for a man, for a woman, and for someone whose gender is not known (or is "other"). */
type Words = readonly [man: string, woman: string, unknown: string]

const pick = (gender: Gender, [man, woman, unknown]: Words) =>
  gender === 'male' ? man : gender === 'female' ? woman : unknown

const RELATIVE: Words = ['قريب', 'قريبة', 'قريب/قريبة']

const ORDINALS = ['', 'الأولى', 'الثانية', 'الثالثة', 'الرابعة', 'الخامسة', 'السادسة', 'السابعة', 'الثامنة', 'التاسعة', 'العاشرة']

/**
 * "of the third degree". For ancestors and descendants it is counted as Arabic inheritance law counts: a parent is
 * the first degree, a grandparent the second, a great-grandparent the third. For an uncle, a nephew or a cousin it
 * is the number of generations beyond the first step (a great-uncle and a second cousin are both "the second"; the
 * word before it tells them apart). Ten and below are words, above that the digits are written.
 */
const degree = (n: number) => ORDINALS[n] || String(n)

/** The same three words, each with its degree: "جد من الدرجة الثالثة". */
const withDegree = (words: Words, n: number): Words => [
  `${words[0]} من الدرجة ${degree(n)}`,
  `${words[1]} من الدرجة ${degree(n)}`,
  `${words[2]} من الدرجة ${degree(n)}`,
]

const PATERNAL_UNCLE: Words = ['عم', 'عمة', 'عم/عمة']
const MATERNAL_UNCLE: Words = ['خال', 'خالة', 'خال/خالة']

function uncleOrAunt(d: Blood): Words {
  const base = d.side === 'paternal' ? PATERNAL_UNCLE : d.side === 'maternal' ? MATERNAL_UNCLE : undefined
  if (d.up === 2) return base ?? ['عم أو خال', 'عمة أو خالة', 'عم/عمة أو خال/خالة']
  return withDegree(base ?? RELATIVE, d.up - 1)
}

function nephewOrNiece(d: Blood): Words {
  const base: Words =
    d.downFirst === 'male'
      ? ['ابن الأخ', 'ابنة الأخ', 'ولد الأخ']
      : d.downFirst === 'female'
        ? ['ابن الأخت', 'ابنة الأخت', 'ولد الأخت']
        : ['ابن الأخ/الأخت', 'ابنة الأخ/الأخت', 'ولد الأخ/الأخت']
  return d.down === 2 ? base : withDegree(base, d.down - 1)
}

function cousin(d: Blood): Words {
  // Arabic has no word for a cousin "removed" by a generation: that is only "a relative"
  if (d.up !== d.down) return RELATIVE
  const first = d.up - 1
  if (first >= 2) return [`ابن عم من الدرجة ${degree(first)}`, `ابنة عم من الدرجة ${degree(first)}`, `قريب/قريبة من الدرجة ${degree(first)}`]
  // a first cousin: the word follows the uncle or aunt they come through, and the side of the family
  if (d.side === 'paternal' && d.downFirst === 'male') return ['ابن عم', 'ابنة عم', 'ولد العم']
  if (d.side === 'paternal' && d.downFirst === 'female') return ['ابن عمة', 'ابنة عمة', 'ولد العمة']
  if (d.side === 'maternal' && d.downFirst === 'male') return ['ابن خال', 'ابنة خال', 'ولد الخال']
  if (d.side === 'maternal' && d.downFirst === 'female') return ['ابن خالة', 'ابنة خالة', 'ولد الخالة']
  return RELATIVE
}

function blood(d: Blood): Words {
  if (d.down === 0) {
    if (d.up === 1) return ['أب', 'أم', 'أحد الوالدين']
    const grandparent: Words = ['جد', 'جدة', 'جد/جدة']
    return d.up === 2 ? grandparent : withDegree(grandparent, d.up)
  }
  if (d.up === 0) {
    if (d.down === 1) return ['ابن', 'ابنة', 'ولد']
    const grandchild: Words = ['حفيد', 'حفيدة', 'حفيد/حفيدة']
    return d.down === 2 ? grandchild : withDegree(grandchild, d.down)
  }
  if (d.up === 1 && d.down === 1) {
    if (!d.half) return ['أخ', 'أخت', 'أخ/أخت']
    if (d.sharedParent === 'male') return ['أخ لأب', 'أخت لأب', 'أخ/أخت لأب']
    if (d.sharedParent === 'female') return ['أخ لأم', 'أخت لأم', 'أخ/أخت لأم']
    return ['أخ غير شقيق', 'أخت غير شقيقة', 'أخ/أخت غير شقيق/شقيقة']
  }
  if (d.down === 1) return uncleOrAunt(d)
  if (d.up === 1) return nephewOrNiece(d)
  return cousin(d)
}

/** "of the husband", "of the wife", "of the partner": by the gender of the partner an in-law comes through. */
const partnerWord = (link: Gender | undefined) => (link === 'male' ? 'الزوج' : link === 'female' ? 'الزوجة' : 'الشريك')

/** The word for the uncle or aunt whose partner this is, or nothing when the descriptor does not say which. */
function uncleWord(side: 'paternal' | 'maternal' | undefined, uncle: Gender | undefined): string | undefined {
  if (side === 'paternal') return uncle === 'male' ? 'العم' : uncle === 'female' ? 'العمة' : undefined
  if (side === 'maternal') return uncle === 'male' ? 'الخال' : uncle === 'female' ? 'الخالة' : undefined
  return undefined
}

/** The Arabic word for a descriptor. Gendered when the gender is known, neutral otherwise. */
export function labelForArabic(descriptor: RelationDescriptor, gender: Gender): string | null {
  switch (descriptor.kind) {
    case 'self':
      return null
    case 'partner':
      return pick(gender, descriptor.ex ? ['زوج سابق', 'زوجة سابقة', 'شريك سابق'] : ['زوج', 'زوجة', 'شريك الحياة'])
    case 'blood':
      return pick(gender, blood(descriptor))
    case 'step':
      return pick(
        gender,
        descriptor.direction === 'parent' ? ['زوج الأم', 'زوجة الأب', 'زوج الأم/زوجة الأب'] : ['ربيب', 'ربيبة', 'ربيب/ربيبة'],
      )
    case 'in-law':
      switch (descriptor.via) {
        case 'partner-parent':
          return pick(gender, ['حم', 'حماة', 'حم/حماة'])
        case 'child-partner': {
          const child = descriptor.link === 'male' ? 'الابن' : descriptor.link === 'female' ? 'الابنة' : 'الولد'
          return pick(gender, [`زوج ${child}`, `زوجة ${child}`, `شريك ${child}`])
        }
        case 'partner-sibling': {
          const partner = partnerWord(descriptor.link)
          return pick(gender, [`شقيق ${partner}`, `شقيقة ${partner}`, `شقيق/شقيقة ${partner}`])
        }
        case 'sibling-partner': {
          const sibling = descriptor.link === 'male' ? 'الأخ' : descriptor.link === 'female' ? 'الأخت' : 'الأخ/الأخت'
          return pick(gender, [`زوج ${sibling}`, `زوجة ${sibling}`, `شريك ${sibling}`])
        }
      }
      return null
    case 'uncle-partner': {
      const uncle = uncleWord(descriptor.side, descriptor.uncle)
      return pick(gender, uncle ? [`زوج ${uncle}`, `زوجة ${uncle}`, `شريك ${uncle}`] : RELATIVE)
    }
    case 'other':
      return pick(gender, RELATIVE)
    case 'unconnected':
      return pick(gender, ['غير مرتبط', 'غير مرتبطة', 'غير مرتبط/ة'])
  }
}
