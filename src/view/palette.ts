import type { Gender } from '../domain/schema.ts'

/** Warm browns and greens (spec section 4). Contrast against `background` is checked in palette.test.ts. */
export const PALETTE = {
  background: '#f6efe0',
  trunk: '#7a4a24',
  branch: '#8b5a2b',
  root: '#6b3f1d',
  leaf: '#8fa35a',
  medallion: '#fbf3df',
  figure: '#8b5a2b',
  name: '#3b2a1a',
  dates: '#6b5642',
  partner: '#a4531a',
  partnerEnded: '#6b7280',
  heart: '#b4452f',
  /** Ring colour by gender: green, tan, and a neutral for other / unknown. */
  ring: { female: '#4d7c2f', male: '#9a6a1f', other: '#6b7280', unknown: '#6b7280' } satisfies Record<Gender, string>,
  /** Deceased people get a muted version of their ring plus a small mark, so it is never colour alone. */
  ringDeceased: { female: '#6b8a52', male: '#a07e4a', other: '#7c7467', unknown: '#7c7467' } satisfies Record<Gender, string>,
  focus: '#1f5f8b',
  /** The open Person: a dashed dark ring, a different shape from the Focus person's solid blue one. */
  selected: '#2b2b2b',
} as const
