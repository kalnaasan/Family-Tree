import { describe, expect, it } from 'vitest'
import { assertTreeIntegrity } from './integrity.ts'
import { type RelationDescriptor, deriveRelationships, labelFor } from './labels.ts'
import type { Gender, ParentLinkKind, Tree } from './schema.ts'

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

interface Spec {
  focus: string
  people: Record<string, Gender>
  /** [child, parent, kind?] */
  parents?: [string, string, ParentLinkKind?][]
  /** [a, b, status?] */
  partners?: [string, string, ('current' | 'ended')?][]
}

function family(spec: Spec) {
  const names = Object.keys(spec.people)
  const ids = Object.fromEntries(names.map((name, i) => [name, uuid(i + 1)])) as Record<string, string>
  const tree: Tree = {
    focusPersonId: ids[spec.focus]!,
    persons: names.map((name) => ({ id: ids[name]!, firstName: name, gender: spec.people[name]!, deceased: false })),
    parentLinks: (spec.parents ?? []).map(([child, parent, kind = 'birth']) => ({
      childId: ids[child]!,
      parentId: ids[parent]!,
      kind,
    })),
    partnerships: (spec.partners ?? []).map(([a, b, status = 'current'], i) => ({
      id: uuid(1000 + i),
      personIds: [ids[a]!, ids[b]!] as [string, string],
      status,
    })),
  }
  assertTreeIntegrity(tree) // fixtures must themselves be valid
  const relationships = deriveRelationships(tree)
  return {
    ids,
    labels: (...who: string[]) =>
      who.map((name) => {
        const relationship = relationships.get(ids[name]!)
        return relationship && labelFor(relationship.descriptor, spec.people[name]!, 'en')
      }),
    rel: (name: string) => relationships.get(ids[name]!)!,
  }
}

describe('direct line', () => {
  it('names ancestors with unlimited great- prefixes', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Mom: 'female', GF: 'male', GM: 'female', GGF: 'male', GGGM: 'female' },
      parents: [['Me', 'Dad'], ['Me', 'Mom'], ['Dad', 'GF'], ['Dad', 'GM'], ['GF', 'GGF'], ['GGF', 'GGGM']],
    })
    expect(f.labels('Dad', 'Mom', 'GF', 'GM', 'GGF', 'GGGM')).toEqual([
      'father',
      'mother',
      'grandfather',
      'grandmother',
      'great-grandfather',
      'great-great-grandmother',
    ])
  })

  it('names descendants with unlimited great- prefixes', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Kid: 'male', GKid: 'female', GGKid: 'male', GGGKid: 'female' },
      parents: [['Kid', 'Me'], ['GKid', 'Kid'], ['GGKid', 'GKid'], ['GGGKid', 'GGKid']],
    })
    expect(f.labels('Kid', 'GKid', 'GGKid', 'GGGKid')).toEqual([
      'son',
      'granddaughter',
      'great-grandson',
      'great-great-granddaughter',
    ])
  })

  it('uses neutral words for other and unknown gender', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', P1: 'unknown', P2: 'other', C: 'unknown', S: 'other', GP: 'unknown' },
      parents: [['Me', 'P1'], ['Me', 'P2'], ['C', 'Me'], ['S', 'P1'], ['S', 'P2'], ['P1', 'GP']],
    })
    expect(f.labels('P1', 'P2', 'C', 'S', 'GP')).toEqual(['parent', 'parent', 'child', 'sibling', 'grandparent'])
  })

  it('shows no label for the Focus person', () => {
    const f = family({ focus: 'Me', people: { Me: 'female' } })
    expect(f.rel('Me')).toEqual({ descriptor: { kind: 'self' } })
    expect(labelFor({ kind: 'self' }, 'female', 'en')).toBeNull()
  })

  it('returns nothing without a Focus person', () => {
    const tree: Tree = { focusPersonId: null, persons: [], parentLinks: [], partnerships: [] }
    expect(deriveRelationships(tree).size).toBe(0)
  })
})

