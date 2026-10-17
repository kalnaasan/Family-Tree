import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Every component's source text, loaded by Vite (tests are not components, so they are left out). */
const COMPONENTS = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Attributes whose text a person reads or hears. */
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription'])

/** A letter in any script: text made of punctuation and symbols only ("·", "▾", "+") is not words. */
const HAS_LETTERS = /\p{L}/u

/** The text a component writes in its markup by itself, with where it is. */
function hardcodedText(path: string, code: string): string[] {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const at = (node: ts.Node) => `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && HAS_LETTERS.test(node.text)) found.push(`${at(node)} text "${node.text.trim()}"`)
    if (
      ts.isJsxAttribute(node) &&
      TEXT_ATTRIBUTES.has(node.name.getText(source)) &&
      node.initializer &&
      ts.isStringLiteral(node.initializer) &&
      HAS_LETTERS.test(node.initializer.text)
    ) {
      found.push(`${at(node)} ${node.name.getText(source)}="${node.initializer.text}"`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('interface text', () => {
  it('lives in the dictionary: no component writes words of its own in its markup', () => {
    // the scan has to be looking at the components, or "found nothing" would mean nothing
    expect(Object.keys(COMPONENTS).length).toBeGreaterThan(10)
    const found = Object.entries(COMPONENTS).flatMap(([path, code]) => hardcodedText(path, code))
    expect(found).toEqual([])
  })
})
