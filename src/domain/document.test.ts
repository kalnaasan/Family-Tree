import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrateDocument, parseDocument, serializeDocument } from './document.ts'
import { CURRENT_SCHEMA_VERSION } from './schema.ts'
import { addParentLink, addPartnership, addPerson, emptyTree } from './tree.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

function v1Document() {
  return {
    format: 'family-tree',
    schemaVersion: 1,
    exportedAt: '2026-01-01T10:00:00.000Z',
    focusPersonId: id(1),
    persons: [
      { id: id(1), firstName: 'Anna', gender: 'female', birthDate: '1962-05-14', deceased: false },
      { id: id(2), firstName: 'Ben', gender: 'male', birthDate: '1990', deceased: false },
    ],
    parentLinks: [{ childId: id(2), parentId: id(1), kind: 'birth' }],
    partnerships: [],
  }
}

describe('migrations', () => {
  it('has a step for every version below the current one', () => {
    for (let v = 1; v < CURRENT_SCHEMA_VERSION; v++) expect(MIGRATIONS[v]).toBeTypeOf('function')
  })

  it('migrates v1 to v2 without changing any data', () => {
    const v1 = v1Document()
    const migrated = migrateDocument(v1)
    expect(migrated.schemaVersion).toBe(2)
    expect(migrated.persons).toEqual(v1.persons)
    expect(migrated.parentLinks).toEqual(v1.parentLinks)
  })

  it('parses a v1 document into a valid Tree', () => {
    const result = parseDocument(v1Document())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.tree.persons).toHaveLength(2)
      expect(result.tree.persons[0]!.photoId).toBeUndefined()
    }
  })

  it('does not mutate the input document', () => {
    const v1 = v1Document()
    const copy = structuredClone(v1)
    parseDocument(v1)
    expect(v1).toEqual(copy)
  })
})

describe('parseDocument rejects invalid files and names the rule', () => {
  const current = () => ({ ...v1Document(), schemaVersion: 2 })

  const cases: [string, unknown, string][] = [
    ['not an object', 'hello', 'not-a-document'],
    ['wrong format', { format: 'other' }, 'not-a-document'],
    ['newer version', { ...current(), schemaVersion: 3 }, 'unsupported-version'],
    ['missing version', { ...current(), schemaVersion: undefined }, 'unsupported-version'],
    ['bad shape', { ...current(), persons: [{ id: 'x' }] }, 'invalid-data'],
    ['bad date', { ...current(), persons: [{ ...v1Document().persons[0], birthDate: '1962-13' }] }, 'invalid-data'],
    ['self link', { ...current(), parentLinks: [{ childId: id(1), parentId: id(1), kind: 'birth' }] }, 'self-link'],
    [
      'duplicate link',
      { ...current(), parentLinks: [...v1Document().parentLinks, ...v1Document().parentLinks] },
      'duplicate-link',
    ],
    [
      'cycle',
      {
        ...current(),
        parentLinks: [
          { childId: id(2), parentId: id(1), kind: 'birth' },
          { childId: id(1), parentId: id(2), kind: 'birth' },
        ],
      },
      'parent-cycle',
    ],
    [
      'dangling link',
      { ...current(), parentLinks: [{ childId: id(2), parentId: id(9), kind: 'birth' }] },
      'dangling-reference',
    ],
    [
      'self partnership',
      { ...current(), partnerships: [{ id: id(100), personIds: [id(1), id(1)], status: 'current' }] },
      'self-partnership',
    ],
    [
      'duplicate partnership',
      {
        ...current(),
        partnerships: [
          { id: id(100), personIds: [id(1), id(2)], status: 'current' },
          { id: id(101), personIds: [id(2), id(1)], status: 'ended' },
        ],
      },
      'duplicate-partnership',
    ],
    ['missing focus person', { ...current(), focusPersonId: id(9) }, 'missing-focus-person'],
  ]

  it.each(cases)('%s', (_name, input, rule) => {
    const result = parseDocument(input)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.rule).toBe(rule)
      expect(result.message.length).toBeGreaterThan(0)
    }
  })

  it('rejects a third birth parent', () => {
    const doc = current()
    doc.persons.push(
      { id: id(3), firstName: 'C', gender: 'unknown', deceased: false } as never,
      { id: id(4), firstName: 'D', gender: 'unknown', deceased: false } as never,
    )
    doc.parentLinks.push(
      { childId: id(2), parentId: id(3), kind: 'birth' },
      { childId: id(2), parentId: id(4), kind: 'birth' },
    )
    const result = parseDocument(doc)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.rule).toBe('third-birth-parent')
  })
})

describe('serializeDocument', () => {
  it('copies only the Tree fields, so the result can be structured-cloned (IndexedDB)', () => {
    const t = addPerson(emptyTree(), { id: id(1), firstName: 'Anna' })
    const withExtras = { ...t, addPerson: () => {}, loadTree: () => {} }
    const doc = serializeDocument(withExtras)
    expect(Object.keys(doc).sort()).toEqual(
      ['exportedAt', 'focusPersonId', 'format', 'parentLinks', 'partnerships', 'persons', 'schemaVersion'].sort(),
    )
    expect(() => structuredClone(doc)).not.toThrow()
  })

  it('round-trips a Tree exactly', () => {
    let t = addPerson(emptyTree(), { id: id(1), firstName: 'Anna', photoId: id(50), deceased: true, deathDate: '2020' })
    t = addPerson(t, { id: id(2), firstName: 'Ben' })
    t = addParentLink(t, id(2), id(1), 'adoptive')
    t = addPartnership(t, { id: id(100), personIds: [id(1), id(2)], status: 'ended', endDate: '2010' })
    const doc = serializeDocument(t, new Date('2026-02-03T04:05:06.000Z'))
    expect(doc).toMatchObject({ format: 'family-tree', schemaVersion: 2, exportedAt: '2026-02-03T04:05:06.000Z' })
    const result = parseDocument(JSON.parse(JSON.stringify(doc)))
    expect(result).toEqual({ ok: true, tree: t })
  })
})
