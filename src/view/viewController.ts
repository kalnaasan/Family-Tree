import {
  MAX_ZOOM,
  type Point,
  type Rect,
  type Size,
  type View,
  ZOOM_FLOOR,
  type ZoomLimits,
  centerOn,
  clampView,
  fitView,
  sameView,
  worldCenter,
  zoomAt,
  zoomLimits,
} from './viewport.ts'

export interface ViewControllerOptions {
  /** Called synchronously whenever the view changes. The canvas applies it straight to the DOM. */
  onChange: (view: View) => void
  /** Re-read on every call so a changed OS setting takes effect without a reload. */
  prefersReducedMotion: () => boolean
}

const ANIMATION_MS = 180

/**
 * Owns the pan/zoom state of the canvas outside React, so a drag or wheel turn never causes a render. Keeps the
 * view inside the zoom limits and near the Tree; animates button and key moves unless the user prefers reduced
 * motion, in which case every change jumps.
 */
export class ViewController {
  view: View = { x: 0, y: 0, k: 1 }
  private readonly options: ViewControllerOptions
  private size: Size = { width: 0, height: 0 }
  private bounds: Rect = { x0: 0, y0: 0, x1: 1, y1: 1 }
  private limits: ZoomLimits = { min: ZOOM_FLOOR, max: MAX_ZOOM }
  private frame = 0

  constructor(options: ViewControllerOptions) {
    this.options = options
  }

  get ready(): boolean {
    return this.size.width > 0 && this.size.height > 0
  }

  get zoomRange(): ZoomLimits {
    return this.limits
  }

  /** Tells the controller how big the screen and the Tree are; re-applies the limits to the current view. */
  configure(size: Size, bounds: Rect): void {
    this.size = size
    this.bounds = bounds
    this.limits = zoomLimits(bounds, size)
    if (this.ready) this.set(clampView(this.view, bounds, size, this.limits))
  }

  jump(view: View): void {
    this.stop()
    this.set(this.constrain(view))
  }

  panBy(dx: number, dy: number): void {
    this.jump({ ...this.view, x: this.view.x + dx, y: this.view.y + dy })
  }

  /** Immediate zoom about a screen point: for the wheel, which already arrives in small steps. */
  zoomAtPoint(factor: number, anchor: Point): void {
    this.jump(zoomAt(this.view, factor, anchor, this.limits))
  }

  /** Zoom about the middle of the screen, animated: for the + and - keys and buttons. */
  zoomBy(factor: number): void {
    this.animateTo(zoomAt(this.view, factor, { x: this.size.width / 2, y: this.size.height / 2 }, this.limits))
  }

  fit(): void {
    this.animateTo(fitView(this.bounds, this.size))
  }

  /** Centres a world point, at `zoom` or the current zoom. */
  show(point: Point, zoom: number = this.view.k): void {
    this.animateTo(centerOn(point, zoom, this.size))
  }

  animateTo(target: View): void {
    const end = this.constrain(target)
    if (!this.ready || this.options.prefersReducedMotion()) {
      this.jump(end)
      return
    }
    this.stop()
    const start = this.view
    const from = worldCenter(start, this.size)
    const to = worldCenter(end, this.size)
    const t0 = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ANIMATION_MS)
      const e = 1 - (1 - t) ** 3
      const k = Math.exp(Math.log(start.k) + (Math.log(end.k) - Math.log(start.k)) * e)
      this.set(centerOn({ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }, k, this.size))
      this.frame = t < 1 ? requestAnimationFrame(step) : 0
    }
    this.frame = requestAnimationFrame(step)
  }

  dispose(): void {
    this.stop()
  }

  private constrain(view: View): View {
    return this.ready ? clampView(view, this.bounds, this.size, this.limits) : view
  }

  private stop(): void {
    if (this.frame) cancelAnimationFrame(this.frame)
    this.frame = 0
  }

  private set(view: View): void {
    if (sameView(view, this.view)) return
    this.view = view
    this.options.onChange(view)
  }
}
