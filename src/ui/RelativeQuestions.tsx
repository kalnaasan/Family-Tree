import { type ReactNode, useId } from 'react'
import type { Question, RelativeAnswers } from '../domain/addRelative.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'

function Choice(props: { name: string; checked: boolean; onSelect: () => void; children: ReactNode }) {
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="radio" name={props.name} checked={props.checked} onChange={props.onSelect} className="size-5" />
      {props.children}
    </label>
  )
}

/** The inline question of an add-relative or link flow (spec section 5): asked only when the answer is ambiguous. */
export function RelativeQuestions(props: {
  question: Question
  answers: RelativeAnswers
  onChange: (answers: RelativeAnswers) => void
}) {
  const t = useT()
  const name = useId()
  const { question, answers } = props
  const setAnswers = props.onChange
  return (
    <>
    {question.kind === 'parent-partnership' && (
      <fieldset>
        <legend className="text-sm font-medium">
          {t('addForm.parentPartnership', { name: question.existingParent.firstName })}
        </legend>
        {(
          [
            ['current', 'addForm.partnerCurrent'],
            ['ended', 'addForm.partnerEnded'],
            ['none', 'addForm.partnerNone'],
          ] as const satisfies readonly (readonly [string, MessageKey])[]
        ).map(([value, label]) => (
          <Choice
            key={value}
            name={`${name}-partnership`}
            checked={(answers.parentPartnership ?? 'current') === value}
            onSelect={() => setAnswers({ ...answers, parentPartnership: value })}
          >
            {t(label)}
          </Choice>
        ))}
      </fieldset>
    )}

    {question.kind === 'sibling-parents' && (
      <fieldset>
        <legend className="text-sm font-medium">{t('addForm.siblingParents')}</legend>
        <Choice
          name={`${name}-parents`}
          checked={(answers.siblingParents ?? 'both') === 'both'}
          onSelect={() => setAnswers({ ...answers, siblingParents: 'both' })}
        >
          {t('addForm.sharesBoth', { first: question.parents[0].firstName, second: question.parents[1].firstName })}
        </Choice>
        {question.parents.map((parent) => (
          <Choice
            key={parent.id}
            name={`${name}-parents`}
            checked={answers.siblingParents === parent.id}
            onSelect={() => setAnswers({ ...answers, siblingParents: parent.id })}
          >
            {t('addForm.sharesOnly', { name: parent.firstName })}
          </Choice>
        ))}
      </fieldset>
    )}

    {question.kind === 'child-other-parent' && (
      <fieldset>
        <legend className="text-sm font-medium">{t('addForm.otherParent')}</legend>
        {question.partners.map(({ person, status }) => (
          <Choice
            key={person.id}
            name={`${name}-other`}
            checked={(answers.otherParentId === undefined ? question.defaultParentId : answers.otherParentId) === person.id}
            onSelect={() => setAnswers({ ...answers, otherParentId: person.id })}
          >
            {t(status === 'current' ? 'addForm.otherCurrent' : 'addForm.otherFormer', { name: person.firstName })}
          </Choice>
        ))}
        <Choice
          name={`${name}-other`}
          checked={(answers.otherParentId === undefined ? question.defaultParentId : answers.otherParentId) === null}
          onSelect={() => setAnswers({ ...answers, otherParentId: null })}
        >
          {t('addForm.otherNobody')}
        </Choice>
      </fieldset>
    )}

    {question.kind === 'partner-status' && (
      <fieldset>
        <legend className="text-sm font-medium">{t('addForm.partnerStatus')}</legend>
        {(
          [
            ['current', 'addForm.statusCurrent'],
            ['ended', 'addForm.statusEnded'],
          ] as const satisfies readonly (readonly [string, MessageKey])[]
        ).map(([value, label]) => (
          <Choice
            key={value}
            name={`${name}-status`}
            checked={(answers.partnerStatus ?? 'current') === value}
            onSelect={() => setAnswers({ ...answers, partnerStatus: value })}
          >
            {t(label)}
          </Choice>
        ))}
      </fieldset>
    )}

    </>
  )
}