describe('siblings and half-siblings', () => {
  const people: Record<string, Gender> = { Me: 'female', Dad: 'male', Mom: 'female', X: 'male', Y: 'female' }

  it('names full siblings by gender', () => {
    const f = family({
      focus: 'Me',
      people: { ...people, Bro: 'male', Sis: 'female', Sib: 'unknown' },
      parents: [
        ['Me', 'Dad'], ['Me', 'Mom'],
        ['Bro', 'Dad'], ['Bro', 'Mom'],
        ['Sis', 'Dad'], ['Sis', 'Mom'],
        ['Sib', 'Dad'], ['Sib', 'Mom'],
      ],
    })
    expect(f.labels('Bro', 'Sis', 'Sib')).toEqual(['brother', 'sister', 'sibling'])
  })

  it('calls a sibling with exactly one shared parent a half-sibling', () => {
    const f = family({
      focus: 'Me',
      people: { ...people, HalfBro: 'male', HalfSis: 'female', HalfSib: 'unknown' },
      parents: [
        ['Me', 'Dad'], ['Me', 'Mom'],
        ['HalfBro', 'Dad'], ['HalfBro', 'Y'],
        ['HalfSis', 'Mom'], ['HalfSis', 'X'],
        ['HalfSib', 'Dad'], ['HalfSib', 'Y'],
      ],
    })
    expect(f.labels('HalfBro', 'HalfSis', 'HalfSib')).toEqual(['half-brother', 'half-sister', 'half-sibling'])
  })

  it('does not call two people half-siblings when both record only the same single parent', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Mom: 'female', Bro: 'male' },
      parents: [['Me', 'Mom'], ['Bro', 'Mom']],
    })
    expect(f.labels('Bro')).toEqual(['brother'])
  })

  it('calls the sibling a half-sibling when the Focus person has a second parent they do not share', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Mom: 'female', Bro: 'male' },
      parents: [['Me', 'Dad'], ['Me', 'Mom'], ['Bro', 'Mom']],
    })
    expect(f.labels('Bro')).toEqual(['half-brother'])
  })

  it('reads adoptive links like birth links', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', AdoptiveMom: 'female', AdoptedBro: 'male' },
      parents: [['Me', 'AdoptiveMom', 'adoptive'], ['AdoptedBro', 'AdoptiveMom', 'adoptive']],
    })
    expect(f.labels('AdoptiveMom', 'AdoptedBro')).toEqual(['mother', 'brother'])
  })
})

describe('uncles, aunts, nephews and nieces', () => {
  it('names uncles, aunts and great-uncles', () => {
    const f = family({
      focus: 'Me',
      people: {
        Me: 'female', Dad: 'male', GF: 'male', GGF: 'male',
        Uncle: 'male', Aunt: 'female', GreatUncle: 'male', Unc: 'unknown',
      },
      parents: [
        ['Me', 'Dad'], ['Dad', 'GF'], ['Uncle', 'GF'], ['Aunt', 'GF'], ['Unc', 'GF'],
        ['GF', 'GGF'], ['GreatUncle', 'GGF'],
      ],
    })
    expect(f.labels('Uncle', 'Aunt', 'Unc', 'GreatUncle')).toEqual(['uncle', 'aunt', 'uncle/aunt', 'great-uncle'])
  })

  it('names nephews, nieces and their descendants', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Sis: 'female', Nephew: 'male', Niece: 'female', GN: 'male', GGN: 'female' },
      parents: [['Me', 'Dad'], ['Sis', 'Dad'], ['Nephew', 'Sis'], ['Niece', 'Sis'], ['GN', 'Nephew'], ['GGN', 'GN']],
    })
    expect(f.labels('Nephew', 'Niece', 'GN', 'GGN')).toEqual(['nephew', 'niece', 'grandnephew', 'great-grandniece'])
  })

  it('records the paternal or maternal side from the parent the line runs through', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Mom: 'female', GF: 'male', MGF: 'male', DadBro: 'male', MomSis: 'female' },
      parents: [['Me', 'Dad'], ['Me', 'Mom'], ['Dad', 'GF'], ['DadBro', 'GF'], ['Mom', 'MGF'], ['MomSis', 'MGF']],
    })
    expect(f.rel('DadBro').descriptor).toMatchObject({ kind: 'blood', up: 2, down: 1, side: 'paternal' })
    expect(f.rel('MomSis').descriptor).toMatchObject({ kind: 'blood', up: 2, down: 1, side: 'maternal' })

    const unknownParent = family({
      focus: 'Me',
      people: { Me: 'female', P: 'unknown', PGP: 'male', PSib: 'male' },
      parents: [['Me', 'P'], ['P', 'PGP'], ['PSib', 'PGP']],
    })
    expect(unknownParent.rel('PSib').descriptor).not.toHaveProperty('side')
  })
})

