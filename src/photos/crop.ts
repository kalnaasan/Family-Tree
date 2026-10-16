/**
 * The circular crop (spec section 6) is a square cut out of the photo, shown through a circle. It is described in the
 * photo's own pixels: where the square's centre is and how far in it is zoomed. No DOM, so it is easy to test.
 */
export interface Size {
  width: number
  height: number
}
export interface CropState {
  /** 1 shows the largest square the photo holds; higher zooms in. */
  zoom: number
  /** The centre of the square, in photo pixels. */
  cx: number
  cy: number
}
export interface CropRect {
  x: number
  y: number
  side: number
}

export const MIN_CROP_ZOOM = 1
export const MAX_CROP_ZOOM = 4
/** One arrow-key press moves the photo by this fraction of the visible square. */
export const KEY_PAN_FRACTION = 0.05
export const KEY_ZOOM_FACTOR = 1.1

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Side, in photo pixels, of the square seen at `zoom`. */
export const squareSide = (photo: Size, zoom: number) => Math.min(photo.width, photo.height) / zoom

/** The largest centred square: nothing is cut off along the shorter side. */
export const initialCrop = (photo: Size): CropState => ({ zoom: 1, cx: photo.width / 2, cy: photo.height / 2 })

/** Keeps the zoom in range and the square inside the photo. */
export function clampCrop(photo: Size, crop: CropState): CropState {
  const zoom = clamp(crop.zoom, MIN_CROP_ZOOM, MAX_CROP_ZOOM)
  const half = squareSide(photo, zoom) / 2
  return { zoom, cx: clamp(crop.cx, half, photo.width - half), cy: clamp(crop.cy, half, photo.height - half) }
}

export function cropRect(photo: Size, crop: CropState): CropRect {
  const { zoom, cx, cy } = clampCrop(photo, crop)
  const side = squareSide(photo, zoom)
  return { x: cx - side / 2, y: cy - side / 2, side }
}

/** Drags the photo by `dx`, `dy` screen pixels inside a preview that shows the square `viewSide` pixels across. */
export function dragCrop(photo: Size, crop: CropState, dx: number, dy: number, viewSide: number): CropState {
  const perPixel = squareSide(photo, crop.zoom) / viewSide
  // dragging the photo right shows more of its left side
  return clampCrop(photo, { ...crop, cx: crop.cx - dx * perPixel, cy: crop.cy - dy * perPixel })
}

/** Moves the view of the photo by a fraction of the visible square (the arrow keys); `+1` is right/down. */
export function nudgeCrop(photo: Size, crop: CropState, dirX: -1 | 0 | 1, dirY: -1 | 0 | 1): CropState {
  const step = squareSide(photo, crop.zoom) * KEY_PAN_FRACTION
  return clampCrop(photo, { ...crop, cx: crop.cx + dirX * step, cy: crop.cy + dirY * step })
}

/** Zooms about the centre of the square. */
export const zoomCrop = (photo: Size, crop: CropState, factor: number): CropState =>
  clampCrop(photo, { ...crop, zoom: crop.zoom * factor })
