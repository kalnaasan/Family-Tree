import { afterEach, describe, expect, it } from 'vitest'
import { focusTree } from './focusTree.ts'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('focusTree', () => {
  it.each(['Family tree', 'شجرة العائلة'])('hands the keyboard back to the current Person of the tree labelled "%s"', (label) => {
    document.body.innerHTML = `<div data-tree-frame tabindex="-1" aria-label="${label}"><svg><g data-person-id="a" tabindex="-1"></g><g data-person-id="b" tabindex="0"></g></svg></div>`
    focusTree()
    expect(document.activeElement).toBe(document.querySelector('[data-person-id="b"]'))
  })
})