describe('cousins', () => {
  const cases: [number, number, string][] = [
    [2, 2, 'cousin'],
    [2, 3, 'cousin once removed'],
    [3, 2, 'cousin once removed'],
    [2, 4, 'cousin twice removed'],
    [2, 5, 'cousin 3 times removed'],
    [3, 3, '2nd cousin'],
    [3, 4, '2nd cousin once removed'],
    [4, 4, '3rd cousin'],
    [5, 5, '4th cousin'],
    [12, 12, '11th cousin'],
    [13, 13, '12th cousin'],
    [14, 14, '13th cousin'],
    [22, 22, '21st cousin'],
    [23, 23, '22nd cousin'],
    [24, 24, '23rd cousin'],
  ]
  it.each(cases)('(up %i, down %i) is "%s"', (up, down, expected) => {
    const descriptor: RelationDescriptor = { kind: 'blood', up, down, half: false }
    expect(labelFor(descriptor, 'unknown', 'en')).toBe(expected)
    expect(labelFor(descriptor, 'female', 'en')).toBe(expected) // cousins are not gendered
  })

  it('derives a first cousin and a cousin once removed from links', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', GF: 'male', Uncle: 'male', Cousin: 'female', CousinKid: 'male' },
      parents: [['Me', 'Dad'], ['Dad', 'GF'], ['Uncle', 'GF'], ['Cousin', 'Uncle'], ['CousinKid', 'Cousin']],
    })
    expect(f.labels('Cousin', 'CousinKid')).toEqual(['cousin', 'cousin once removed'])
  })

  it('derives a 2nd cousin through great-grandparents', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', GF: 'male', GGF: 'male', GU: 'male', GC: 'female', SC: 'male' },
      parents: [['Me', 'Dad'], ['Dad', 'GF'], ['GF', 'GGF'], ['GU', 'GGF'], ['GC', 'GU'], ['SC', 'GC']],
    })
    expect(f.labels('SC')).toEqual(['2nd cousin'])
  })
})

describe('partners', () => {
  it('uses wife and husband whenever the gender is known, whatever the focus person is', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'female', W: 'female', H: 'male', P: 'other', U: 'unknown' },
      partners: [['Me', 'W'], ['Me', 'H'], ['Me', 'P'], ['Me', 'U']],
    })
    expect(f.labels('W', 'H', 'P', 'U')).toEqual(['wife', 'husband', 'partner', 'partner'])
  })

  it('prefixes ex- for ended Partnerships', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'male', W: 'female', H: 'male', P: 'other' },
      partners: [['Me', 'W', 'ended'], ['Me', 'H', 'ended'], ['Me', 'P', 'ended']],
    })
    expect(f.labels('W', 'H', 'P')).toEqual(['ex-wife', 'ex-husband', 'ex-partner'])
  })

  it('lets the current Partnership win if a pair somehow has both', () => {
    // The integrity rules forbid this, so build the Tree directly: derivation must still be sane.
    const [me, w] = [uuid(1), uuid(2)]
    const tree: Tree = {
      focusPersonId: me,
      persons: [
        { id: me, firstName: 'Me', gender: 'male', deceased: false },
        { id: w, firstName: 'W', gender: 'female', deceased: false },
      ],
      parentLinks: [],
      partnerships: [
        { id: uuid(2000), personIds: [me, w], status: 'ended' },
        { id: uuid(2001), personIds: [w, me], status: 'current' },
      ],
    }
    const wife = deriveRelationships(tree).get(w)!.descriptor
    expect(wife).toEqual({ kind: 'partner', ex: false })
    expect(labelFor(wife, 'female', 'en')).toBe('wife')
  })

  it('labels a partner as partner even when they are also a cousin', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'male', Dad: 'male', GF: 'male', Uncle: 'male', Cousin: 'female' },
      parents: [['Me', 'Dad'], ['Dad', 'GF'], ['Uncle', 'GF'], ['Cousin', 'Uncle']],
      partners: [['Me', 'Cousin']],
    })
    expect(f.labels('Cousin')).toEqual(['wife'])
  })
})

