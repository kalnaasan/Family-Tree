import { type FormEvent, useEffect, useId, useRef, useState } from 'react'
import { IntegrityError } from '../domain/integrity.ts'
import {
  type ParentLink,
  type ParentLinkKind,
  type Partnership,
  type PartnershipStatus,
  type Tree,
  partialDateSchema,
} from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { setParentLinkKind } from '../domain/tree.ts'
import { isolate } from '../i18n/format.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'
import { DATE_HELP } from './personForm.ts'

/** The link the dialog edits: a Parent link (child and parent) or a Partnership. */
export type LinkTarget = { kind: 'parent'; childId: string; parentId: string } | { kind: 'partnership'; id: string }

const KINDS: { value: ParentLinkKind; label: MessageKey }[] = [
  { value: 'birth', label: 'editLink.birth' },
  { value: 'adoptive', label: 'editLink.adoptive' },
  { value: 'step', label: 'editLink.step' },
]

const STATUSES: { value: PartnershipStatus; label: MessageKey }[] = [
  { value: 'current', label: 'addForm.statusCurrent' },
  { value: 'ended', label: 'addForm.statusEnded' },
]

const inputClass = 'mt-1 block min-h-11 w-full rounded border border-line-strong bg-white px-2'

const nameOf = (tree: Tree, id: string) => tree.persons.find((p) => p.id === id)?.firstName ?? ''

/** Whether the Tree refuses this kind for the Parent link: the child would have three birth parents. Any other
 * refusal is not a reason to hide a choice: Save reports it. */
function refusesKind(tree: Tree, link: ParentLink, kind: ParentLinkKind): boolean {
  try {
    setParentLinkKind(tree, link.childId, link.parentId, kind)
    return false
  } catch (error) {
    return error instanceof IntegrityError && error.rule === 'third-birth-parent'
  }
}

/**
 * "Edit link" (spec section 5.1): the kind of a Parent link, or the status and dates of a Partnership. Save is one Undo
 * step, Cancel changes nothing. A modal dialog, so the keyboard stays inside it; the caller returns focus to the chip.
 */
export function EditLinkDialog({ target, onClose }: { target: LinkTarget; onClose: () => void }) {
  const t = useT()
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const tree: Tree = { focusPersonId, persons, parentLinks, partnerships }

  const link =
    target.kind === 'parent'
      ? parentLinks.find((l) => l.childId === target.childId && l.parentId === target.parentId)
      : undefined
  const partnership = target.kind === 'partnership' ? partnerships.find((p) => p.id === target.id) : undefined

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    // the choice that is on now, so the keyboard starts where the answer is
    dialog?.querySelector<HTMLInputElement>('input:checked:not(:disabled)')?.focus()
    return () => dialog?.close()
  }, [])

  const [first, second] =
    target.kind === 'parent'
      ? [nameOf(tree, target.childId), nameOf(tree, target.parentId)]
      : [nameOf(tree, partnership?.personIds[0] ?? ''), nameOf(tree, partnership?.personIds[1] ?? '')]

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      // Escape closes the dialog only, not the Person panel it sits in
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.stopPropagation()
        event.preventDefault()
        onClose()
      }}
      className="m-auto max-h-[90dvh] w-[min(92vw,28rem)] overflow-y-auto rounded-xl border border-stone-400 bg-white p-5 shadow-xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        {t('step.editLink', { first, second })}
      </h2>
      {link && <ParentLinkForm tree={tree} link={link} onClose={onClose} />}
      {partnership && <PartnershipForm partnership={partnership} onClose={onClose} />}
    </dialog>
  )
}

function Buttons({ onCancel }: { onCancel: () => void }) {
  const t = useT()
  return (
    <div className="flex gap-2">
      <button type="submit" className="btn-primary flex-1 px-4 font-medium text-white">
        {t('common.save')}
      </button>
      <button type="button" onClick={onCancel} className="btn px-4">
        {t('common.cancel')}
      </button>
    </div>
  )
}

