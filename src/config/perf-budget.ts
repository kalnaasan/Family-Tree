/** Performance budget (spec section 9). Measured at 4x CPU throttle, 390 px viewport. */
export const PERF_BUDGET = {
  throttleCpuRate: 4,
  viewportWidth: 390,
  /** Tree sizes the budget is defined for. */
  sizes: [200, 1000, 5000],
  panZoomFrameP95Ms: { 200: 16.7, 1000: 20, 5000: 33 },
  firstPaintMs: { 200: 1000, 1000: 2000, 5000: 5000 },
  layoutComputeMs: { 200: 50, 1000: 200, 5000: 1500 },
  editToRedrawMs: { 200: 100, 1000: 300, 5000: 1000 },
  /** Trees with more people than this are laid out in a Web Worker (spec section 9). */
  workerLayoutAbove: 1000,
  /** The hard limit: from this many people the drawing drops its decorative detail and a notice is shown once. */
  hardLimit: 5000,
  /** Working DOM element cap (estimate, unverified on mobile). */
  domElementCap: 2500,
} as const
