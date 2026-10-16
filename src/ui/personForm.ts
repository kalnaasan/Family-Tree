import { type Gender, type Person, partialDateSchema } from '../domain/schema.ts'

/** The text the Person form edits. Strings throughout, so a half-typed date is just text. */
export interface PersonFormValues {
  firstName: string
  lastName: string
  gender: Gender
  birthDate: string
  deathDate: string
  deceased: boolean
}

export type PersonFormErrors = Partial<Record<'firstName' | 'birthDate' | 'deathDate', string>>

export const DATE_HELP = 'Use YYYY, YYYY-MM or YYYY-MM-DD'

export const emptyValues = (gender: Gender = 'unknown'): PersonFormValues => ({
  firstName: '',
  lastName: '',
  gender,
  birthDate: '',
  deathDate: '',
  deceased: false,
})

export const valuesOf = (person: Person): PersonFormValues => ({
  firstName: person.firstName,
  lastName: person.lastName ?? '',
  gender: person.gender,
  birthDate: person.birthDate ?? '',
  deathDate: person.deathDate ?? '',
  deceased: person.deceased,
})

export function validate(values: PersonFormValues): PersonFormErrors {
  const errors: PersonFormErrors = {}
  if (!values.firstName.trim()) errors.firstName = 'Enter a first name'
  for (const field of ['birthDate', 'deathDate'] as const) {
    const text = values[field].trim()
    if (text && !partialDateSchema.safeParse(text).success) errors[field] = DATE_HELP
  }
  return errors
}

/** The Person fields the form describes. A death date means the Person is deceased. */
export function toPersonFields(values: PersonFormValues) {
  const text = (value: string) => value.trim() || undefined
  return {
    firstName: values.firstName.trim(),
    lastName: text(values.lastName),
    gender: values.gender,
    birthDate: text(values.birthDate),
    deathDate: text(values.deathDate),
    deceased: values.deceased || Boolean(text(values.deathDate)),
  }
}
