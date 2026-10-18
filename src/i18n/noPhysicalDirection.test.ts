import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Every component's source text, loaded by Vite (tests are not part of the app, so they are left out). */
const COMPONENTS = import.meta.glob(['../**/*.tsx', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Tailwind classes that mean a physical side: they stay on the same side of the screen when the page reads right
 * to left, so the interface would not mirror (spec section 13.2). The logical ones (`ms-`, `me-`, `ps-`, `pe-`,
 * `start-`, `end-`, `text-start`, `border-s`, `rounded-s`) follow the direction. A variant prefix (`md:`) is ignored.
 */
const PHYSICAL = [
  /^-?m[lr]-/,
  /^-?p[lr]-/,
  /^-?(left|right)-/,
  /^text-(left|right)$/,
  /^border-[lr](-|$)/,
  /^rounded-[lr](-|$)/,
  /^rounded-[tb][lr](-|$)/,
  /^float-(left|right)$/,
]

/** Sits at the middle whichever way the page reads, so the side does not matter. */
const SYMMETRIC = new Set(['left-1/2'])

/** The class names written in a source file, wherever they appear in a string. */
function physicalClasses(path: string, code: string): string[] {
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const found: string[] = []
  const check = (node: ts.Node, text: string) => {
    for (const word of text.split(/\s+/)) {
      const name = word.slice(word.lastIndexOf(':') + 1)
      if (!SYMMETRIC.has(name) && PHYSICAL.some((pattern) => pattern.test(name))) {
        found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${word}`)
      }
    }
  }
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) check(node, node.text)
    if (ts.isTemplateExpression(node)) {
      check(node, node.head.text)
      for (const span of node.templateSpans) check(span.literal, span.literal.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('right-to-left', () => {
  it('has no physical-direction class in a component: left and right are written as start and end', () => {
    expect(Object.keys(COMPONENTS).length).toBeGreaterThan(10)
    expect(Object.entries(COMPONENTS).flatMap(([path, code]) => physicalClasses(path, code))).toEqual([])
  })

  it('does catch the physical classes, and leaves the logical ones and the neutral ones alone', () => {
    const code = `const a = <p className="ml-5 pr-2 md:text-left border-l rounded-l-xl float-right -mr-2 right-2 left-0" />
      const b = <p className="ms-5 pe-2 text-start border-s rounded-s-xl end-2 start-0 left-1/2 rounded-lg rounded-t-xl border-t px-3" />`
    expect(physicalClasses('example.tsx', code).map((line) => line.replace(/^.* /, ''))).toEqual([
      'ml-5',
      'pr-2',
      'md:text-left',
      'border-l',
      'rounded-l-xl',
      'float-right',
      '-mr-2',
      'right-2',
      'left-0',
    ])
  })
})
