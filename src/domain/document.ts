import { IntegrityError, type IntegrityRule, assertTreeIntegrity } from './integrity.ts'
import { CURRENT_SCHEMA_VERSION, type Tree, type TreeDocument, documentSchema } from './schema.ts'

type RawDocument = Record<string, unknown>

/** One step per version: `MIGRATIONS[n]` turns a version-n document into version n + 1. */
export const MIGRATIONS: Record<number, (doc: RawDocument) => RawDocument> = {
  // v2 adds the optional Person.photoId; existing Persons are valid unchanged.
  1: (doc) => ({ ...doc, schemaVersion: 2 }),
}

export type ParseFailureRule = IntegrityRule | 'not-a-document' | 'unsupported-version' | 'invalid-data'

export type ParseResult =
  | { ok: true; tree: Tree }
  | { ok: false; rule: ParseFailureRule; message: string }

function fail(rule: ParseFailureRule, message: string): ParseResult {
  return { ok: false, rule, message }
}

class ParseFailure extends Error {
  readonly rule: ParseFailureRule

  constructor(rule: ParseFailureRule, message: string) {
    super(message)
    this.rule = rule
  }
}

/** Runs the migration steps from the document's version up to the current one. Throws on unusable input. */
export function migrateDocument(raw: unknown): RawDocument {
  if (typeof raw !== 'object' || raw === null || (raw as RawDocument).format !== 'family-tree') {
    throw new ParseFailure('not-a-document', 'This file is not a family-tree document')
  }
  let doc = raw as RawDocument
  const version = doc.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new ParseFailure('unsupported-version', 'The document has no valid schema version')
  }
  if (version > CURRENT_SCHEMA_VERSION) {
    throw new ParseFailure(
      'unsupported-version',
      `The document is version ${version}; this app understands up to ${CURRENT_SCHEMA_VERSION}`,
    )
  }
  for (let v = version; v < CURRENT_SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) throw new ParseFailure('unsupported-version', `No migration from version ${v}`)
    doc = step(doc)
  }
  return doc
}

/** Migrates, validates the shape (zod) and the integrity rules. Never throws; says which rule failed. */
export function parseDocument(raw: unknown): ParseResult {
  try {
    const parsed = documentSchema.safeParse(migrateDocument(raw))
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const where = issue?.path.join('.') || 'document'
      return fail('invalid-data', `${where}: ${issue?.message ?? 'invalid'}`)
    }
    const { focusPersonId, persons, parentLinks, partnerships } = parsed.data
    const tree: Tree = { focusPersonId, persons, parentLinks, partnerships }
    assertTreeIntegrity(tree)
    return { ok: true, tree }
  } catch (error) {
    if (error instanceof ParseFailure || error instanceof IntegrityError) {
      return fail(error.rule, error.message)
    }
    throw error
  }
}

export function serializeDocument(tree: Tree, exportedAt: Date = new Date()): TreeDocument {
  return {
    format: 'family-tree',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: exportedAt.toISOString(),
    ...tree,
  }
}
