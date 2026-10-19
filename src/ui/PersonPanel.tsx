import { type FormEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import type { RelationKind } from '../domain/addRelative.ts'
import { relativesOf } from '../domain/groups.ts'
import { deriveRelationships } from '../domain/labels.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatList, isolate } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { type MessageRef, msg } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { lifeSpan } from '../view/text.ts'
import type { LinkTarget } from './EditLinkDialog.tsx'
import { LinkMenu } from './LinkMenu.tsx'
import { PersonFields } from './PersonFields.tsx'
import { CloseIcon, PlusIcon } from './icons.tsx'
import { ConfirmDialog } from './kit/ConfirmDialog.tsx'
import { ActionMenu } from './kit/Menu.tsx'
import { PersonAvatar } from './kit/PersonAvatar.tsx'
import { PhotoField } from './PhotoField.tsx'
import { RelativeDialog } from './RelativeDialog.tsx'
import { type PersonFormValues, toPersonFields, validate, valuesOf } from './personForm.ts'
import { useUiStore } from './uiStore.ts'
import { useLabeler } from './useLabeler.ts'
import { useWideScreen } from './useWideScreen.ts'

/** A swipe on the sheet's handle must travel this far, in pixels, to count (a shorter press is a tap). */
const SWIPE_PX = 40

type Mode = { kind: 'view' } | { kind: 'edit' }

type GroupKey = 'parents' | 'partners' | 'siblings' | 'children'

const GROUPS: { key: GroupKey; kind: RelationKind }[] = [
  { key: 'parents', kind: 'parent' },
  { key: 'partners', kind: 'partner' },
  { key: 'children', kind: 'child' },
  { key: 'siblings', kind: 'sibling' },
]

interface Props {
  personId: string
  onClose: () => void
}

/**
 * The Person's detail view and the way to add relatives (spec section 5): a sticky header with the Person and their
 * actions, then relatives grouped as Parents / Partners / Children / Siblings, each with one "Add" button that opens
 * the relative dialog. Edit is in the header; making the Focus person and deleting are in its menu. Mount it with
 * `key={personId}` so each Person starts from the overview.
 */
export function PersonPanel({ personId, onClose }: Props) {
  const t = useT()
  const language = useLanguageStore((s) => s.language)
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const readOnly = useTreeStore((s) => s.readOnly)
  const select = useUiStore((s) => s.select)
  const [mode, setMode] = useState<Mode>({ kind: 'view' })
  const [adding, setAdding] = useState<RelationKind | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
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
    panelRef.current?.querySelector<HTMLButtonElement>('button[data-add]')?.focus()
  }, [sheet])

  const tree = useMemo<Tree>(
    () => ({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  const person = persons.find((p) => p.id === personId)
  const relationships = useMemo(() => deriveRelationships(tree), [tree])
  const labelOf = useLabeler(relationships)
  const relatives = useMemo(() => (person ? relativesOf(tree, person.id) : null), [tree, person])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  if (!person || !relatives) return null
  const isFocus = focusPersonId === person.id
  const label = labelOf(person)

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

  /** A row for one relative; a parent, child or partner row also has the link menu (a derived sibling has none). */
  const relativeButton = (relative: Person, note?: string, link?: LinkTarget) => {
    const details = [labelOf(relative), note].filter((part): part is string => Boolean(part))
    return (
      <li key={relative.id} className="flex flex-wrap items-center gap-1">
        <button type="button" onClick={() => select(relative.id)} className="person-row min-w-0 flex-1">
          <PersonAvatar person={relative} />
          <span className="min-w-0">
            <bdi className="block truncate font-medium">{[relative.firstName, relative.lastName].filter(Boolean).join(' ')}</bdi>
            {details.length > 0 && <span className="block text-sm text-ink-soft">{formatList(details, language)}</span>}
          </span>
        </button>
        {link && !readOnly && <LinkMenu target={link} name={relative.firstName} onRemoved={backToOverview} />}
      </li>
    )
  }
  const parentOf = (parent: Person): LinkTarget => ({ kind: 'parent', childId: person.id, parentId: parent.id })
  const childOf = (child: Person): LinkTarget => ({ kind: 'parent', childId: child.id, parentId: person.id })
  const partnershipWith = (other: Person): LinkTarget | undefined => {
    const found = partnerships.find((p) => p.personIds.includes(person.id) && p.personIds.includes(other.id))
    return found && { kind: 'partnership', id: found.id }
  }

  const onDelete = () => {
    const removed = useTreeStore.getState().deletePerson(person.id)
    const stepId = useTreeStore.getState().past.at(-1)?.id
    // what went with them, as messages: the toast is worded in the language in use when it is drawn
    const parts = [
      removed.parentLinks.length > 0 && msg('toast.parentLinks', { count: removed.parentLinks.length }),
      removed.partnerships.length > 0 && msg('toast.partnerships', { count: removed.partnerships.length }),
    ].filter((part): part is MessageRef => Boolean(part))
    const what =
      parts.length === 2 ? msg('toast.bothParts', { first: parts[0]!, second: parts[1]! }) : parts[0]
    useUiStore
      .getState()
      .showToast(
        what
          ? msg('toast.deletedWith', { name: removed.person.firstName, parts: what })
          : msg('toast.deleted', { name: removed.person.firstName }),
        stepId,
      )
    onClose()
  }

  const menuItems = [
    ...(isFocus ? [] : [{ key: 'focus', label: t('panel.makeFocus'), onSelect: () => useTreeStore.getState().setFocusPerson(person.id) }]),
    { key: 'delete', label: t('panel.delete', { name: person.firstName }), onSelect: () => setConfirmingDelete(true), danger: true },
  ]

  return (
    <aside
      ref={panelRef}
      aria-label={t('panel.label')}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        if (mode.kind === 'view') onClose()
        else backToOverview()
      }}
      className={`fixed inset-x-0 bottom-0 z-30 max-h-[62dvh] overflow-y-auto rounded-t-xl border-t border-line bg-surface pb-4 shadow-raised md:static md:max-h-none md:w-96 md:shrink-0 md:rounded-none md:border-t-0 md:border-s md:shadow-none ${
        !wide && sheet === 'expanded' ? 'h-[62dvh]' : ''
      }`}
    >
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-4 pb-3 pt-1">
        {!wide && (
          <button
            type="button"
            aria-expanded={sheet === 'expanded'}
            aria-label={sheet === 'expanded' ? t('panel.collapseSheet') : t('panel.expandSheet')}
            onPointerDown={onHandleDown}
            onPointerUp={onHandleUp}
            onPointerCancel={() => (swipeStart.current = null)}
            onClick={onHandleClick}
            className="mx-auto mb-1 flex h-9 w-full touch-none items-center justify-center"
          >
            <span aria-hidden="true" className="block h-1.5 w-12 rounded-full bg-line-strong" />
          </button>
        )}
        <div className="flex items-start gap-3 pt-2">
          <PersonAvatar person={person} size={peeking ? 44 : 56} />
          <div className="min-w-0 flex-1">
            <h2 ref={headingRef} tabIndex={-1} dir="auto" className="break-words text-xl font-semibold outline-offset-4">
              {person.firstName}
              {person.lastName ? ` ${person.lastName}` : ''}
            </h2>
            <p className="text-sm text-ink-soft">
              {[isFocus ? t('person.focus') : label, lifeSpan(person, t)].filter(Boolean).join(' · ')}
              {person.deceased && ` · ${t('person.deceased')}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={t('common.close')} title={t('common.close')} className="btn btn-icon shrink-0">
            <CloseIcon />
          </button>
        </div>
        {!readOnly && mode.kind === 'view' && !peeking && (
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => setMode({ kind: 'edit' })} className="btn flex-1 px-4">
              {t('panel.edit')}
            </button>
            <ActionMenu label={t('panel.moreActions', { name: person.firstName })} items={menuItems} />
          </div>
        )}
      </div>

      <div className="px-4">
        {mode.kind === 'edit' && !readOnly && <EditForm person={person} onDone={backToOverview} />}

        {peeking && (
          <div className="mt-3 flex gap-2">
            {!readOnly && (
              <button
                type="button"
                onClick={() => {
                  focusAddAfterOpen.current = true
                  setSheet('expanded')
                }}
                className="btn-primary flex-1 px-4"
              >
                {t('panel.addRelative')}
              </button>
            )}
            <button type="button" onClick={() => setSheet('expanded')} className="btn flex-1 px-4">
              {t('panel.details')}
            </button>
          </div>
        )}

        {mode.kind === 'view' && !peeking && (
          <>
            {GROUPS.map((group) => {
              const entries =
                group.key === 'parents'
                  ? [
                      ...relatives.parents.map((p) => relativeButton(p, undefined, parentOf(p))),
                      ...relatives.stepParents.map((p) => relativeButton(p, t('panel.noteStep'), parentOf(p))),
                    ]
                  : group.key === 'partners'
                    ? relatives.partners.map((p) =>
                        relativeButton(p.person, p.status === 'ended' ? t('panel.noteFormer') : undefined, partnershipWith(p.person)),
                      )
                    : group.key === 'siblings'
                      ? relatives.siblings.map((s) => relativeButton(s.person, s.half ? t('panel.noteHalf') : undefined))
                      : [
                          ...relatives.children.map((c) => relativeButton(c, undefined, childOf(c))),
                          ...relatives.stepChildren.map((c) => relativeButton(c, t('panel.noteStep'), childOf(c))),
                        ]
              return (
                <section key={group.key} aria-labelledby={`group-${group.key}`} className="mt-5">
                  <div className="flex items-center justify-between gap-2 border-b border-line pb-1">
                    <h3 id={`group-${group.key}`} className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
                      {t(`panel.group.${group.key}`)}
                    </h3>
                    {!readOnly && (
                      <button
                        type="button"
                        data-add=""
                        aria-label={t(`panel.addTo.${group.key}`)}
                        onClick={() => setAdding(group.kind)}
                        className="btn-ghost -me-2"
                      >
                        <PlusIcon />
                        {t('common.add')}
                      </button>
                    )}
                  </div>
                  {entries.length > 0 ? (
                    <ul className="mt-1 flex flex-col">{entries}</ul>
                  ) : (
                    <p className="mt-2 text-sm text-ink-soft">{t('panel.none')}</p>
                  )}
                </section>
              )
            })}
          </>
        )}
      </div>

      {adding && !readOnly && (
        <RelativeDialog
          anchor={person}
          kind={adding}
          onClose={() => {
            setAdding(null)
            queueMicrotask(() => headingRef.current?.focus())
          }}
          onDone={(newId) => {
            setAdding(null)
            if (newId) select(newId)
            else queueMicrotask(() => headingRef.current?.focus())
          }}
        />
      )}
      {confirmingDelete && !readOnly && (
        <ConfirmDialog
          danger
          title={t('delete.title', { name: isolate(person.firstName) })}
          confirmLabel={t('panel.delete', { name: person.firstName })}
          onConfirm={() => {
            setConfirmingDelete(false)
            onDelete()
          }}
          onCancel={() => {
            setConfirmingDelete(false)
            queueMicrotask(() => headingRef.current?.focus())
          }}
        >
          <p>{t('delete.body', { name: isolate(person.firstName) })}</p>
          <p className="mt-2">{t('delete.undo')}</p>
        </ConfirmDialog>
      )}
    </aside>
  )
}

function EditForm({ person, onDone }: { person: Person; onDone: () => void }) {
  const t = useT()
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
          {t('common.save')}
        </button>
        <button type="button" onClick={onDone} className="btn px-4">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
