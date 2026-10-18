/// <reference types="node" />
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Every source file's text, loaded by Vite (tests are not part of the app, so they are left out). */
const SOURCES = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** The style sheet's text. Vitest empties CSS that is imported, so it is read from the file (tests run from the project folder). */
const STYLES = readFileSync('src/index.css', 'utf8')

/**
 * Tailwind classes that mean a physical side: they stay on the same side of the screen when the page reads right
 * to left, so the interface would not mirror (spec section 13.2). The logical ones (`ms-`, `me-`, `ps-`, `pe-`,
 * `start-`, `end-`, `text-start`, `border-s`, `rounded-s`) follow the direction. A variant prefix (`md:`) is ignored.
 * Centring that does not depend on a side is written without them (`inset-x-0 mx-auto w-fit`).
 */
const PHYSICAL = [
  /^-?m[lr]-/,
  /^-?p[lr]-/,
  /^-?scroll-m[lr]-/,
  /^-?scroll-p[lr]-/,
  /^-?(left|right)-/,
  /^-?translate-x-/,
  /^origin-(left|right)/,
  /^text-(left|right)$/,
  /^border-[lr](-|$)/,
  /^rounded-[lr](-|$)/,
  /^rounded-[tb][lr](-|$)/,
  /^float-(left|right)$/,
  /^clear-(left|right)$/,
]

/** Style properties (in a `style={{ ... }}` object) that name a physical side. */
const PHYSICAL_STYLE = new Set([
  'left',
  'right',
  'marginLeft',
  'marginRight',
  'paddingLeft',
  'paddingRight',
  'borderLeft',
  'borderRight',
  'scrollMarginLeft',
  'scrollMarginRight',
])

/** Declarations in a style sheet that name a physical side. */
const PHYSICAL_CSS = /(?:^|[\s;{])(?:margin|padding|border|scroll-margin|scroll-padding)-(?:left|right)\s*:|(?:^|[\s;{])(?:left|right)\s*:|(?:text-align|float|clear)\s*:\s*(?:left|right)\b/

/** Where physical sides are written in a source file: class names in strings, and style properties. */
function physicalSides(path: string, code: string): string[] {
  // a `.ts` file is not markup: read as TSX, a generic arrow such as `<T>(x: T) => x` would look like a tag
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const at = (node: ts.Node) => `${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
  const check = (node: ts.Node, text: string) => {
    for (const word of text.split(/\s+/)) {
      const name = word.slice(word.lastIndexOf(':') + 1)
      if (PHYSICAL.some((pattern) => pattern.test(name))) found.push(`${at(node)} ${word}`)
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text)
    if (ts.isTemplateExpression(node)) {
      check(node, node.head.text)
      for (const span of node.templateSpans) check(span.literal, span.literal.text)
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'style') {
      const object =
        node.initializer && ts.isJsxExpression(node.initializer) ? node.initializer.expression : undefined
      if (object && ts.isObjectLiteralExpression(object)) {
        for (const property of object.properties) {
          const name = property.name?.getText(source)
          if (name && PHYSICAL_STYLE.has(name)) found.push(`${at(property)} style ${name}`)
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('right-to-left', () => {
  it('has no physical side in a source file: left and right are written as start and end', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(Object.entries(SOURCES).flatMap(([path, code]) => physicalSides(path, code))).toEqual([])
  })

  it('has no physical side in the style sheet', () => {
    expect(STYLES.length).toBeGreaterThan(100)
    const withoutComments = STYLES.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(withoutComments.split('\n').filter((line) => PHYSICAL_CSS.test(line))).toEqual([])
  })

  it('does catch the physical sides, and leaves the logical ones and the neutral ones alone', () => {
    const code = `const a = <p style={{ marginLeft: 8 }} className="ml-5 pr-2 md:text-left border-l rounded-l-xl float-right -mr-2 right-2 left-0 left-1/2 -translate-x-1/2 scroll-ml-2 origin-left" />
      const b = <p style={{ top: 1, paddingBottom: 2 }} className="ms-5 pe-2 text-start border-s rounded-s-xl end-2 start-0 inset-x-0 mx-auto w-fit rounded-lg rounded-t-xl border-t px-3 -translate-y-1/2" />
      const helper = (x: string) => 'text-right ' + x`
    expect(physicalSides('example.tsx', code).map((line) => line.replace(/^example\.tsx:\d+ /, ''))).toEqual([
      'style marginLeft',
      'ml-5',
      'pr-2',
      'md:text-left',
      'border-l',
      'rounded-l-xl',
      'float-right',
      '-mr-2',
      'right-2',
      'left-0',
      'left-1/2',
      '-translate-x-1/2',
      'scroll-ml-2',
      'origin-left',
      'text-right',
    ])
    expect(PHYSICAL_CSS.test('  margin-left: 1rem;')).toBe(true)
    expect(PHYSICAL_CSS.test('  text-align: right;')).toBe(true)
    expect(PHYSICAL_CSS.test('  margin-inline-start: 1rem;')).toBe(false)
    expect(PHYSICAL_CSS.test('  padding: 0;')).toBe(false)
  })
})