describe('in-laws', () => {
  const base: Spec = {
    focus: 'Me',
    people: {
      Me: 'male', Spouse: 'female', SP: 'male', SM: 'female', SB: 'male',
      Dad: 'male', Sis: 'female', SisHusband: 'male', Kid: 'female', KidHusband: 'male',
      GF: 'male', Uncle: 'male', UncleWife: 'female',
    },
    parents: [
      ['Spouse', 'SP'], ['Spouse', 'SM'], ['SB', 'SP'], ['SB', 'SM'],
      ['Me', 'Dad'], ['Sis', 'Dad'], ['Kid', 'Me'], ['Dad', 'GF'], ['Uncle', 'GF'],
    ],
    partners: [['Me', 'Spouse'], ['Sis', 'SisHusband'], ['Kid', 'KidHusband'], ['Uncle', 'UncleWife']],
  }

  it('covers exactly the supported in-laws through current Partnerships', () => {
    const f = family(base)
    expect(f.labels('SP', 'SM', 'SB', 'SisHusband', 'KidHusband', 'UncleWife')).toEqual([
      'father-in-law',
      'mother-in-law',
      'brother-in-law',
      'brother-in-law',
      'son-in-law',
      'aunt',
    ])
  })

  it('uses gendered and neutral words', () => {
    const f = family({
      ...base,
      people: { ...base.people, SP: 'unknown', SB: 'female', SisHusband: 'other', KidHusband: 'unknown' },
    })
    expect(f.labels('SP', 'SB', 'SisHusband', 'KidHusband')).toEqual([
      'parent-in-law',
      'sister-in-law',
      'sibling-in-law',
      'child-in-law',
    ])
  })

  it('gives no in-law labels through an ended Partnership, and shows the path', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'male', Ex: 'female', ExMom: 'female', ExSib: 'male' },
      parents: [['Ex', 'ExMom'], ['ExSib', 'ExMom']],
      partners: [['Me', 'Ex', 'ended']],
    })
    expect(f.labels('Ex', 'ExMom', 'ExSib')).toEqual(['ex-wife', 'Relative', 'Relative'])
    expect(f.rel('ExMom').path).toEqual([f.ids.Me, f.ids.Ex, f.ids.ExMom])
    expect(f.rel('ExSib').path).toEqual([f.ids.Me, f.ids.Ex, f.ids.ExMom, f.ids.ExSib])
  })

  it('prefers blood over in-law', () => {
    const f = family({
      focus: 'Me',
      people: { Me: 'male', Dad: 'male', GF: 'male', Uncle: 'male', Spouse: 'female', SB: 'male' },
      parents: [['Me', 'Dad'], ['Dad', 'GF'], ['Uncle', 'GF'], ['Spouse', 'Uncle'], ['SB', 'Uncle']],
      partners: [['Me', 'Spouse']],
    })
    // SB is the partner's brother (brother-in-law) and also Me's cousin: blood wins.
    expect(f.labels('SB')).toEqual(['cousin'])
  })
})

describe('priority and step relations', () => {
  it('prefers the direct line over a collateral path', () => {
    // Kid is Me's child and also the child of Me's sister (so Me's nephew by that path).
    const f = family({
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Sis: 'female', Kid: 'male' },
      parents: [['Me', 'Dad'], ['Sis', 'Dad'], ['Kid', 'Me'], ['Kid', 'Sis']],
    })
    expect(f.labels('Kid')).toEqual(['son'])
  })

  it('takes step relations only from step Parent links', () => {
    const f = family({
      focus: 'Me',
      people: {
        Me: 'female', StepDad: 'male', StepMom: 'unknown', StepKid: 'female',
        StepDadKid: 'male', Spouse: 'male', SpouseKid: 'female',
      },
      parents: [
        ['Me', 'StepDad', 'step'], ['Me', 'StepMom', 'step'], ['StepKid', 'Me', 'step'],
        ['StepDadKid', 'StepDad'], ['SpouseKid', 'Spouse'],
      ],
      partners: [['Me', 'Spouse']],
    })
    expect(f.labels('StepDad', 'StepMom', 'StepKid')).toEqual(['stepfather', 'step-parent', 'stepdaughter'])
    // a stepparent's own child is not a sibling, and a partner's child is not inferred to be a stepchild
    expect(f.labels('StepDadKid', 'SpouseKid')).toEqual(['Relative', 'Relative'])
    expect(f.rel('SpouseKid').path).toEqual([f.ids.Me, f.ids.Spouse, f.ids.SpouseKid])
  })
})

