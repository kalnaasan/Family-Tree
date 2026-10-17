/**
 * Level of detail (spec section 9). Discrete buckets, so zooming re-renders only when a bucket edge is crossed.
 *
 * - full:     medallion, name, dates, decorative leaves
 * - noLeaves: as full, without the leaves (the leaf threshold is the edge between full and noLeaves)
 * - initial:  medallion with the first letter only (spec section 8: below about 45% zoom)
 * - dot:      a small coloured dot
 */
export type LodBucket = 'full' | 'noLeaves' | 'initial' | 'dot'

/** Lowest zoom at which each bucket applies. */
export const LOD_EDGES = { full: 0.8, noLeaves: 0.45, initial: 0.25 } as const

export function lodBucket(zoom: number, reducedDetail = false): LodBucket {
  // at the hard limit the decorative leaves are never drawn (spec section 9)
  if (zoom >= LOD_EDGES.full) return reducedDetail ? 'noLeaves' : 'full'
  if (zoom >= LOD_EDGES.noLeaves) return 'noLeaves'
  if (zoom >= LOD_EDGES.initial) return 'initial'
  return 'dot'
}
