import { type ParseFailureRule, parseDocument, serializeDocument } from '../domain/document.ts'
import type { Tree } from '../domain/schema.ts'
import { type FamilyTreeConnection, TREE_KEY, openFamilyTreeDb } from './db.ts'

export type LoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; tree: Tree }
  /** The stored document cannot be read. It is left untouched so nothing overwrites it. */
  | { status: 'invalid'; rule: ParseFailureRule; message: string }

export interface TreeStorage {
  load: () => Promise<LoadResult>
  save: (tree: Tree) => Promise<void>
}

export function createTreeStorage(open: () => Promise<FamilyTreeConnection> = openFamilyTreeDb): TreeStorage {
  let connection: Promise<FamilyTreeConnection> | undefined
  const db = () => (connection ??= open().catch((error) => {
    connection = undefined // allow a later retry after a failed open
    throw error
  }))

  return {
    async load() {
      const stored = await (await db()).get('tree', TREE_KEY)
      if (stored === undefined) return { status: 'empty' }
      const result = parseDocument(stored)
      return result.ok
        ? { status: 'loaded', tree: result.tree }
        : { status: 'invalid', rule: result.rule, message: result.message }
    },
    async save(tree) {
      await (await db()).put('tree', serializeDocument(tree), TREE_KEY)
    },
  }
}
