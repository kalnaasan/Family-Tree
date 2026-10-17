import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/** Every source file's text, loaded by Vite (tests are not part of the app, so they are left out). */
const SOURCES = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/*.test.ts', '!../**/*.test.tsx'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/** Attributes whose text a person reads or hears. */
const TEXT_ATTRIBUTES = new Set(['aria-label', 'title', 'placeholder', 'alt', 'aria-description', 'aria-roledescription'])

/** Calls whose argument is shown to the person: a string given to one of them is words that skipped the dictionary. */
const SHOWING_CALLS = new Set(['showToast', 'setMessage', 'setProblem', 'setNote', 'setFailure', 'announce'])

/** A letter in any script: text made of punctuation and symbols only ("·", "▾", "+") is not words. */
const HAS_LETTERS = /\p{L}/u

/** The words written directly in an expression: in a string, a template, or either side of `?`, `&&`, `||`, `??`. */
function wordsIn(node: ts.Node): ts.Node[] {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return HAS_LETTERS.test(node.text) ? [node] : []
  if (ts.isTemplateExpression(node)) {
    const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)]
    return parts.some((part) => HAS_LETTERS.test(part)) ? [node] : []
  }
  if (ts.isConditionalExpression(node)) return [...wordsIn(node.whenTrue), ...wordsIn(node.whenFalse)]
  if (ts.isBinaryExpression(node)) {
    const operator = node.operatorToken.kind
    // `cond && 'words'`: the left side is the condition, not words; a comparison (`===`) is never words
    if (operator === ts.SyntaxKind.AmpersandAmpersandToken) return wordsIn(node.right)
    if (
      operator === ts.SyntaxKind.BarBarToken ||
      operator === ts.SyntaxKind.QuestionQuestionToken ||
      operator === ts.SyntaxKind.PlusToken
    ) {
      return [...wordsIn(node.left), ...wordsIn(node.right)]
    }
    return []
  }
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) {
    return wordsIn(node.expression)
  }
  // anything else (a call such as `t('key')`, a variable) is not words written here
  return []
}

/** The words a source file writes by itself where a person will read them, with where they are. */
function hardcodedText(path: string, code: string): string[] {
  // a `.ts` file is not markup: read as TSX, a generic arrow such as `<T>(x: T) => x` would look like a tag
  const kind = path.endsWith('.tsx') || path === 'example.tsx' ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const source = ts.createSourceFile(path, code, ts.ScriptTarget.Latest, true, kind)
  const found: string[] = []
  const report = (node: ts.Node, what: string) =>
    found.push(`${path}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${what} ${node.getText(source)}`)
  const visit = (node: ts.Node) => {
    // text between tags
    if (ts.isJsxText(node) && HAS_LETTERS.test(node.text)) report(node, 'text')
    // `{cond && 'words'}` between tags
    if (ts.isJsxExpression(node) && node.expression && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      for (const words of wordsIn(node.expression)) report(words, 'in braces')
    }
    // aria-label="words", title={cond ? 'a' : 'b'}, placeholder={`words ${x}`}
    if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(source)) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer
      for (const words of value ? wordsIn(value) : []) report(words, node.name.getText(source))
    }
    // showToast('words')
    if (ts.isCallExpression(node)) {
      const callee = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : node.expression.getText(source)
      if (SHOWING_CALLS.has(callee)) for (const arg of node.arguments) for (const words of wordsIn(arg)) report(words, `${callee}()`)
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

describe('interface text', () => {
  it('lives in the dictionary: no source file writes words of its own where a person will read them', () => {
    // the scan has to be looking at the sources, or "found nothing" would mean nothing
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    // the dictionary itself is the one place for words
    const found = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith('/i18n/messages.ts'))
      .flatMap(([path, code]) => hardcodedText(path, code))
    expect(found).toEqual([])
  })

  it('reads a .ts file as code, not markup: a generic arrow function is not a tag', () => {
    expect(hardcodedText('helper.ts', 'const first = <T>(items: readonly T[]): T => items[0]!\\nconst r = 1 < 2 && 3 > 2')).toEqual([])
  })

  it('does catch words in a ternary, an && expression, a template and a showing call', () => {
    const found = hardcodedText(
      'example.tsx',
      `const A = () => (
        <p title={open ? 'Collapse' : 'Expand'} aria-label={\`Add \${x}\`}>
          {ready && 'Done'}
          {t('fine')}
        </p>
      )
      showToast('Saved')`,
    )
    expect(found.map((line) => line.replace(/^.* (title|aria-label|in braces|showToast\(\)) /, '$1 '))).toEqual([
      "title 'Collapse'",
      "title 'Expand'",
      'aria-label `Add ${x}`',
      "in braces 'Done'",
      "showToast() 'Saved'",
    ])
  })
})
