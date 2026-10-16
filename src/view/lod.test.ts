import { describe, expect, it } from 'vitest'
import { LOD_EDGES, lodBucket } from './lod.ts'

describe('lodBucket', () => {
  it.each([
    [2.5, 'full'],
    [0.8, 'full'],
    [0.79, 'noLeaves'],
    [0.45, 'noLeaves'],
    [0.44, 'initial'],
    [0.25, 'initial'],
    [0.24, 'dot'],
    [0.03, 'dot'],
  ] as const)('zoom %s is the %s bucket', (zoom, bucket) => {
    expect(lodBucket(zoom)).toBe(bucket)
  })

  it('shows only the initial below about 45% zoom (spec section 8)', () => {
    expect(LOD_EDGES.noLeaves).toBe(0.45)
    expect(lodBucket(0.44)).not.toBe('full')
    expect(lodBucket(0.44)).not.toBe('noLeaves')
  })
})