function ParentLinkForm({ tree, link, onClose }: { tree: Tree; link: ParentLink; onClose: () => void }) {
  const t = useT()
  const id = useId()
  const [kind, setKind] = useState<ParentLinkKind>(link.kind)
  const [failure, setFailure] = useState<string | null>(null)

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    // nothing changed: no Undo step
    if (kind === link.kind) return onClose()
    try {
      useTreeStore.getState().setParentLinkKind(link.childId, link.parentId, kind)
      onClose()
    } catch (error) {
      // the reason is a rule of the Tree's integrity, technical detail that stays in English
      setFailure(t('addForm.failure', { detail: isolate(error instanceof Error ? error.message : String(error)) }))
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
      <fieldset>
        <legend className="text-sm font-medium">
          {t('editLink.kind', { parent: nameOf(tree, link.parentId), child: nameOf(tree, link.childId) })}
        </legend>
        {KINDS.map(({ value, label }) => {
          const refused = refusesKind(tree, link, value)
          return (
            <div key={value}>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="radio"
                  name={`${id}-kind`}
                  checked={kind === value}
                  disabled={refused}
                  aria-describedby={refused ? `${id}-${value}-reason` : undefined}
                  onChange={() => setKind(value)}
                  className="size-5"
                />
                {t(label)}
              </label>
              {refused && (
                <p id={`${id}-${value}-reason`} className="ms-7 text-sm text-stone-700">
                  {t('link.reason.third-birth-parent')}
                </p>
              )}
            </div>
          )
        })}
      </fieldset>
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      <Buttons onCancel={onClose} />
    </form>
  )
}

function PartnershipForm({ partnership, onClose }: { partnership: Partnership; onClose: () => void }) {
  const t = useT()
  const id = useId()
  const [status, setStatus] = useState<PartnershipStatus>(partnership.status)
  const [dates, setDates] = useState({ startDate: partnership.startDate ?? '', endDate: partnership.endDate ?? '' })
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // the end date belongs to an ended Partnership only
  const fields = status === 'ended' ? (['startDate', 'endDate'] as const) : (['startDate'] as const)
  const bad = (field: 'startDate' | 'endDate') =>
    fields.some((f) => f === field) &&
    Boolean(dates[field].trim()) &&
    !partialDateSchema.safeParse(dates[field].trim()).success
  const errors = { startDate: submitted && bad('startDate'), endDate: submitted && bad('endDate') }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (bad('startDate') || bad('endDate')) return
    try {
      useTreeStore.getState().updatePartnership(partnership.id, {
        status,
        startDate: dates.startDate.trim() || undefined,
        endDate: status === 'ended' ? dates.endDate.trim() || undefined : undefined,
      })
      onClose()
    } catch (error) {
      setFailure(t('addForm.failure', { detail: isolate(error instanceof Error ? error.message : String(error)) }))
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-4">
      <fieldset>
        <legend className="text-sm font-medium">{t('addForm.partnerStatus')}</legend>
        {STATUSES.map(({ value, label }) => (
          <label key={value} className="flex min-h-11 items-center gap-2">
            <input
              type="radio"
              name={`${id}-status`}
              checked={status === value}
              onChange={() => setStatus(value)}
              className="size-5"
            />
            {t(label)}
          </label>
        ))}
      </fieldset>
      {fields.map((field) => (
        <div key={field}>
          <label htmlFor={`${id}-${field}`} className="text-sm font-medium">
            {field === 'startDate' ? t('editLink.start') : t('editLink.end')}
          </label>
          <input
            id={`${id}-${field}`}
            dir="ltr"
            value={dates[field]}
            onChange={(e) => setDates({ ...dates, [field]: e.target.value })}
            placeholder={t('fields.datePlaceholder')}
            autoComplete="off"
            aria-invalid={errors[field] ? true : undefined}
            aria-describedby={`${id}-${field}-help`}
            className={`${inputClass} input-start`}
          />
          <p id={`${id}-${field}-help`} className={`mt-1 text-sm ${errors[field] ? 'text-red-800' : 'text-stone-700'}`}>
            {t(DATE_HELP)}
          </p>
        </div>
      ))}
      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}
      <Buttons onCancel={onClose} />
    </form>
  )
}
