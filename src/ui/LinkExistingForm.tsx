import { type FormEvent, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react'
import {
  type Question,
  RELATION_KEY,
  type Relation,
  type RelativeAnswers,
  arePartners,
  questionFor,
} from '../domain/addRelative.ts'
import { type LinkRefusal, candidatesFor, previewLinkFor } from '../domain/linkExisting.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { searchPersons } from '../domain/search.ts'
import { useTreeStore } from '../domain/store.ts'
import { isolate } from '../i18n/format.ts'
import { renderMessage } from '../i18n/messageRef.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'
import { displayName, lifeSpan } from '../view/text.ts'
import { PersonLine } from './PersonLine.tsx'
import { RelativeQuestions } from './RelativeQuestions.tsx'

/** The picker shows this many rows; "keep typing" covers the rest. */
export const MAX_ROWS = 50

const REASON_KEY: Record<LinkRefusal, MessageKey> = {
  self: 'link.reason.self',
  'already-linked': 'link.reason.already-linked',
  'own-ancestor': 'link.reason.own-ancestor',
  'third-birth-parent': 'link.reason.third-birth-parent',
  'already-partners': 'link.reason.already-partners',
}

interface Props {
  anchor: Person
  relation: Relation
  onDone: () => void
  onCancel: () => void
}

/**
 * Links a Person who is already in the Tree as a relative (spec section 5.1): pick them from a searchable list, in which
 * the people who cannot be linked stay visible, disabled, with the reason; then the same questions and a "This will link"
 * preview as adding a new relative.
 */
export function LinkExistingForm({ anchor, relation, onDone, onCancel }: Props) {
  const t = useT()
  const listId = useId()
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const tree = useMemo<Tree>(
    () => ({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(null)
  const [answers, setAnswers] = useState<RelativeAnswers>({})
  const [failure, setFailure] = useState<string | null>(null)

  const candidates = useMemo(() => candidatesFor(tree, anchor.id, relation), [tree, anchor.id, relation])
  const anyValid = candidates.some((c) => c.status.valid)
  const matching = useMemo(() => {
    if (!query.trim()) return candidates
    const found = new Set(searchPersons(candidates.map((c) => c.person), query).map((p) => p.id))
    return candidates.filter((c) => found.has(c.person.id))
  }, [candidates, query])
  const rows = matching.slice(0, MAX_ROWS)
  const active = Math.min(activeIndex, Math.max(0, rows.length - 1))
  const rowId = (n: number) => `${listId}-row-${n}`

  const formRef = useRef<HTMLFormElement>(null)
  const picked = pickedId ? persons.find((p) => p.id === pickedId) : undefined
  const unnamedParentName = t('person.unnamedParent')

  const choose = (n: number) => {
    const row = rows[n]
    if (!row?.status.valid) return
    setAnswers({})
    setPickedId(row.person.id)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (rows.length === 0) return
    if (event.key === 'ArrowDown') setActiveIndex((active + 1) % rows.length)
    else if (event.key === 'ArrowUp') setActiveIndex((active - 1 + rows.length) % rows.length)
    else if (event.key === 'Enter') choose(active)
    else return
    event.preventDefault()
  }

  // the picker is gone once someone is chosen: the keyboard goes to the first answer, or to the button that links
  useEffect(() => {
    if (pickedId) formRef.current?.querySelector<HTMLElement>('input, button[type="submit"]')?.focus()
  }, [pickedId])

  const question = questionFor(tree, anchor.id, relation)
  if (question.kind === 'blocked') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded border border-red-800 p-3 text-red-800">
          {renderMessage(t, question.message)}
        </p>
        <button type="button" onClick={onCancel} className="btn px-4">
          {t('addForm.back')}
        </button>
      </div>
    )
  }

  if (!picked) {
    return (
      <div className="flex flex-col gap-3">
        <input
          type="text"
          dir="auto"
          role="combobox"
          aria-label={t('link.search')}
          placeholder={t('link.search')}
          aria-expanded={rows.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={rows.length > 0 ? rowId(active) : undefined}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
          }}
          onKeyDown={onKeyDown}
          className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 placeholder:text-ink-soft"
        />
        {!anyValid && <p className="text-sm text-stone-700">{t('link.none')}</p>}
        <ul id={listId} role="listbox" aria-label={t('link.list')} className="flex flex-col">
          {rows.map(({ person, status }, n) => (
            <li
              key={person.id}
              id={rowId(n)}
              role="option"
              aria-selected={n === active}
              aria-disabled={!status.valid}
              aria-describedby={status.valid ? undefined : `${rowId(n)}-reason`}
              onClick={() => choose(n)}
              onMouseMove={() => setActiveIndex(n)}
              className={`flex min-h-11 flex-col justify-center rounded px-3 py-1 ${
                status.valid ? 'cursor-pointer' : 'cursor-not-allowed text-stone-700'
              } ${n === active ? 'bg-stone-200' : ''}`}
            >
              <span className={n === active ? 'font-semibold' : ''}>
                <PersonLine name={displayName(person)} rest={[lifeSpan(person, t)]} />
              </span>
              {!status.valid && (
                <span id={`${rowId(n)}-reason`} className="text-sm">
                  {t(REASON_KEY[status.reason])}
                </span>
              )}
            </li>
          ))}
        </ul>
        {rows.length === 0 && anyValid && <p className="text-sm text-stone-700">{t('link.noMatch')}</p>}
        {matching.length > rows.length && (
          <p className="text-sm text-stone-700">{t('link.more', { count: matching.length - rows.length })}</p>
        )}
        <button type="button" onClick={onCancel} className="btn px-4">
          {t('common.cancel')}
        </button>
      </div>
    )
  }

  const request = { anchorId: anchor.id, relation, personId: picked.id, answers, unnamedParentName }
  const asked: Question = linkQuestion(tree, question, picked)
  const preview = previewLinkFor(tree, request)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    try {
      useTreeStore.getState().linkExisting(request)
      onDone()
    } catch (error) {
      // the reason is a rule of the Tree's integrity, technical detail that stays in English
      setFailure(t('addForm.failure', { detail: isolate(error instanceof Error ? error.message : String(error)) }))
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="font-medium">
        <bdi>{displayName(picked)}</bdi>{' '}
        <button type="button" onClick={() => {
            setAnswers({})
            setPickedId(null)
          }} className="text-sm underline">
          {t('link.change')}
        </button>
      </p>
      <RelativeQuestions question={asked} answers={answers} onChange={setAnswers} />
      <div aria-live="polite" className="rounded bg-stone-100 p-3 text-sm">
        <p className="font-medium">{t('preview.linkTitle')}</p>
        <ul className="mt-1 list-disc ps-5">
          {preview.map((line, n) => (
            <li key={n}>{renderMessage(t, line)}</li>
          ))}
        </ul>
      </div>
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1 px-4 font-medium text-white">
          {t('link.submit', { relation: t(RELATION_KEY[relation]) })}
        </button>
        <button type="button" onClick={onCancel} className="btn px-4">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}

/** The question for a Person who is already in the Tree: what their links already settle is not asked. */
function linkQuestion(tree: Tree, question: Question, picked: Person): Question {
  if (question.kind === 'parent-partnership' && arePartners(tree, question.existingParent.id, picked.id)) {
    return { kind: 'none' }
  }
  if (question.kind === 'sibling-parents') {
    // the parents they already have are settled: one missing parent is simply added, so there is nothing to choose
    const missing = question.parents.filter((p) => !tree.parentLinks.some((l) => l.childId === picked.id && l.parentId === p.id))
    if (missing.length < 2) return { kind: 'none' }
  }
  if (question.kind === 'child-other-parent') {
    const partners = question.partners.filter((p) => p.person.id !== picked.id)
    if (partners.length === 0) return { kind: 'none' }
    return {
      ...question,
      partners,
      defaultParentId: question.defaultParentId === picked.id ? null : question.defaultParentId,
    }
  }
  return question
}
