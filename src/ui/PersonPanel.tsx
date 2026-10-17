import { type FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { Relation } from '../domain/addRelative.ts'
import { relativesOf } from '../domain/groups.ts'
import { deriveRelationships } from '../domain/labels.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { lifeSpan } from '../view/text.ts'
import { AddRelativeForm } from './AddRelativeForm.tsx'
import { PersonFields } from './PersonFields.tsx'
import { Avatar, PhotoField } from './PhotoField.tsx'
import { type PersonFormValues, toPersonFields, validate, valuesOf } from './personForm.ts'
import { useUiStore } from './uiStore.ts'
import { useWideScreen } from './useWideScreen.ts'

/** A swipe on the sheet's handle must travel this far, in pixels, to count (a shorter press is a tap). */
const SWIPE_PX = 40

type Mode = { kind: 'view' } | { kind: 'add'; relation: Relation } | { kind: 'edit' }

const GROUPS: { title: string; add: Relation[] }[] = [
  { title: 'Parents', add: ['father', 'mother'] },
  { title: 'Partners', add: ['husband', 'wife', 'partner'] },
  { title: 'Siblings', add: ['brother', 'sister'] },
  { title: 'Children', add: ['son', 'daughter', 'child'] },
]

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

interface Props {
  personId: string
  onClose: () => void
}

/**
 * The Person's detail view and the way to add relatives (spec section 5): relatives grouped as Parents / Partners /
 * Siblings / Children, each with "Add" buttons, plus edit, make Focus person and delete. Mount it with
 * `key={personId}` so each Person starts from the overview.
 */
export function PersonPanel({ personId, onClose }: Props) {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const readOnly = useTreeStore((s) => s.readOnly)
  const select = useUiStore((s) => s.select)
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const headingRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const wide = useWideScreen()
  const sheet = useUiStore((s) => s.sheet)
  const setSheet = useUiStore((s) => s.setSheet)
  const setSheetHeight = useUiStore((s) => s.setSheetHeight)
  const swipeStart = useRef<{ y: number; swiped: boolean } | null>(null)
  const focusAddAfterOpen = useRef(false)

  // On a phone the panel is a bottom sheet; the tree learns how much of the screen it covers.
  useEffect(() => {
    const panel = panelRef.current
    if (wide || !panel) {
      setSheetHeight(0)
      return
    }
    const report = () => setSheetHeight(Math.round(panel.getBoundingClientRect().height))
    report()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(report)
    observer?.observe(panel)
    return () => {
      observer?.disconnect()
      setSheetHeight(0)
    }
  }, [wide, setSheetHeight])

  // "Add relative" on the peek opens the details and puts the keyboard on the first Add button.
  useEffect(() => {
    if (sheet !== 'expanded' || !focusAddAfterOpen.current) return
    focusAddAfterOpen.current = false
    panelRef.current?.querySelector<HTMLButtonElement>('button[aria-label^="Add "]')?.focus()
  }, [sheet])

  const tree = useMemo<Tree>(
    () => ({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  const person = persons.find((p) => p.id === personId)
  const relationships = useMemo(() => deriveRelationships(tree), [tree])
  const relatives = useMemo(() => (person ? relativesOf(tree, person.id) : null), [tree, person])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  if (!person || !relatives) return null
  const isFocus = focusPersonId === person.id
  const label = relationships.get(person.id)?.label

  // Below 768 px the panel is a bottom sheet: a short peek, or expanded to the full details (spec section 8).
  const peeking = !wide && sheet === 'peek' && mode.kind === 'view'

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    swipeStart.current = { y: event.clientY, swiped: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onHandleUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const start = swipeStart.current
    if (!start) return
    const dy = event.clientY - start.y
    if (dy <= -SWIPE_PX) {
      start.swiped = true
      setSheet('expanded')
    } else if (dy >= SWIPE_PX) {
      start.swiped = true
      if (sheet === 'peek') onClose()
      else if (mode.kind === 'view') setSheet('peek')
    }
  }
  const onHandleClick = () => {
    // a swipe that ended on the handle is not also a tap
    if (swipeStart.current?.swiped) {
      swipeStart.current = null
      return
    }
    setSheet(sheet === 'peek' ? 'expanded' : 'peek')
  }

  const backToOverview = () => {
    setMode({ kind: 'view' })
    queueMicrotask(() => headingRef.current?.focus())
  }

  const labelOf = (id: string) => relationships.get(id)?.label ?? null
  const relativeButton = (relative: Person, note?: string) => (
    <li key={relative.id}>
      <button
        type="button"
        onClick={() => select(relative.id)}
        className="min-h-11 rounded-full border border-stone-400 px-4 text-left hover:bg-stone-100"
      >
        {relative.firstName}
        {relative.lastName ? ` ${relative.lastName}` : ''}
        {[labelOf(relative.id), note].filter(Boolean).length > 0 &&
          ` · ${[labelOf(relative.id), note].filter(Boolean).join(', ')}`}
      </button>
    </li>
  )

  const onDelete = () => {
    const removed = useTreeStore.getState().deletePerson(person.id)
    const stepId = useTreeStore.getState().past.at(-1)?.id
    const parts = [
      removed.parentLinks.length > 0 && plural(removed.parentLinks.length, 'parent link'),
      removed.partnerships.length > 0 && plural(removed.partnerships.length, 'partnership'),
    ].filter(Boolean)
    useUiStore
      .getState()
      .showToast(`Deleted ${removed.person.firstName}${parts.length ? `, with ${parts.join(' and ')}` : ''}`, stepId)
    onClose()
  }

  return (
    <aside
      ref={panelRef}
      aria-label="Person details"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (mode.kind === 'view') onClose()
        else backToOverview()
      }}
      className={`fixed inset-x-0 bottom-0 z-30 max-h-[62dvh] overflow-y-auto rounded-t-xl border-t border-stone-400 bg-white p-4 pt-1 shadow-lg md:static md:max-h-none md:w-96 md:shrink-0 md:rounded-none md:border-t-0 md:border-l md:p-4 md:shadow-none ${
        !wide && sheet === 'expanded' ? 'h-[62dvh]' : ''
      }`}
    >
      {!wide && (
        <button
          type="button"
          aria-expanded={sheet === 'expanded'}
          aria-label={sheet === 'expanded' ? 'Collapse sheet' : 'Expand sheet'}
          onPointerDown={onHandleDown}
          onPointerUp={onHandleUp}
          onPointerCancel={() => (swipeStart.current = null)}
          onClick={onHandleClick}
          className="mx-auto mb-1 flex h-9 w-full touch-none items-center justify-center"
        >
          <span aria-hidden="true" className="block h-1.5 w-12 rounded-full bg-stone-500" />
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        {mode.kind !== 'add' && person.photoId && <Avatar person={person} size={56} />}
        <div className="min-w-0 flex-1">
          <h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-offset-4">
            {mode.kind === 'add' ? `Add ${mode.relation} of ${person.firstName}` : person.firstName}
            {mode.kind !== 'add' && person.lastName ? ` ${person.lastName}` : ''}
          </h2>
          {mode.kind !== 'add' && (
            <p className="text-sm text-stone-700">
              {[isFocus ? 'Focus person' : label, lifeSpan(person)].filter(Boolean).join(' · ')}
              {person.deceased && ' · deceased'}
            </p>
          )}
        </div>
        <button type="button" onClick={onClose} className="btn px-3">
          Close
        </button>
      </div>

      {mode.kind === 'add' && !readOnly && (
        <div className="mt-4">
          <AddRelativeForm
            anchor={person}
            relation={mode.relation}
            onCancel={backToOverview}
            onDone={(newId) => select(newId)}
          />
        </div>
      )}

      {mode.kind === 'edit' && !readOnly && (
        <EditForm
          person={person}
          onDone={backToOverview}
        />
      )}

      {peeking && (
        <div className="mt-3 flex gap-2">
          {!readOnly && (
            <button
              type="button"
              onClick={() => {
                focusAddAfterOpen.current = true
                setSheet('expanded')
              }}
              className="btn-primary flex-1  px-4 font-medium text-white"
            >
              Add relative
            </button>
          )}
          <button type="button" onClick={() => setSheet('expanded')} className="min-h-11 flex-1 rounded border border-line-strong px-4">
            Details
          </button>
        </div>
      )}

      {mode.kind === 'view' && !peeking && (
        <>
          {GROUPS.map((group) => {
            const entries =
              group.title === 'Parents'
                ? relatives.parents.map((p) => relativeButton(p))
                : group.title === 'Partners'
                  ? relatives.partners.map((p) => relativeButton(p.person, p.status === 'ended' ? 'former' : undefined))
                  : group.title === 'Siblings'
                    ? relatives.siblings.map((s) => relativeButton(s.person, s.half ? 'half' : undefined))
                    : relatives.children.map((c) => relativeButton(c))
            return (
              <section key={group.title} aria-labelledby={`group-${group.title}`} className="mt-5">
                <h3 id={`group-${group.title}`} className="font-semibold">
                  {group.title}
                </h3>
                {entries.length > 0 ? <ul className="mt-1 flex flex-wrap gap-2">{entries}</ul> : <p className="text-sm text-stone-700">None recorded</p>}
                <div className="mt-1 flex flex-wrap gap-2">
                  {!readOnly &&
                    group.add.map((relation) => (
                    <button
                      key={relation}
                      type="button"
                      aria-label={`Add ${relation}`}
                      onClick={() => setMode({ kind: 'add', relation })}
                      className="min-h-11 rounded border border-leaf-deep px-3 text-leaf-deep"
                    >
                      + {relation[0]!.toUpperCase() + relation.slice(1)}
                    </button>
                  ))}
                </div>
              </section>
            )
          })}

          {!readOnly && (
          <div className="mt-6 flex flex-col gap-2 border-t border-stone-300 pt-4">
            <button type="button" onClick={() => setMode({ kind: 'edit' })} className="btn px-4">
              Edit details
            </button>
            {!isFocus && (
              <button
                type="button"
                onClick={() => useTreeStore.getState().setFocusPerson(person.id)}
                className="btn px-4"
              >
                Make Focus person
              </button>
            )}
            <button type="button" onClick={onDelete} className="min-h-11 rounded border border-red-800 px-4 text-red-800">
              Delete {person.firstName}
            </button>
          </div>
          )}
        </>
      )}
    </aside>
  )
}

function EditForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const [values, setValues] = useState<PersonFormValues>(() => valuesOf(person))
  const [submitted, setSubmitted] = useState(false)
  const errors = submitted ? validate(values) : {}

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length > 0) return
    useTreeStore.getState().updatePerson(person.id, toPersonFields(values))
    onDone()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
      <PhotoField person={person} />
      <PersonFields values={values} onChange={setValues} errors={errors} showDates autoFocusFirstName />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1  px-4 font-medium text-white">
          Save
        </button>
        <button type="button" onClick={onDone} className="btn px-4">
          Cancel
        </button>
      </div>
    </form>
  )
}
