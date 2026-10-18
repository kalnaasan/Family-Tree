/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/** The style sheet's text. Vitest empties CSS that is imported, so it is read from the file (tests run from the project folder). */
const STYLES = readFileSync('src/index.css', 'utf8')

describe('fonts (spec section 13.3)', () => {
  const stack = /body\s*\{[^}]*?font-family:\s*([^;]+);/.exec(STYLES)?.[1] ?? ''

  it('are the fonts of the system, with nothing downloaded', () => {
    expect(STYLES).not.toMatch(/@font-face|fonts\.googleapis|@import url/)
  })

  it('name a system font first and one that draws Arabic, and end on the generic sans-serif', () => {
    const fonts = stack.split(',').map((font) => font.trim().replace(/['"]/g, ''))
    expect(fonts[0]).toBe('system-ui')
    expect(fonts).toContain('Tahoma')
    expect(fonts).toContain('Noto Naskh Arabic')
    expect(fonts.at(-1)).toBe('sans-serif')
  })
})
