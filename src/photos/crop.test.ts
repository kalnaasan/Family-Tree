import { describe, expect, it } from 'vitest'
import {
  MAX_CROP_ZOOM,
  clampCrop,
  cropRect,
  dragCrop,
  initialCrop,
  nudgeCrop,
  squareSide,
  zoomCrop,
} from './crop.ts'

const landscape = { width: 400, height: 200 }
const portrait = { width: 200, height: 400 }

describe('the crop square', () => {
  it('starts as the largest centred square', () => {
    expect(cropRect(landscape, initialCrop(landscape))).toEqual({ x: 100, y: 0, side: 200 })
    expect(cropRect(portrait, initialCrop(portrait))).toEqual({ x: 0, y: 100, side: 200 })
  })

  it('zooming in makes the square smaller, about its centre', () => {
    const crop = zoomCrop(landscape, initialCrop(landscape), 2)
    expect(squareSide(landscape, crop.zoom)).toBe(100)
    expect(cropRect(landscape, crop)).toEqual({ x: 150, y: 50, side: 100 })
  })

  it('cannot zoom out past the whole short side, or in past the maximum', () => {
    expect(zoomCrop(landscape, initialCrop(landscape), 0.1).zoom).toBe(1)
    expect(zoomCrop(landscape, initialCrop(landscape), 100).zoom).toBe(MAX_CROP_ZOOM)
  })

  it('stays inside the photo wherever it is pushed', () => {
    const far = clampCrop(landscape, { zoom: 2, cx: -500, cy: 9000 })
    expect(cropRect(landscape, far)).toEqual({ x: 0, y: 100, side: 100 })
    const other = clampCrop(landscape, { zoom: 2, cx: 9000, cy: -1 })
    expect(cropRect(landscape, other)).toEqual({ x: 300, y: 0, side: 100 })
  })

  it('at zoom 1 the square can slide only along the longer side', () => {
    const moved = clampCrop(landscape, { zoom: 1, cx: 0, cy: 0 })
    expect(cropRect(landscape, moved)).toEqual({ x: 0, y: 0, side: 200 })
  })
})

describe('moving it', () => {
  it('dragging the photo right shows more of its left', () => {
    const start = zoomCrop(landscape, initialCrop(landscape), 2) // 100 px square, centre at 200
    // the preview is 200 px across, so 1 screen px is 0.5 photo px
    expect(dragCrop(landscape, start, 20, 0, 200).cx).toBeCloseTo(190)
    expect(dragCrop(landscape, start, -20, 0, 200).cx).toBeCloseTo(210)
  })

  it('an arrow key moves the photo by 5% of the visible square, and stops at the edge', () => {
    const start = zoomCrop(landscape, initialCrop(landscape), 2)
    expect(nudgeCrop(landscape, start, 1, 0).cx).toBeCloseTo(205)
    expect(nudgeCrop(landscape, start, -1, 0).cx).toBeCloseTo(195)
    let crop = start
    for (let i = 0; i < 200; i++) crop = nudgeCrop(landscape, crop, 1, 0)
    const rect = cropRect(landscape, crop)
    expect(rect.x + rect.side).toBe(400)
  })

  it('an arrow key does nothing across the short side at zoom 1', () => {
    const start = initialCrop(landscape)
    expect(nudgeCrop(landscape, start, 0, 1)).toEqual(start)
  })
})
