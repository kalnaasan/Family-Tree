import { type FormEvent, type ReactNode, useId, useMemo, useState } from 'react'
import {
  type AddRelativeRequest,
  RELATIONS,
  type Relation,
  type RelativeAnswers,
  previewFor,
  questionFor,
} from '../domain/addRelative.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { useTreeStore } from '../domain/store.ts'
import { PersonFields } from './PersonFields.tsx'
import { type PersonFormValues, emptyValues, toPersonFields, validate } from './personForm.ts'

interface Props {
  anchor: Person
  relation: Relation
  /** Called with the new Person's id once they have been added. */
  onDone: (personId: string) => void
  onCancel: () => void
}

function Choice(props: { name: string; checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="radio" name={props.name} checked={props.checked} onChange={props.onSelect} className="size-5" />
      {props.children}
    </label>
  )
}

/**
 * Adds one relative. A question is asked only when the answer is ambiguous (spec section 5), and the form always
 * ends with "This will create: ..." so nothing happens that the user has not seen.
 */
export function AddRelativeForm({ anchor, relation, onDone, onCancel }: Props) {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const tree = useMemo<Tree>(
    () => ({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )

  const name = useId()
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
      })
      onDone(personId)
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'This could not be added.')
    }
  }

  if (question.kind === 'blocked') {
    return (
      <div className="flex flex-col gap-3">
        <p role="alert" className="rounded border border-red-800 p-3 text-red-800">
          {question.message}
        </p>
        <button type="button" onClick={onCancel} className="min-h-11 rounded border border-stone-500 px-4">
          Back
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <PersonFields values={values} onChange={setValues} errors={errors} autoFocusFirstName />

      {question.kind === 'parent-partnership' && (
        <fieldset>
          <legend className="text-sm font-medium">
            How is the new parent connected to {question.existingParent.firstName}?
          </legend>
          {(
            [
              ['current', 'Current partner'],
              ['ended', 'Former partner (ended)'],
              ['none', 'Not partners'],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              name={`${name}-partnership`}
              checked={(answers.parentPartnership ?? 'current') === value}
              onSelect={() => setAnswers({ ...answers, parentPartnership: value })}
            >
              {label}
            </Choice>
          ))}
        </fieldset>
      )}

      {question.kind === 'sibling-parents' && (
        <fieldset>
          <legend className="text-sm font-medium">Which parents do they share?</legend>
          <Choice
            name={`${name}-parents`}
            checked={(answers.siblingParents ?? 'both') === 'both'}
            onSelect={() => setAnswers({ ...answers, siblingParents: 'both' })}
          >
            Both: {question.parents[0].firstName} and {question.parents[1].firstName}
          </Choice>
          {question.parents.map((parent) => (
            <Choice
              key={parent.id}
              name={`${name}-parents`}
              checked={answers.siblingParents === parent.id}
              onSelect={() => setAnswers({ ...answers, siblingParents: parent.id })}
            >
              Only {parent.firstName} (half-sibling)
            </Choice>
          ))}
        </fieldset>
      )}

      {question.kind === 'child-other-parent' && (
        <fieldset>
          <legend className="text-sm font-medium">Who is the other parent?</legend>
          {question.partners.map(({ person, status }) => (
            <Choice
              key={person.id}
              name={`${name}-other`}
              checked={(answers.otherParentId === undefined ? question.defaultParentId : answers.otherParentId) === person.id}
              onSelect={() => setAnswers({ ...answers, otherParentId: person.id })}
            >
              {person.firstName} ({status === 'current' ? 'current partner' : 'former partner'})
            </Choice>
          ))}
          <Choice
            name={`${name}-other`}
            checked={(answers.otherParentId === undefined ? question.defaultParentId : answers.otherParentId) === null}
            onSelect={() => setAnswers({ ...answers, otherParentId: null })}
          >
            Nobody / not recorded
          </Choice>
        </fieldset>
      )}

      {question.kind === 'partner-status' && (
        <fieldset>
          <legend className="text-sm font-medium">Is this partnership current or ended?</legend>
          {(
            [
              ['current', 'Current'],
              ['ended', 'Ended'],
            ] as const
          ).map(([value, label]) => (
            <Choice
              key={value}
              name={`${name}-status`}
              checked={(answers.partnerStatus ?? 'current') === value}
              onSelect={() => setAnswers({ ...answers, partnerStatus: value })}
            >
              {label}
            </Choice>
          ))}
        </fieldset>
      )}

      <div aria-live="polite" className="rounded bg-stone-100 p-3 text-sm">
        <p className="font-medium">This will create:</p>
        <ul className="mt-1 list-disc pl-5">
          {preview.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>

      {failure && (
        <p role="alert" className="text-red-800">
          {failure}
        </p>
      )}

      <div className="flex gap-2">
        <button type="submit" className="min-h-11 flex-1 rounded bg-green-800 px-4 font-medium text-white">
          Add {relation}
        </button>
        <button type="button" onClick={onCancel} className="min-h-11 rounded border border-stone-500 px-4">
          Cancel
        </button>
      </div>
    </form>
  )
}