describe('fallback', () => {
  it('shows Relative with a path for unsupported relations, and Not connected for separate parts', () => {
    const f = family({
      focus: 'Me',
      people: {
        Me: 'female', Dad: 'male', GF: 'male', GFPartner: 'female', DadPartner: 'female',
        Stranger: 'male', StrangerKid: 'female',
      },
      parents: [['Me', 'Dad'], ['Dad', 'GF'], ['StrangerKid', 'Stranger']],
      partners: [['GF', 'GFPartner'], ['Dad', 'DadPartner']],
    })
    expect(f.labels('GFPartner', 'DadPartner', 'Stranger', 'StrangerKid')).toEqual([
      'Relative',
      'Relative',
      'Not connected',
      'Not connected',
    ])
    expect(f.rel('GFPartner').path).toEqual([f.ids.Me, f.ids.Dad, f.ids.GF, f.ids.GFPartner])
    expect(f.rel('Stranger').path).toBeUndefined()
  })

  it('changes every label when the Focus person changes', () => {
    const spec: Spec = {
      focus: 'Me',
      people: { Me: 'female', Dad: 'male', Kid: 'male' },
      parents: [['Me', 'Dad'], ['Kid', 'Me']],
    }
    expect(family(spec).labels('Dad', 'Kid')).toEqual(['father', 'son'])
    expect(family({ ...spec, focus: 'Dad' }).labels('Me', 'Kid')).toEqual(['daughter', 'grandson'])
  })
})

describe('size', () => {
  it('labels a 5,000-person tree quickly and completely', () => {
    const people = 5000
    const tree: Tree = {
      focusPersonId: uuid(people),
      persons: Array.from({ length: people }, (_, i) => ({
        id: uuid(i + 1),
        firstName: `P${i + 1}`,
        gender: (i % 2 ? 'male' : 'female') as Gender,
        deceased: false,
      })),
      // person c (2..5000) has parent floor(c / 2): a binary tree about 12 generations deep
      parentLinks: Array.from({ length: people - 1 }, (_, k) => ({
        childId: uuid(k + 2),
        parentId: uuid(Math.floor((k + 2) / 2)),
        kind: 'birth' as const,
      })),
      partnerships: [],
    }
    assertTreeIntegrity(tree)
    const start = performance.now()
    const result = deriveRelationships(tree)
    const elapsed = performance.now() - start
    expect(result.size).toBe(people)
    expect(elapsed).toBeLessThan(1000)
  })
})

