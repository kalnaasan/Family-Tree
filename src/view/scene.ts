import type { TreeLayout } from '../layout/layoutTree.ts'
import { NODE_RADIUS, boughPath, branchWidth } from './geometry.ts'
import { type Rect, rectsIntersect } from './viewport.ts'

/** Extra room around the screen so a Person whose medallion or label pokes in is still drawn. */
const PERSON_MARGIN = NODE_RADIUS + 60

/** Parent link kinds in `TreeLayout.parentEdgeKind`. */
const STEP = 2

/** What is derived from a layout once: which Persons start at the trunk, plus a cache of branch outlines. */
export interface Scene {
  layout: TreeLayout
  /** Persons without a birth or adoptive parent: their branch grows from the top of the trunk. */
  rootIndices: Int32Array
  /** Outline of the branch for parent edge `edge` (an index into `parentEdges` pairs). Cached. */
  branchPath: (edge: number) => string
  /** Outline of the branch from the trunk to the Person at `person`. Cached. */
  rootBranchPath: (person: number) => string
}

export function buildScene(layout: TreeLayout): Scene {
  const hasParent = new Uint8Array(layout.count)
  for (let e = 0; e < layout.parentEdgeKind.length; e++) {
    if (layout.parentEdgeKind[e] !== STEP) hasParent[layout.parentEdges[2 * e]!] = 1
  }
  const roots: number[] = []
  for (let i = 0; i < layout.count; i++) if (!hasParent[i]) roots.push(i)

  const branchCache = new Map<number, string>()
  const rootCache = new Map<number, string>()
  const origin = { x: 0, y: 0 }

  return {
    layout,
    rootIndices: Int32Array.from(roots),
    branchPath(edge) {
      let path = branchCache.get(edge)
      if (path === undefined) {
        const child = layout.parentEdges[2 * edge]!
        const parent = layout.parentEdges[2 * edge + 1]!
        path = boughPath(
          { x: layout.x[parent]!, y: layout.y[parent]! },
          layout.theta[parent]!,
          { x: layout.x[child]!, y: layout.y[child]! },
          layout.theta[child]!,
          branchWidth(layout.weight[parent]!, 22),
          branchWidth(layout.weight[child]!, 18),
        )
        branchCache.set(edge, path)
      }
      return path
    },
    rootBranchPath(person) {
      let path = rootCache.get(person)
      if (path === undefined) {
        path = boughPath(
          origin,
          0,
          { x: layout.x[person]!, y: layout.y[person]! },
          layout.theta[person]!,
          38,
          branchWidth(layout.weight[person]!, 18),
        )
        rootCache.set(person, path)
      }
      return path
    },
  }
}

/** The parts of the scene that touch a rectangle of the world. */
export interface Visible {
  persons: number[]
  /** Birth and adoptive parent edges. */
  branches: number[]
  /** Step parent edges: drawn thin and dashed. */
  stepBranches: number[]
  roots: number[]
  partners: number[]
}

const inside = (rect: Rect, x: number, y: number, margin: number) =>
  x >= rect.x0 - margin && x <= rect.x1 + margin && y >= rect.y0 - margin && y <= rect.y1 + margin

/** Whether a branch between two points can touch `rect`; the curve bows, so its box is grown a little. */
function segmentTouches(rect: Rect, ax: number, ay: number, bx: number, by: number): boolean {
  const slack = NODE_RADIUS * 2 + 0.3 * Math.hypot(bx - ax, by - ay)
  return rectsIntersect(rect, {
    x0: Math.min(ax, bx) - slack,
    y0: Math.min(ay, by) - slack,
    x1: Math.max(ax, bx) + slack,
    y1: Math.max(ay, by) + slack,
  })
}

export function selectVisible(scene: Scene, rect: Rect): Visible {
  const { layout } = scene
  const visible: Visible = { persons: [], branches: [], stepBranches: [], roots: [], partners: [] }
  for (let i = 0; i < layout.count; i++) {
    if (inside(rect, layout.x[i]!, layout.y[i]!, PERSON_MARGIN)) visible.persons.push(i)
  }
  for (let e = 0; e < layout.parentEdgeKind.length; e++) {
    const child = layout.parentEdges[2 * e]!
    const parent = layout.parentEdges[2 * e + 1]!
    if (!segmentTouches(rect, layout.x[parent]!, layout.y[parent]!, layout.x[child]!, layout.y[child]!)) continue
    ;(layout.parentEdgeKind[e] === STEP ? visible.stepBranches : visible.branches).push(e)
  }
  for (const person of scene.rootIndices) {
    if (segmentTouches(rect, 0, 0, layout.x[person]!, layout.y[person]!)) visible.roots.push(person)
  }
  for (let e = 0; e < layout.partnerEnded.length; e++) {
    const a = layout.partnerEdges[2 * e]!
    const b = layout.partnerEdges[2 * e + 1]!
    if (segmentTouches(rect, layout.x[a]!, layout.y[a]!, layout.x[b]!, layout.y[b]!)) visible.partners.push(e)
  }
  return visible
}
