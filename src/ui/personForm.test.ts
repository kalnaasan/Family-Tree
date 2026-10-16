import { describe, expect, it } from 'vitest'
import { DATE_HELP, emptyValues, toPersonFields, validate, valuesOf } from './personForm.ts'

describe('validate', () => {
  it('needs a first name', () => {
    expect(validate(emptyValues()).firstName).toBe('Enter a first name')
    expect(validate({ ...emptyValues(), firstName: '   ' }).firstName).toBeDefined()
    expect(validate({ ...emptyValues(), firstName: 'Ana' })).toEqual({})
  })

  it.each(['1962', '1962-04', '1962-04-17', ''])('accepts the date "%s"', (date) => {
    expect(validate({ ...emptyValues(), firstName: 'Ana', birthDate: date, deathDate: date })).toEqual({})
  })

  it.each(['62', '1962-13', '1962-02-30', 'last year'])('rejects the date "%s" with the help text', (date) => {
    const errors = validate({ ...emptyValues(), firstName: 'Ana', birthDate: date })
    expect(errors.birthDate).toBe(DATE_HELP)
  })
})

describe('toPersonFields', () => {
  it('trims, and turns blanks into missing fields', () => {
    expect(toPersonFields({ ...emptyValues('female'), firstName: ' Ana ', lastName: '  ', birthDate: ' 1962 ' })).toEqual({
      firstName: 'Ana',
      lastName: undefined,
      gender: 'female',
      birthDate: '1962',
      deathDate: undefined,
      deceased: false,
    })
  })

  it('a death date means the Person is deceased', () => {
    expect(toPersonFields({ ...emptyValues(), firstName: 'Ana', deathDate: '2001' }).deceased).toBe(true)
  })
})

describe('valuesOf', () => {
  it('round-trips a Person through the form', () => {
    const person = {
      id: '00000000-0000-4000-8000-000000000001',
      firstName: 'Ana',
      lastName: 'Keller',
      gender: 'female' as const,
      birthDate: '1930',
      deathDate: '2001-09',
      deceased: true,
    }
    expect(toPersonFields(valuesOf(person))).toEqual({
      firstName: 'Ana',
      lastName: 'Keller',
      gender: 'female',
      birthDate: '1930',
      deathDate: '2001-09',
      deceased: true,
    })
  })
})
