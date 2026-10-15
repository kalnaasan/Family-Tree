import { z } from 'zod'

export const CURRENT_SCHEMA_VERSION = 2

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

/** Partial ISO date: `YYYY`, `YYYY-MM` or `YYYY-MM-DD`, and a real calendar date. */
export const partialDateSchema = z.string().refine((value) => {
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  if (year < 1) return false
  if (match[2] === undefined) return true
  const month = Number(match[2])
  if (month < 1 || month > 12) return false
  if (match[3] === undefined) return true
  const day = Number(match[3])
  return day >= 1 && day <= daysInMonth(year, month)
}, 'Expected a date like 1962, 1962-05 or 1962-05-14')

const idSchema = z.uuid()

export const genderSchema = z.enum(['female', 'male', 'other', 'unknown'])
export const parentLinkKindSchema = z.enum(['birth', 'adoptive', 'step'])
export const partnershipStatusSchema = z.enum(['current', 'ended'])

export const personSchema = z.object({
  id: idSchema,
  firstName: z.string().trim().min(1),
  lastName: z.string().trim().min(1).optional(),
  gender: genderSchema.default('unknown'),
  birthDate: partialDateSchema.optional(),
  deathDate: partialDateSchema.optional(),
  deceased: z.boolean().default(false),
  photoId: idSchema.optional(),
})

export const parentLinkSchema = z.object({
  childId: idSchema,
  parentId: idSchema,
  kind: parentLinkKindSchema.default('birth'),
})

export const partnershipSchema = z.object({
  id: idSchema,
  personIds: z.tuple([idSchema, idSchema]),
  status: partnershipStatusSchema,
  startDate: partialDateSchema.optional(),
  endDate: partialDateSchema.optional(),
})

/** The Tree's content: what is stored in the document, without the envelope. */
export const treeSchema = z.object({
  focusPersonId: idSchema.nullable(),
  persons: z.array(personSchema),
  parentLinks: z.array(parentLinkSchema),
  partnerships: z.array(partnershipSchema),
})

export const documentSchema = treeSchema.extend({
  format: z.literal('family-tree'),
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  exportedAt: z.iso.datetime(),
})

export type Gender = z.infer<typeof genderSchema>
export type ParentLinkKind = z.infer<typeof parentLinkKindSchema>
export type PartnershipStatus = z.infer<typeof partnershipStatusSchema>
export type Person = z.infer<typeof personSchema>
export type ParentLink = z.infer<typeof parentLinkSchema>
export type Partnership = z.infer<typeof partnershipSchema>
export type Tree = z.infer<typeof treeSchema>
export type TreeDocument = z.infer<typeof documentSchema>
