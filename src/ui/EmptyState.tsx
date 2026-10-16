import { type FormEvent, useState } from 'react'
import { useTreeStore } from '../domain/store.ts'
import { PersonFields } from './PersonFields.tsx'
import { type PersonFormValues, emptyValues, toPersonFields, validate } from './personForm.ts'
import { useUiStore } from './uiStore.ts'

/** First run: the one thing to do. The first Person becomes the Focus person (spec section 5). */
export function EmptyState() {
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

  return (
    <section aria-labelledby="empty-title" className="mx-auto w-full max-w-md px-4 py-8">
      <h2 id="empty-title" className="text-xl font-semibold">
        Start your family tree
      </h2>
      <p className="mt-2 text-stone-700">
        Begin with one person, usually yourself. You can then add their parents, partners, siblings and children.
      </p>
      <form onSubmit={onSubmit} noValidate className="mt-6 flex flex-col gap-4">
        <PersonFields values={values} onChange={setValues} errors={errors} autoFocusFirstName />
        <button type="submit" className="min-h-11 rounded bg-green-800 px-4 font-medium text-white">
          Add the first person
        </button>
      </form>
    </section>
  )
}
