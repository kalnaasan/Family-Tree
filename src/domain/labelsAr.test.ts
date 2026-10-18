import { describe, expect, it } from 'vitest'
import { type RelationDescriptor, labelFor } from './labels.ts'
import type { Gender } from './schema.ts'

/** The Arabic word for a descriptor, as the table in docs/spec/arabic-relationship-labels.md has it. */
const ar = (descriptor: RelationDescriptor, gender: Gender = 'unknown') => labelFor(descriptor, gender, 'ar')
const blood = (up: number, down: number, rest: Partial<Extract<RelationDescriptor, { kind: 'blood' }>> = {}): RelationDescriptor => ({
  kind: 'blood',
  up,
  down,
  half: false,
  ...rest,
})
/** All three words of a row: for a man, a woman and someone whose gender is not known. */
const row = (descriptor: RelationDescriptor) => [ar(descriptor, 'male'), ar(descriptor, 'female'), ar(descriptor, 'unknown')]

describe('Arabic relationship labels', () => {
  it('has no label for the Focus person', () => {
    expect(ar({ kind: 'self' })).toBeNull()
  })

  it('partners: married or not, and former ("former", not "divorced")', () => {
    expect(row({ kind: 'partner', ex: false })).toEqual(['زوج', 'زوجة', 'شريك الحياة'])
    expect(row({ kind: 'partner', ex: true })).toEqual(['زوج سابق', 'زوجة سابقة', 'شريك سابق'])
  })

  it('parents, children and siblings', () => {
    expect(row(blood(1, 0))).toEqual(['أب', 'أم', 'أحد الوالدين'])
    expect(row(blood(0, 1))).toEqual(['ابن', 'ابنة', 'ولد'])
    expect(row(blood(1, 1))).toEqual(['أخ', 'أخت', 'أخ/أخت'])
  })

  describe('half-siblings name the parent they share', () => {
    it('a shared father, a shared mother, and neither known', () => {
      expect(row(blood(1, 1, { half: true, sharedParent: 'male' }))).toEqual(['أخ لأب', 'أخت لأب', 'أخ/أخت لأب'])
      expect(row(blood(1, 1, { half: true, sharedParent: 'female' }))).toEqual(['أخ لأم', 'أخت لأم', 'أخ/أخت لأم'])
      expect(row(blood(1, 1, { half: true, sharedParent: 'unknown' }))).toEqual(['أخ غير شقيق', 'أخت غير شقيقة', 'أخ/أخت غير شقيق'])
      expect(row(blood(1, 1, { half: true }))).toEqual(['أخ غير شقيق', 'أخت غير شقيقة', 'أخ/أخت غير شقيق'])
    })
  })

  describe('grandparents, grandchildren, and the degree form past them', () => {
    it('uses the real words for the first step', () => {
      expect(row(blood(2, 0))).toEqual(['جد', 'جدة', 'جد/جدة'])
      expect(row(blood(0, 2))).toEqual(['حفيد', 'حفيدة', 'حفيد/حفيدة'])
    })
    it('counts the degree as Arabic inheritance law does: a great-grandparent is the third', () => {
      expect(row(blood(3, 0))).toEqual(['جد من الدرجة الثالثة', 'جدة من الدرجة الثالثة', 'جد/جدة من الدرجة الثالثة'])
      expect(ar(blood(4, 0), 'male')).toBe('جد من الدرجة الرابعة')
      expect(ar(blood(0, 3), 'female')).toBe('حفيدة من الدرجة الثالثة')
      expect(ar(blood(0, 5), 'male')).toBe('حفيد من الدرجة الخامسة')
    })
    it('writes the digits above ten, where there is no word', () => {
      expect(ar(blood(12, 0), 'male')).toBe('جد من الدرجة 12')
      expect(ar(blood(10, 0), 'female')).toBe('جدة من الدرجة العاشرة')
    })
  })

  describe('uncles and aunts: the side of the family changes the word', () => {
    it('paternal, maternal, and the side not known', () => {
      expect(row(blood(2, 1, { side: 'paternal' }))).toEqual(['عم', 'عمة', 'عم/عمة'])
      expect(row(blood(2, 1, { side: 'maternal' }))).toEqual(['خال', 'خالة', 'خال/خالة'])
      expect(row(blood(2, 1))).toEqual(['عم أو خال', 'عمة أو خالة', 'عم/عمة أو خال/خالة'])
    })
    it('a great-uncle takes the degree form', () => {
      expect(ar(blood(3, 1, { side: 'paternal' }), 'male')).toBe('عم من الدرجة الثانية')
      expect(ar(blood(4, 1, { side: 'maternal' }), 'female')).toBe('خالة من الدرجة الثالثة')
      expect(ar(blood(3, 1), 'male')).toBe('قريب من الدرجة الثانية')
    })
  })

  describe('nephews and nieces come through a brother or a sister', () => {
    it('through a brother, a sister, and a sibling whose gender is not known', () => {
      expect(row(blood(1, 2, { downFirst: 'male' }))).toEqual(['ابن الأخ', 'ابنة الأخ', 'ولد الأخ'])
      expect(row(blood(1, 2, { downFirst: 'female' }))).toEqual(['ابن الأخت', 'ابنة الأخت', 'ولد الأخت'])
      expect(row(blood(1, 2))).toEqual(['ابن الأخ/الأخت', 'ابنة الأخ/الأخت', 'ولد الأخ/الأخت'])
    })
    it('a grandnephew takes the degree form', () => {
      expect(ar(blood(1, 3, { downFirst: 'male' }), 'male')).toBe('ابن الأخ من الدرجة الثانية')
      expect(ar(blood(1, 4, { downFirst: 'female' }), 'female')).toBe('ابنة الأخت من الدرجة الثالثة')
    })
  })

  describe('cousins: the word follows the uncle or aunt they come through', () => {
    it("through a father's brother or sister, a mother's brother or sister", () => {
      expect(row(blood(2, 2, { side: 'paternal', downFirst: 'male' }))).toEqual(['ابن عم', 'ابنة عم', 'ولد العم'])
      expect(row(blood(2, 2, { side: 'paternal', downFirst: 'female' }))).toEqual(['ابن عمة', 'ابنة عمة', 'ولد العمة'])
      expect(row(blood(2, 2, { side: 'maternal', downFirst: 'male' }))).toEqual(['ابن خال', 'ابنة خال', 'ولد الخال'])
      expect(row(blood(2, 2, { side: 'maternal', downFirst: 'female' }))).toEqual(['ابن خالة', 'ابنة خالة', 'ولد الخالة'])
    })
    it("falls back to \"relative\" when the side or the uncle's gender is not known", () => {
      expect(row(blood(2, 2))).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
      expect(row(blood(2, 2, { side: 'paternal' }))).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
      expect(row(blood(2, 2, { downFirst: 'male' }))).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
    })
    it('a second or further cousin takes the degree form', () => {
      expect(row(blood(3, 3, { side: 'paternal', downFirst: 'male' }))).toEqual([
        'ابن عم من الدرجة الثانية',
        'ابنة عم من الدرجة الثانية',
        'قريب/قريبة من الدرجة الثانية',
      ])
      expect(ar(blood(5, 5), 'male')).toBe('ابن عم من الدرجة الرابعة')
    })
    it('a "removed" cousin, which Arabic has no word for, is just a relative', () => {
      for (const [up, down] of [[2, 3], [3, 2], [2, 4], [3, 5]] as const) {
        expect(row(blood(up, down, { side: 'paternal', downFirst: 'male' }))).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
      }
    })
  })

  it('step relatives (dormant in the interface)', () => {
    expect(row({ kind: 'step', direction: 'parent' })).toEqual(['زوج الأم', 'زوجة الأب', 'زوج الأم/زوجة الأب'])
    expect(row({ kind: 'step', direction: 'child' })).toEqual(['ربيب', 'ربيبة', 'ربيب/ربيبة'])
  })

  describe('in-laws', () => {
    it('parents-in-law use the two short words, with the slash form when unknown', () => {
      expect(row({ kind: 'in-law', via: 'partner-parent', link: 'female' })).toEqual(['حم', 'حماة', 'حم/حماة'])
    })
    it("a child's partner is \"the husband or wife of the son or the daughter\", and works for any couple", () => {
      expect(row({ kind: 'in-law', via: 'child-partner', link: 'male' })).toEqual(['زوج الابن', 'زوجة الابن', 'شريك الابن'])
      expect(row({ kind: 'in-law', via: 'child-partner', link: 'female' })).toEqual(['زوج الابنة', 'زوجة الابنة', 'شريك الابنة'])
      expect(row({ kind: 'in-law', via: 'child-partner', link: 'unknown' })).toEqual(['زوج الولد', 'زوجة الولد', 'شريك الولد'])
    })
    it("a partner's sibling is the sibling of the husband, the wife, or the partner", () => {
      expect(row({ kind: 'in-law', via: 'partner-sibling', link: 'male' })).toEqual(['شقيق الزوج', 'شقيقة الزوج', 'شقيق/شقيقة الزوج'])
      expect(row({ kind: 'in-law', via: 'partner-sibling', link: 'female' })).toEqual(['شقيق الزوجة', 'شقيقة الزوجة', 'شقيق/شقيقة الزوجة'])
      expect(row({ kind: 'in-law', via: 'partner-sibling', link: 'unknown' })).toEqual(['شقيق الشريك', 'شقيقة الشريك', 'شقيق/شقيقة الشريك'])
    })
    it("a sibling's partner is the husband or wife of the brother or the sister", () => {
      expect(row({ kind: 'in-law', via: 'sibling-partner', link: 'male' })).toEqual(['زوج الأخ', 'زوجة الأخ', 'شريك الأخ'])
      expect(row({ kind: 'in-law', via: 'sibling-partner', link: 'female' })).toEqual(['زوج الأخت', 'زوجة الأخت', 'شريك الأخت'])
      expect(row({ kind: 'in-law', via: 'sibling-partner', link: 'unknown' })).toEqual(['زوج الأخ/الأخت', 'زوجة الأخ/الأخت', 'شريك الأخ/الأخت'])
    })
    it('never uses the ambiguous single words', () => {
      const all = (['partner-parent', 'partner-sibling', 'sibling-partner', 'child-partner'] as const).flatMap((via) =>
        (['male', 'female', 'unknown'] as const).flatMap((link) => row({ kind: 'in-law', via, link })),
      )
      for (const word of ['حمو', 'صهر', 'نسيب', 'عديل', 'سلفة']) {
        expect(all.some((label) => label?.split(' ').includes(word))).toBe(false)
      }
    })
  })

  describe('the partner of an uncle or aunt, in the literal form', () => {
    it("by the uncle's or aunt's side and gender", () => {
      expect(row({ kind: 'uncle-partner', side: 'paternal', uncle: 'male' })).toEqual(['زوج العم', 'زوجة العم', 'شريك العم'])
      expect(row({ kind: 'uncle-partner', side: 'paternal', uncle: 'female' })).toEqual(['زوج العمة', 'زوجة العمة', 'شريك العمة'])
      expect(row({ kind: 'uncle-partner', side: 'maternal', uncle: 'male' })).toEqual(['زوج الخال', 'زوجة الخال', 'شريك الخال'])
      expect(row({ kind: 'uncle-partner', side: 'maternal', uncle: 'female' })).toEqual(['زوج الخالة', 'زوجة الخالة', 'شريك الخالة'])
    })
    it('falls back to "relative" when the side or the gender is not known', () => {
      expect(row({ kind: 'uncle-partner', uncle: 'male' })).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
      expect(row({ kind: 'uncle-partner', side: 'paternal' })).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
    })
  })

  it('the fallbacks', () => {
    expect(row({ kind: 'other' })).toEqual(['قريب', 'قريبة', 'قريب/قريبة'])
    expect(row({ kind: 'unconnected' })).toEqual(['غير مرتبط', 'غير مرتبطة', 'غير مرتبط/ة'])
  })

  describe('every descriptor gets an Arabic word, and never an English one', () => {
    const genders: Gender[] = ['male', 'female', 'other', 'unknown']
    const known: (Gender | undefined)[] = [undefined, ...genders]
    const sides = [undefined, 'paternal', 'maternal'] as const

    const descriptors = function* (): Generator<RelationDescriptor> {
      yield { kind: 'self' }
      for (const ex of [false, true]) yield { kind: 'partner', ex }
      for (const up of [0, 1, 2, 3, 4, 5, 12]) {
        for (const down of [0, 1, 2, 3, 4, 5, 12]) {
          if (up === 0 && down === 0) continue
          for (const half of [false, true]) {
            for (const side of sides) {
              for (const sharedParent of known) {
                for (const downFirst of known) {
                  yield { kind: 'blood', up, down, half, ...(side ? { side } : {}), sharedParent, downFirst }
                }
              }
            }
          }
        }
      }
      for (const direction of ['parent', 'child'] as const) yield { kind: 'step', direction }
      for (const via of ['partner-parent', 'partner-sibling', 'sibling-partner', 'child-partner'] as const) {
        for (const link of known) yield { kind: 'in-law', via, link }
      }
      for (const side of sides) for (const uncle of known) yield { kind: 'uncle-partner', ...(side ? { side } : {}), uncle }
      yield { kind: 'other' }
      yield { kind: 'unconnected' }
    }

    it('is not empty, has no Latin letter and no placeholder', () => {
      let checked = 0
      for (const descriptor of descriptors()) {
        for (const gender of genders) {
          const word = ar(descriptor, gender)
          if (descriptor.kind === 'self') {
            expect(word).toBeNull()
            continue
          }
          if (!word || /[A-Za-z{}]/.test(word)) throw new Error(`${JSON.stringify(descriptor)} for ${gender} gave ${JSON.stringify(word)}`)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(20000)
    })
  })
})
