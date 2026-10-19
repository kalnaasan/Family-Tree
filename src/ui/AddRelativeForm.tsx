import { type FormEvent, useMemo, useState } from 'react'
import {
  type AddRelativeRequest,
  RELATIONS,
  RELATION_KEY,
  type Relation,
  type RelativeAnswers,
  previewFor,
  questionFor,
} from '../domain/addRelative.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { isolate } from '../i18n/format.ts'
import { renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { RelativeQuestions } from './RelativeQuestions.tsx'
import { PersonFields } from './PersonFields.tsx'
import { type PersonFormValues, emptyValues, toPersonFields, validate } from './personForm.ts'

interface Props {
  anchor: Person
  relation: Relation
  /** Called with the new Person's id once they have been added. */
  onDone: (personId: string) => void
  onCancel: () => void
  /** When the caller has its own way back (the dialog's Back), a blocked add does not draw a second one. */
  hasBack?: boolean
}

/**
 * Adds one relative. A question is asked only when the answer is ambiguous (spec section 5), and the form always
 * ends with "This will create: ..." so nothing happens that the user has not seen.
 */
export function AddRelativeForm({ anchor, relation, onDone, onCancel, hasBack = false }: Props) {
  const t = useT()
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const tree = useMemo<Tree>(
    () => ({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )

  const [values, setValues] = useState<PersonFormValues>(() => emptyValues(RELATIONS[relation].gender))
  const [answers, setAnswers] = useState<RelativeAnswers>({})
  const [submitted, setSubmitted] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const question = useMemo(() => questionFor(tree, anchor.id, relation), [tree, anchor.id, relation])
  const request: AddRelativeRequest = {
    anchorId: anchor.id,
    relation,
    person: { firstName: values.firstName, gender: values.gender },
    answers,
    // stored with the new parent, so it is made in the language in use now
    unnamedParentName: t('person.unnamedParent'),
  }
  const preview = previewFor(tree, request)
  const errors = submitted ? validate(values) : {}

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length > 0) return
    try {
      const personId = useTreeStore.getState().addRelative({
        anchorId: anchor.id,
        relation,
        person: toPersonFields(values),
        answers,
        unnamedParentName: request.unnamedParentName,
      })
      onDone(personId)
    } catch (error) {
      // the reason is a rule of the Tree's integrity, technical detail that stays in English
      setFailure(t('addForm.failure', { detail: isolate(error instanceof Error ? error.message : String(error)) }))
    }
  }

  if (question.kind === 'blocked') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded border border-danger p-3 text-danger">
          {renderMessage(t, question.message)}
        </p>
        {!hasBack && (
          <button type="button" onClick={onCancel} className="btn px-4">
            {t('addForm.back')}
          </button>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <PersonFields values={values} onChange={setValues} errors={errors} autoFocusFirstName />

      <RelativeQuestions question={question} answers={answers} onChange={setAnswers} />

      <div aria-live="polite" className="rounded bg-surface-soft p-3 text-sm">
        <p className="font-medium">{t('preview.title')}</p>
        <ul className="mt-1 list-disc ps-5">
          {preview.map((line, n) => (
            <li key={n}>{renderMessage(t, line)}</li>
          ))}
        </ul>
      </div>

      {failure && (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1  px-4 font-medium text-white">
          {t('addForm.submit', { relation: t(RELATION_KEY[relation]) })}
        </button>
        <button type="button" onClick={onCancel} className="btn px-4">
          {t('common.cancel')}
        </button>
      </div>
    </form>
  )
}
