import { useState } from 'react'
import { RELATION_KEY, type Relation, type RelationKind } from '../domain/addRelative.ts'
import type { Person } from '../domain/schema.ts'
import { capitalise, isolate } from '../i18n/format.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'
import { AddRelativeForm } from './AddRelativeForm.tsx'
import { LinkExistingForm } from './LinkExistingForm.tsx'
import { Modal } from './kit/Modal.tsx'

/** The ways to name the new relative for each kind of relation, the neutral one first (it presets no gender). */
const CHOICES: Record<RelationKind, Relation[]> = {
  parent: ['parent', 'father', 'mother'],
  partner: ['partner', 'husband', 'wife'],
  child: ['child', 'son', 'daughter'],
  sibling: ['sibling', 'brother', 'sister'],
}

const TITLE: Record<RelationKind, MessageKey> = {
  parent: 'relDialog.title.parent',
  partner: 'relDialog.title.partner',
  child: 'relDialog.title.child',
  sibling: 'relDialog.title.sibling',
}

type Method = 'create' | 'link'

interface Props {
  anchor: Person
  kind: RelationKind
  onClose: () => void
  /** A new Person was added (their id), or an existing one linked (no id). */
  onDone: (newPersonId?: string) => void
}

/**
 * One dialog for adding or linking a relative, whichever the kind (spec section 5): first choose how they are related
 * and whether to create them or link someone already in the Tree, then fill in the details. The details step is the
 * add-relative or link form unchanged, so a question is still asked only when the answer is ambiguous and the
 * "This will create / link" preview is still the review before anything is saved.
 */
export function RelativeDialog({ anchor, kind, onClose, onDone }: Props) {
  const t = useT()
  const [step, setStep] = useState<'choose' | 'details'>('choose')
  const [relation, setRelation] = useState<Relation>(CHOICES[kind][0]!)
  const [method, setMethod] = useState<Method>('create')
  const relationWord = (r: Relation) => capitalise(t(RELATION_KEY[r]))

  return (
    <Modal title={t(TITLE[kind], { name: isolate(anchor.firstName) })} onClose={onClose} wide={step === 'details'}>
      <p className="mb-3 text-sm text-ink-soft">{t('relDialog.step', { n: step === 'choose' ? 1 : 2, total: 2 })}</p>

      {step === 'choose' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            setStep('details')
          }}
          className="flex flex-col gap-5"
        >
          <fieldset>
            <legend className="font-semibold">{t('relDialog.relation')}</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHOICES[kind].map((choice) => (
                <label
                  key={choice}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-line-strong px-4 has-[:checked]:border-leaf-deep has-[:checked]:bg-accent-soft has-[:checked]:font-semibold"
                >
                  <input
                    type="radio"
                    name="relation"
                    value={choice}
                    checked={relation === choice}
                    data-autofocus={relation === choice ? '' : undefined}
                    onChange={() => setRelation(choice)}
                    className="size-5 accent-leaf-deep"
                  />
                  {relationWord(choice)}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="font-semibold">{t('relDialog.how')}</legend>
            <div className="mt-1 flex flex-col gap-2">
              {(
                [
                  ['create', 'relDialog.create', 'relDialog.createHint'],
                  ['link', 'relDialog.link', 'relDialog.linkHint'],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-line-strong px-4 py-2 has-[:checked]:border-leaf-deep has-[:checked]:bg-accent-soft"
                >
                  <input
                    type="radio"
                    name="method"
                    value={value}
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    className="mt-0.5 size-5 accent-leaf-deep"
                  />
                  <span>
                    <span className="block font-medium">{t(label)}</span>
                    <span className="block text-sm text-ink-soft">{t(hint)}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="btn px-4">
              {t('common.cancel')}
            </button>
            <button type="submit" className="btn-primary px-5">
              {t('common.continue')}
            </button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <button type="button" onClick={() => setStep('choose')} className="btn-ghost -ms-3">
              {t('addForm.back')}
            </button>
          </div>
          {method === 'create' ? (
            <AddRelativeForm anchor={anchor} relation={relation} onCancel={onClose} onDone={(id) => onDone(id)} hasBack />
          ) : (
            <LinkExistingForm anchor={anchor} relation={relation} onCancel={onClose} onDone={() => onDone()} />
          )}
        </div>
      )}
    </Modal>
  )
}