describe('what another language needs from a descriptor', () => {
  const home: Record<string, Gender> = { Me: 'female', Dad: 'male', Mom: 'female' }
  const parents: [string, string][] = [['Me', 'Dad'], ['Me', 'Mom']]

  it('records the gender of the parent a half-sibling shares', () => {
    const f = family({
      focus: 'Me',
      people: { ...home, Y: 'female', X: 'male', HalfByDad: 'male', HalfByMom: 'female' },
      parents: [
        ...parents,
        ['HalfByDad', 'Dad'], ['HalfByDad', 'Y'],
        ['HalfByMom', 'Mom'], ['HalfByMom', 'X'],
      ],
    })
    expect(f.rel('HalfByDad').descriptor).toMatchObject({ kind: 'blood', up: 1, down: 1, half: true, ancestor: 'male' })
    expect(f.rel('HalfByMom').descriptor).toMatchObject({ half: true, ancestor: 'female' })

    const unknownParent = family({
      focus: 'Me',
      people: { Me: 'female', Mom: 'female', Q: 'unknown', Y: 'female', HalfByQ: 'unknown' },
      parents: [['Me', 'Mom'], ['Me', 'Q'], ['HalfByQ', 'Q'], ['HalfByQ', 'Y']],
    })
    expect(unknownParent.rel('HalfByQ').descriptor).toMatchObject({ half: true, ancestor: 'unknown' })
  })

  it('records the gender of the sibling a nephew or niece comes through, and of the child a grandchild comes through', () => {
    const f = family({
      focus: 'Me',
      people: { ...home, Bro: 'male', Sis: 'female', Sib: 'unknown', BroKid: 'male', SisKid: 'female', SibKid: 'male', BroGrandKid: 'female', Son: 'male', Daughter: 'female', SonKid: 'male', DaughterKid: 'female' },
      parents: [
        ...parents,
        ['Bro', 'Dad'], ['Bro', 'Mom'], ['Sis', 'Dad'], ['Sis', 'Mom'], ['Sib', 'Dad'], ['Sib', 'Mom'],
        ['BroKid', 'Bro'], ['SisKid', 'Sis'], ['SibKid', 'Sib'], ['BroGrandKid', 'BroKid'],
        ['Son', 'Me'], ['Daughter', 'Me'], ['SonKid', 'Son'], ['DaughterKid', 'Daughter'],
      ],
    })
    expect(f.rel('BroKid').descriptor).toMatchObject({ up: 1, down: 2, downFirst: 'male' })
    expect(f.rel('SisKid').descriptor).toMatchObject({ up: 1, down: 2, downFirst: 'female' })
    expect(f.rel('SibKid').descriptor).toMatchObject({ up: 1, down: 2, downFirst: 'unknown' })
    expect(f.rel('BroGrandKid').descriptor).toMatchObject({ up: 1, down: 3, downFirst: 'male' })
    expect(f.rel('SonKid').descriptor).toMatchObject({ up: 0, down: 2, downFirst: 'male' })
    expect(f.rel('DaughterKid').descriptor).toMatchObject({ up: 0, down: 2, downFirst: 'female' })
    // an ancestor has nobody below the common ancestor on the way to them
    expect(f.rel('Dad').descriptor).not.toHaveProperty('downFirst')
  })

  it('records the gender of the uncle or aunt a cousin comes through, with the side of the family', () => {
    const f = family({
      focus: 'Me',
      people: { ...home, GF: 'male', MGF: 'male', DadBro: 'male', DadSis: 'female', MomBro: 'male', MomSis: 'female', CDB: 'female', CDS: 'male', CMB: 'female', CMS: 'male' },
      parents: [
        ...parents, ['Dad', 'GF'], ['DadBro', 'GF'], ['DadSis', 'GF'], ['Mom', 'MGF'], ['MomBro', 'MGF'], ['MomSis', 'MGF'],
        ['CDB', 'DadBro'], ['CDS', 'DadSis'], ['CMB', 'MomBro'], ['CMS', 'MomSis'],
      ],
    })
    expect(f.rel('CDB').descriptor).toMatchObject({ up: 2, down: 2, side: 'paternal', downFirst: 'male' })
    expect(f.rel('CDS').descriptor).toMatchObject({ up: 2, down: 2, side: 'paternal', downFirst: 'female' })
    expect(f.rel('CMB').descriptor).toMatchObject({ up: 2, down: 2, side: 'maternal', downFirst: 'male' })
    expect(f.rel('CMS').descriptor).toMatchObject({ up: 2, down: 2, side: 'maternal', downFirst: 'female' })
  })

  it('records the gender of the relative an in-law comes through', () => {
    const base: Spec = {
      focus: 'Me',
      people: { Me: 'male', Spouse: 'female', SP: 'male', SB: 'male', Dad: 'male', Sis: 'female', SisHusband: 'male', Kid: 'female', KidHusband: 'male' },
      parents: [['Spouse', 'SP'], ['SB', 'SP'], ['Me', 'Dad'], ['Sis', 'Dad'], ['Kid', 'Me']],
      partners: [['Me', 'Spouse'], ['Sis', 'SisHusband'], ['Kid', 'KidHusband']],
    }
    const f = family(base)
    expect(f.rel('SP').descriptor).toEqual({ kind: 'in-law', via: 'partner-parent', link: 'female' })
    expect(f.rel('SB').descriptor).toEqual({ kind: 'in-law', via: 'partner-sibling', link: 'female' })
    expect(f.rel('SisHusband').descriptor).toEqual({ kind: 'in-law', via: 'sibling-partner', link: 'female' })
    expect(f.rel('KidHusband').descriptor).toEqual({ kind: 'in-law', via: 'child-partner', link: 'female' })

    const other = family({ ...base, people: { ...base.people, Spouse: 'unknown', Sis: 'male', Kid: 'unknown' } })
    expect(other.rel('SB').descriptor).toMatchObject({ link: 'unknown' })
    expect(other.rel('SisHusband').descriptor).toMatchObject({ link: 'male' })
    expect(other.rel('KidHusband').descriptor).toMatchObject({ link: 'unknown' })
  })

  it('records the side and the gender of the uncle or aunt whose partner this is', () => {
    const f = family({
      focus: 'Me',
      people: { ...home, GF: 'male', MGF: 'male', Uncle: 'male', UncleWife: 'female', Aunt: 'female', AuntHusband: 'male' },
      parents: [...parents, ['Dad', 'GF'], ['Uncle', 'GF'], ['Mom', 'MGF'], ['Aunt', 'MGF']],
      partners: [['Uncle', 'UncleWife'], ['Aunt', 'AuntHusband']],
    })
    expect(f.rel('UncleWife').descriptor).toEqual({ kind: 'uncle-partner', side: 'paternal', uncle: 'male' })
    expect(f.rel('AuntHusband').descriptor).toEqual({ kind: 'uncle-partner', side: 'maternal', uncle: 'female' })
  })
})
