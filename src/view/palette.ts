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
  /** The keyboard focus ring, drawn over a white halo. */
  cursor: '#111111',
} as const

/** The chart (rows): the app's warm palette. Text and lines are checked against these in palette.test.ts. */
export const CHART = {
  background: '#f8f5ee',
  card: '#ffffff',
  border: '#d9ceb7',
  borderStrong: '#8a7556',
  ink: '#242424',
  soft: '#55493b',
  selected: '#285943',
  ancestor: '#8a5a35',
  descendant: '#c6a667',
  focus: '#1f5f8b',
  line: '#8f7c5c',
  partner: '#8a5a35',
  partnerEnded: '#6b7280',
  avatar: '#f1e6cb',
  avatarInk: '#7a4f2b',
  bandA: 'rgba(198, 166, 103, 0.12)',
  bandB: 'rgba(40, 89, 67, 0.06)',
  bandLine: '#e4dac4',
} as const
