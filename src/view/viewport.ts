/** Pure view maths: screen = world * k + (x, y). No DOM, so it is easy to test. */

export interface View {
  x: number
  y: number
  k: number
}
export interface Size {
  width: number
  height: number
}
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
export interface Point {
  x: number
  y: number
}
export interface ZoomLimits {
  min: number
  max: number
}

/** Spec section 12: the maximum zoom is 250%, the minimum is the fit-all zoom floored at about 3%. */
export const MAX_ZOOM = 2.5
export const ZOOM_FLOOR = 0.03
/** Fit-all never magnifies: a one-person Tree is shown at 100%, not blown up to fill the screen. */
export const FIT_ZOOM_CAP = 1
export const FIT_PADDING_PX = 16
/** Trees up to this size open fit-all; bigger ones open on the Focus person. */
export const OPEN_FIT_MAX_PEOPLE = 150
/** Zoom at which names and dates are comfortably readable: the lower edge of the "full" bucket. */
export const READABLE_ZOOM = 0.8

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** The zoom at which `bounds` fits inside `size`. */
export function fitZoom(bounds: Rect, size: Size): number {
  const width = Math.max(1, bounds.x1 - bounds.x0)
  const height = Math.max(1, bounds.y1 - bounds.y0)
  const k = Math.min(
    Math.max(1, size.width - 2 * FIT_PADDING_PX) / width,
    Math.max(1, size.height - 2 * FIT_PADDING_PX) / height,
  )
  return Math.min(k, FIT_ZOOM_CAP)
}

export function zoomLimits(bounds: Rect, size: Size): ZoomLimits {
  return { min: clamp(fitZoom(bounds, size), ZOOM_FLOOR, MAX_ZOOM), max: MAX_ZOOM }
}

/** A view that puts the world point `world` in the middle of the screen. */
export function centerOn(world: Point, k: number, size: Size): View {
  return { k, x: size.width / 2 - world.x * k, y: size.height / 2 - world.y * k }
}

export function fitView(bounds: Rect, size: Size): View {
  const k = zoomLimits(bounds, size).min
  return centerOn({ x: (bounds.x0 + bounds.x1) / 2, y: (bounds.y0 + bounds.y1) / 2 }, k, size)
}

/** The view a Tree opens with (spec section 12, point 1). */
export function openingView(input: { count: number; bounds: Rect; focus?: Point; size: Size }): View {
  const { count, bounds, focus, size } = input
  if (count <= OPEN_FIT_MAX_PEOPLE || !focus) return fitView(bounds, size)
  const limits = zoomLimits(bounds, size)
  return centerOn(focus, clamp(READABLE_ZOOM, limits.min, limits.max), size)
}

export const worldCenter = (view: View, size: Size): Point => ({
  x: (size.width / 2 - view.x) / view.k,
  y: (size.height / 2 - view.y) / view.k,
})

/**
 * Keeps the middle of the screen inside the Tree's bounds (plus a margin of a quarter of the screen), so the
 * Tree can never be dragged completely out of sight, and the zoom inside its limits.
 */
export function clampView(view: View, bounds: Rect, size: Size, limits: ZoomLimits): View {
  const k = clamp(view.k, limits.min, limits.max)
  const marginX = size.width / 4 / k
  const marginY = size.height / 4 / k
  const centerX = clamp((size.width / 2 - view.x) / view.k, bounds.x0 - marginX, bounds.x1 + marginX)
  const centerY = clamp((size.height / 2 - view.y) / view.k, bounds.y0 - marginY, bounds.y1 + marginY)
  return centerOn({ x: centerX, y: centerY }, k, size)
}

/** Zooms by `factor` keeping the world point under the screen point `anchor` where it is. */
export function zoomAt(view: View, factor: number, anchor: Point, limits: ZoomLimits): View {
  const k = clamp(view.k * factor, limits.min, limits.max)
  const ratio = k / view.k
  return { k, x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio }
}

/** The part of the world that is on screen. */
export function visibleRect(view: View, size: Size): Rect {
  return {
    x0: -view.x / view.k,
    y0: -view.y / view.k,
    x1: (size.width - view.x) / view.k,
    y1: (size.height - view.y) / view.k,
  }
}

/** Grows a rect by `ratio` of its own width/height on every side. */
export function growRect(rect: Rect, ratio: number): Rect {
  const dx = (rect.x1 - rect.x0) * ratio
  const dy = (rect.y1 - rect.y0) * ratio
  return { x0: rect.x0 - dx, y0: rect.y0 - dy, x1: rect.x1 + dx, y1: rect.y1 + dy }
}

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x0 >= outer.x0 && inner.y0 >= outer.y0 && inner.x1 <= outer.x1 && inner.y1 <= outer.y1

export const rectsIntersect = (a: Rect, b: Rect) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0

export const sameView = (a: View, b: View) => a.x === b.x && a.y === b.y && a.k === b.k
