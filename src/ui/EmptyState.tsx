import { type FormEvent, useState } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { useT } from '../i18n/useT.ts'
import { PersonFields } from './PersonFields.tsx'
import { type PersonFormValues, emptyValues, toPersonFields, validate } from './personForm.ts'
import { useUiStore } from './uiStore.ts'

/** First run: the one thing to do. The first Person becomes the Focus person (spec section 5). */
export function EmptyState() {
  const t = useT()
  const readOnly = useTreeStore((s) => s.readOnly)
  const [values, setValues] = useState<PersonFormValues>(emptyValues())
  const [submitted, setSubmitted] = useState(false)
  const errors = submitted ? validate(values) : {}

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    if (Object.keys(validate(values)).length > 0) return
    const id = crypto.randomUUID()
    useTreeStore.getState().addPerson({ ...toPersonFields(values), id })
    useUiStore.getState().select(id)
  }

  if (readOnly) {
    return (
      <section aria-labelledby="empty-title" className="mx-auto w-full max-w-md px-4 py-8">
        <h2 id="empty-title" className="text-xl font-semibold">
          {t('empty.readOnlyTitle')}
        </h2>
        <p className="mt-2 text-ink-soft">{t('empty.readOnlyBody')}</p>
      </section>
    )
  }

  return (
    <section aria-labelledby="empty-title" className="mx-auto w-full max-w-md px-4 py-8">
      <h2 id="empty-title" className="text-xl font-semibold">
        {t('empty.title')}
      </h2>
      <p className="mt-2 text-ink-soft">{t('empty.body')}</p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <PersonFields values={values} onChange={setValues} errors={errors} autoFocusFirstName />
        <button type="submit" className="btn-primary  px-4 font-medium text-white">
          {t('empty.add')}
        </button>
      </form>
    </section>
  )
}
