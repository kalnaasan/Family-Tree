import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { deriveRelationships, labelFor } from '../domain/labels.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { createLanguageStore } from '../i18n/language.ts'
import { useLabeler } from './useLabeler.ts'

const id = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`
const me: Person = { id: id(1), firstName: 'Me', gender: 'female', deceased: false }
const dad: Person = { id: id(2), firstName: 'Dad', gender: 'male', deceased: false }
const tree: Tree = {
  focusPersonId: me.id,
  persons: [me, dad],
  parentLinks: [{ childId: me.id, parentId: dad.id, kind: 'birth' }],
  partnerships: [],
}

const languages = () =>
  createLanguageStore({ available: ['en', 'ar'], storage: null, browserLanguages: ['en'], root: { lang: '', dir: '' } })

describe('useLabeler', () => {
  it('words a Person from their descriptor', () => {
    const relationships = deriveRelationships(tree)
    const { result } = renderHook(() => useLabeler(relationships, languages()))
    expect(result.current(dad)).toBe('father')
    expect(result.current(me)).toBeNull() // the Focus person has no label
  })

  it('gives nothing when there are no relationships yet', () => {
    const { result } = renderHook(() => useLabeler(null, languages()))
    expect(result.current(dad)).toBeNull()
  })

  it('is a new function when the language changes, so what uses it is drawn again with the new words', () => {
    const relationships = deriveRelationships(tree)
    const store = languages()
    const { result } = renderHook(() => useLabeler(relationships, store))
    const before = result.current
    act(() => store.getState().setSetting('ar'))
    expect(result.current).not.toBe(before)
    expect(result.current(dad)).toBe(labelFor(relationships.get(dad.id)!.descriptor, 'male', 'ar'))
  })

  it('stays the same function while nothing changed, so a memoised list is not drawn again for nothing', () => {
    const relationships = deriveRelationships(tree)
    const store = languages()
    const { result, rerender } = renderHook(() => useLabeler(relationships, store))
    const before = result.current
    rerender()
    expect(result.current).toBe(before)
  })
})
