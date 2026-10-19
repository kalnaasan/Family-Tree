import { useId } from 'react'
import type { Gender } from '../domain/schema.ts'
import type { MessageKey } from '../i18n/messages.ts'
import { useT } from '../i18n/useT.ts'
import { DATE_HELP, type PersonFormErrors, type PersonFormValues } from './personForm.ts'

const GENDERS: { value: Gender; label: MessageKey }[] = [
  { value: 'female', label: 'gender.female' },
  { value: 'male', label: 'gender.male' },
  { value: 'other', label: 'gender.other' },
  { value: 'unknown', label: 'gender.unknown' },
]

const inputClass = 'mt-1 block min-h-11 w-full rounded border border-line-strong bg-white px-2'

interface Props {
  values: PersonFormValues
  onChange: (values: PersonFormValues) => void
  errors?: PersonFormErrors
  /** Birth and death dates and the deceased box: for editing a Person, not for adding one. */
  showDates?: boolean
  autoFocusFirstName?: boolean
}

/** The fields shared by "add the first person", "add a relative" and "edit". */
export function PersonFields({ values, onChange, errors = {}, showDates = false, autoFocusFirstName = false }: Props) {
  const t = useT()
  const id = useId()
  const set = <K extends keyof PersonFormValues>(key: K, value: PersonFormValues[K]) =>
    onChange({ ...values, [key]: value })

  return (
    <div className="flex flex-col gap-3">
      <div>
        <label htmlFor={`${id}-first`} className="text-sm font-medium">
          {t('fields.firstName')}
        </label>
        <input
          id={`${id}-first`}
          dir="auto"
          value={values.firstName}
          onChange={(e) => set('firstName', e.target.value)}
          autoFocus={autoFocusFirstName}
          autoComplete="off"
          aria-invalid={errors.firstName ? true : undefined}
          aria-describedby={errors.firstName ? `${id}-first-error` : undefined}
          className={inputClass}
        />
        {errors.firstName && (
          <p id={`${id}-first-error`} className="mt-1 text-sm text-danger">
            {t(errors.firstName)}
          </p>
        )}
      </div>
      <div>
        <label htmlFor={`${id}-last`} className="text-sm font-medium">
          {t('fields.lastName')}
        </label>
        <input
          id={`${id}-last`}
          dir="auto"
          value={values.lastName}
          onChange={(e) => set('lastName', e.target.value)}
          autoComplete="off"
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`${id}-gender`} className="text-sm font-medium">
          {t('fields.gender')}
        </label>
        <select
          id={`${id}-gender`}
          value={values.gender}
          onChange={(e) => set('gender', e.target.value as Gender)}
          className={inputClass}
        >
          {GENDERS.map((g) => (
            <option key={g.value} value={g.value}>
              {t(g.label)}
            </option>
          ))}
        </select>
      </div>
      {showDates && (
        <>
          {(['birthDate', 'deathDate'] as const).map((field) => (
            <div key={field}>
              <label htmlFor={`${id}-${field}`} className="text-sm font-medium">
                {field === 'birthDate' ? t('fields.born') : t('fields.died')}
              </label>
              <input
                id={`${id}-${field}`}
                dir="ltr"
                value={values[field]}
                onChange={(e) => set(field, e.target.value)}
                placeholder={t('fields.datePlaceholder')}
                autoComplete="off"
                aria-invalid={errors[field] ? true : undefined}
                aria-describedby={`${id}-${field}-help`}
                className={`${inputClass} input-start`}
              />
              <p id={`${id}-${field}-help`} className={`mt-1 text-sm ${errors[field] ? 'text-danger' : 'text-ink-soft'}`}>
                {t(errors[field] ?? DATE_HELP)}
              </p>
            </div>
          ))}
          <label className="flex min-h-11 items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={values.deceased || Boolean(values.deathDate.trim())}
              disabled={Boolean(values.deathDate.trim())}
              onChange={(e) => set('deceased', e.target.checked)}
              className="size-5"
            />
            {t('fields.deceased')}
          </label>
        </>
      )}
    </div>
  )
}
