import type { Tree } from '../domain/schema.ts'

/**
 * Tree layout (spec section 4). Pure and DOM-free; returns flat typed arrays so it can run in a Web Worker.
 *
 * 1. Generation rows: oldest generation first; partners share a row.
 * 2. Horizontal order and spacing by iterative barycenter relaxation: every Person moves to the mean of their
 *    parents and children, partners move together as a group; the row is then re-ordered with partners kept
 *    adjacent and spread to at least `gapX` apart with the smallest possible displacement.
 * 3. Fan crown: the horizontal position becomes an angle (about 270 degrees), the generation a ring radius.
 *    With `shape: 'rows'` there is no crown: the rows stay straight, one `rowStep` apart, and `x` is the position
 *    along the row (the top-down chart). `theta` and `radius` are then all zero.
 *
 * Warm start: pass the previous layout and the relaxation starts from it, so one edit moves little.
 */

export type LayoutShape = 'crown' | 'rows'

export interface LayoutOptions {
  /** `crown` (default): the fan crown. `rows`: straight generation rows, for the chart. */
  shape?: LayoutShape
  /** `rows` only: the distance between two generation rows. */
  rowStep?: number
  /** `rows` only: the size of a Person's card, used for the bounds. */
  cardWidth?: number
  cardHeight?: number
  /** Minimum horizontal distance between neighbours in a row, before bending into the crown. */
  gapX?: number
  /** Radius added per generation ring at least. */
  ringStep?: number
  /** Radius of the oldest generation. */
  innerRadius?: number
  spanDegrees?: number
  /** Angle between two neighbours that sit one `gapX` apart. A small tree spans only as many degrees as it needs. */
  stepDegrees?: number
  /** Minimum distance along a ring between neighbours. Must stay above two node radii. */
  nodeGap?: number
  /** Drawn radius of a Person, used for the bounds only. */
  nodeRadius?: number
  /** Relaxation sweeps from scratch / when warm-started. */
  iterations?: number
  warmIterations?: number
  /** Length of the trunk below the oldest generation, and the room for roots under it. */
  trunkHeight?: number
  rootsDepth?: number
  padding?: number
  /** A previous layout to start from. */
  previous?: TreeLayout
}

export interface TreeLayout {
  shape: LayoutShape
  count: number
  /** Index -> Person id. Everything else is indexed the same way. */
  ids: string[]
  /** Dense generation rank, 0 = oldest. */
  generation: Uint16Array
  maxGeneration: number
  /** Position along the row before bending into the crown (starts at 0). Kept for warm starts. */
  lineX: Float32Array
  /** Final position, angle (radians, 0 = straight up) and radius. */
  x: Float32Array
  y: Float32Array
  theta: Float32Array
  radius: Float32Array
  /** 1 + the number of descendants: drives branch thickness. */
  weight: Uint32Array
  /** [child, parent] index pairs; `parentEdgeKind` 0 birth, 1 adoptive, 2 step. */
  parentEdges: Int32Array
  parentEdgeKind: Uint8Array
  /** [a, b] index pairs; `partnerEnded` 1 for an ended Partnership. */
  partnerEdges: Int32Array
  partnerEnded: Uint8Array
  bounds: { x0: number; y0: number; x1: number; y1: number }
}

const DEFAULTS = {
  shape: 'crown' as LayoutShape,
  rowStep: 150,
  cardWidth: 164,
  cardHeight: 64,
  gapX: 110,
  ringStep: 140,
  innerRadius: 130,
  spanDegrees: 270,
  stepDegrees: 30,
  nodeGap: 100,
  nodeRadius: 32,
  iterations: 40,
  warmIterations: 10,
  trunkHeight: 200,
  rootsDepth: 140,
  padding: 80,
}

const PARENT_WEIGHT = 1
const CHILD_WEIGHT = 1
const MAX_GENERATION_PASSES = 24
const KIND_CODE = { birth: 0, adoptive: 1, step: 2 } as const

export function layoutTree(tree: Tree, options: LayoutOptions = {}): TreeLayout {
  const o = { ...DEFAULTS, ...options }
  const n = tree.persons.length
  const ids = tree.persons.map((p) => p.id)
  const index = new Map<string, number>()
  ids.forEach((id, i) => index.set(id, i))

  // --- graph -------------------------------------------------------------------------------
  const parents: number[][] = Array.from({ length: n }, () => [])
  const children: number[][] = Array.from({ length: n }, () => [])
  const partnerRecords: { other: number; ended: boolean }[][] = Array.from({ length: n }, () => [])
  const parentEdgeList: number[] = []
  const parentKindList: number[] = []
  for (const link of tree.parentLinks) {
    const child = index.get(link.childId)
    const parent = index.get(link.parentId)
    if (child === undefined || parent === undefined) continue
    parentEdgeList.push(child, parent)
    parentKindList.push(KIND_CODE[link.kind])
    if (link.kind !== 'step') {
      // step links are drawn but do not shape the layout
      parents[child]!.push(parent)
      children[parent]!.push(child)
    }
  }
  const partnerEdgeList: number[] = []
  const partnerEndedList: number[] = []
  for (const partnership of tree.partnerships) {
    const a = index.get(partnership.personIds[0])
    const b = index.get(partnership.personIds[1])
    if (a === undefined || b === undefined || a === b) continue
    const ended = partnership.status === 'ended'
    partnerEdgeList.push(a, b)
    partnerEndedList.push(ended ? 1 : 0)
    partnerRecords[a]!.push({ other: b, ended })
    partnerRecords[b]!.push({ other: a, ended })
  }
  // current partners come first so they end up next to the Person
  const partners: number[][] = partnerRecords.map((records) =>
    [...records].sort((p, q) => Number(p.ended) - Number(q.ended)).map((r) => r.other),
  )

  // --- order: parents before children -----------------------------------------------------
  const order = parentsFirstOrder(n, parents, children)

  // --- generations ------------------------------------------------------------------------
  const rawGeneration = new Int32Array(n)
  for (let pass = 0; pass < MAX_GENERATION_PASSES; pass++) {
    let changed = false
    for (const node of order) {
      for (const parent of parents[node]!) {
        if (rawGeneration[node]! < rawGeneration[parent]! + 1) {
          rawGeneration[node] = rawGeneration[parent]! + 1
          changed = true
        }
      }
    }
    // Partners share a row: the earlier-born one moves down to the later generation. Pathological input
    // (a partner who is also an ancestor) cannot satisfy both rules; the pass limit ends it.
    for (let e = 0; e < partnerEdgeList.length; e += 2) {
      const a = partnerEdgeList[e]!
      const b = partnerEdgeList[e + 1]!
      const higher = Math.max(rawGeneration[a]!, rawGeneration[b]!)
      if (rawGeneration[a] !== higher || rawGeneration[b] !== higher) {
        rawGeneration[a] = higher
        rawGeneration[b] = higher
        changed = true
      }
    }
    if (!changed) break
  }
  // dense ranks, so unused generation numbers never leave an empty ring
  const used = [...new Set(rawGeneration)].sort((a, b) => a - b)
  const rank = new Map(used.map((g, i) => [g, i]))
  const generation = new Uint16Array(n)
  for (let i = 0; i < n; i++) generation[i] = rank.get(rawGeneration[i]!)!
  const rowCount = used.length
  const rows: number[][] = Array.from({ length: rowCount }, () => [])
  for (let i = 0; i < n; i++) rows[generation[i]!]!.push(i)

  // --- horizontal positions ---------------------------------------------------------------
  const x = new Float64Array(n)
  const warm = options.previous !== undefined && options.previous.count > 0
  if (warm) {
    warmStartPositions(options.previous!, ids, rows, parents, children, partners, x, o.gapX)
  } else {
    for (const row of rows) row.forEach((node, k) => (x[node] = k * o.gapX))
  }

  // People joined by partnerships within a row move as one unit: pulling partners towards each other's
  // position instead would bias every couple sideways on each sweep.
  const groupsByRow: number[][][] = rows.map(() => [])
  const grouped = new Uint8Array(n)
  for (let i = 0; i < n; i++) {
    if (grouped[i] || partners[i]!.length === 0) continue
    const group = [i]
    grouped[i] = 1
    for (let q = 0; q < group.length; q++) {
      for (const other of partners[group[q]!]!) {
        if (grouped[other] || generation[other] !== generation[i]) continue
        grouped[other] = 1
        group.push(other)
      }
    }
    if (group.length > 1) groupsByRow[generation[i]!]!.push(group)
  }

  const scratch = new Scratch(n, Math.max(1, ...rows.map((r) => r.length)))
  const wanted = new Uint8Array(n) // 1 if the Person has parents or children to move towards
  const relaxRow = (g: number) => {
    const row = rows[g]!
    for (const node of row) {
      let weightSum = 0
      let sum = 0
      for (const p of parents[node]!) {
        sum += x[p]! * PARENT_WEIGHT
        weightSum += PARENT_WEIGHT
      }
      for (const c of children[node]!) {
        sum += x[c]! * CHILD_WEIGHT
        weightSum += CHILD_WEIGHT
      }
      wanted[node] = weightSum > 0 ? 1 : 0
      if (weightSum > 0) x[node] = sum / weightSum
    }
    for (const group of groupsByRow[g]!) {
      let sum = 0
      let count = 0
      for (const member of group) {
        if (!wanted[member]) continue
        sum += x[member]!
        count++
      }
      if (count > 0) for (const member of group) x[member] = sum / count
    }
    row.sort((a, b) => x[a]! - x[b]! || a - b)
    keepPartnersTogether(row, partners, generation, scratch)
    separate(row, x, o.gapX, scratch)
  }

  if (warm) {
    // resolve any overlap the edit created before relaxing
    for (const row of rows) {
      row.sort((a, b) => x[a]! - x[b]! || a - b)
      separate(row, x, o.gapX, scratch)
    }
  }
  const sweeps = warm ? o.warmIterations : o.iterations
  for (let it = 0; it < sweeps; it++) {
    if (it % 2 === 0) for (let g = 0; g < rowCount; g++) relaxRow(g)
    else for (let g = rowCount - 1; g >= 0; g--) relaxRow(g)
  }

  let minX = Infinity
  let maxX = -Infinity
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, x[i]!)
    maxX = Math.max(maxX, x[i]!)
  }
  const lineX = new Float32Array(n)
  for (let i = 0; i < n; i++) lineX[i] = x[i]! - minX
  const width = n > 0 ? maxX - minX : 0

  // --- straight rows (the chart) -----------------------------------------------------------
  if (o.shape === 'rows') {
    const px = new Float32Array(n)
    const py = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      px[i] = lineX[i]!
      py[i] = generation[i]! * o.rowStep
    }
    const padX = o.padding + o.cardWidth / 2
    const padY = o.padding / 2 + o.cardHeight / 2
    const weight = new Uint32Array(n).fill(1)
    for (let k = order.length - 1; k >= 0; k--) {
      const node = order[k]!
      for (const parent of parents[node]!) weight[parent]! += weight[node]!
    }
    return {
      shape: 'rows',
      count: n,
      ids,
      generation,
      maxGeneration: Math.max(0, rowCount - 1),
      lineX,
      x: px,
      y: py,
      theta: new Float32Array(n),
      radius: new Float32Array(n),
      weight,
      parentEdges: Int32Array.from(parentEdgeList),
      parentEdgeKind: Uint8Array.from(parentKindList),
      partnerEdges: Int32Array.from(partnerEdgeList),
      partnerEnded: Uint8Array.from(partnerEndedList),
      bounds: { x0: -padX, y0: -padY, x1: width + padX, y1: Math.max(0, rowCount - 1) * o.rowStep + padY },
    }
  }

  // --- fan crown --------------------------------------------------------------------------
  // The row is centred above the trunk and spans one step per `gapX` of width, up to the full crown. Spreading
  // a handful of people over the whole 270 degrees would put a couple, or a parent and child, on opposite sides.
  const span = Math.min((o.spanDegrees * Math.PI) / 180, (width / o.gapX) * ((o.stepDegrees * Math.PI) / 180))
  const theta = new Float32Array(n)
  for (let i = 0; i < n; i++) theta[i] = width > 0 ? (lineX[i]! / width - 0.5) * span : 0

  const ringRadius = new Float64Array(rowCount)
  let previousRadius = o.innerRadius - o.ringStep
  for (let g = 0; g < rowCount; g++) {
    const angles = rows[g]!.map((node) => theta[node]!).sort((a, b) => a - b)
    let minGap = Infinity
    for (let k = 1; k < angles.length; k++) minGap = Math.min(minGap, angles[k]! - angles[k - 1]!)
    const needed = Number.isFinite(minGap) && minGap > 0 ? o.nodeGap / minGap : 0
    previousRadius = Math.max(previousRadius + o.ringStep, needed)
    ringRadius[g] = previousRadius
  }

  const px = new Float32Array(n)
  const py = new Float32Array(n)
  const radius = new Float32Array(n)
  let x0 = 0
  let x1 = 0
  let y0 = 0
  let y1 = 0
  for (let i = 0; i < n; i++) {
    const r = ringRadius[generation[i]!]!
    radius[i] = r
    px[i] = r * Math.sin(theta[i]!)
    py[i] = -r * Math.cos(theta[i]!)
    x0 = Math.min(x0, px[i]!)
    x1 = Math.max(x1, px[i]!)
    y0 = Math.min(y0, py[i]!)
    y1 = Math.max(y1, py[i]!)
  }
  const pad = o.padding + o.nodeRadius
  const bounds = {
    x0: x0 - pad,
    y0: y0 - pad,
    x1: x1 + pad,
    y1: Math.max(y1 + pad, o.trunkHeight + o.rootsDepth),
  }

  // --- branch weight: 1 + descendants (counted once per path, which is close enough for thickness) ------
  const weight = new Uint32Array(n).fill(1)
  for (let k = order.length - 1; k >= 0; k--) {
    const node = order[k]!
    for (const parent of parents[node]!) weight[parent]! += weight[node]!
  }

  return {
    shape: 'crown',
    count: n,
    ids,
    generation,
    maxGeneration: Math.max(0, rowCount - 1),
    lineX,
    x: px,
    y: py,
    theta,
    radius,
    weight,
    parentEdges: Int32Array.from(parentEdgeList),
    parentEdgeKind: Uint8Array.from(parentKindList),
    partnerEdges: Int32Array.from(partnerEdgeList),
    partnerEnded: Uint8Array.from(partnerEndedList),
    bounds,
  }
}

/** Kahn's algorithm. Nodes left over by invalid input (a cycle) are appended so every node appears once. */
function parentsFirstOrder(n: number, parents: number[][], children: number[][]): number[] {
  const waiting = new Int32Array(n)
  const order: number[] = []
  for (let i = 0; i < n; i++) {
    waiting[i] = parents[i]!.length
    if (waiting[i] === 0) order.push(i)
  }
  for (let k = 0; k < order.length; k++) {
    for (const child of children[order[k]!]!) {
      waiting[child]!--
      if (waiting[child] === 0) order.push(child)
    }
  }
  if (order.length < n) {
    const seen = new Uint8Array(n)
    for (const i of order) seen[i] = 1
    for (let i = 0; i < n; i++) if (!seen[i]) order.push(i)
  }
  return order
}

/** Start from the previous layout: known Persons keep their place, new ones start next to their relatives. */
function warmStartPositions(
  previous: TreeLayout,
  ids: string[],
  rows: number[][],
  parents: number[][],
  children: number[][],
  partners: number[][],
  x: Float64Array,
  gapX: number,
) {
  const before = new Map<string, number>()
  previous.ids.forEach((id, i) => before.set(id, previous.lineX[i]!))
  const placed = new Uint8Array(ids.length)
  ids.forEach((id, i) => {
    const known = before.get(id)
    if (known !== undefined) {
      x[i] = known
      placed[i] = 1
    }
  })
  for (const row of rows) {
    for (const node of row) {
      if (placed[node]) continue
      let sum = 0
      let count = 0
      for (const list of [parents[node]!, children[node]!, partners[node]!]) {
        for (const other of list) {
          if (placed[other]) {
            sum += x[other]!
            count++
          }
        }
      }
      if (count > 0) {
        x[node] = sum / count
      } else {
        let rightmost = -gapX
        for (const other of row) if (placed[other]) rightmost = Math.max(rightmost, x[other]!)
        x[node] = rightmost + gapX
      }
      placed[node] = 1
    }
  }
}

/** Reusable buffers, so the sweeps do not allocate. */
class Scratch {
  readonly sum: Float64Array
  readonly count: Int32Array
  readonly start: Int32Array
  readonly placed: Uint32Array
  readonly out: number[] = []
  readonly queue: number[] = []
  mark = 0

  constructor(people: number, longestRow: number) {
    this.sum = new Float64Array(longestRow)
    this.count = new Int32Array(longestRow)
    this.start = new Int32Array(longestRow)
    this.placed = new Uint32Array(people)
  }
}

/** Re-order a row so partners are neighbours: a Person is followed by their partners (current first). */
function keepPartnersTogether(row: number[], partners: number[][], generation: Uint16Array, scratch: Scratch) {
  let anyPartners = false
  for (const node of row) {
    if (partners[node]!.length > 0) {
      anyPartners = true
      break
    }
  }
  if (!anyPartners) return
  const { placed, out, queue } = scratch
  const mark = ++scratch.mark
  out.length = 0
  for (const node of row) {
    if (placed[node] === mark) continue
    placed[node] = mark
    out.push(node)
    queue.length = 0
    queue.push(node)
    for (let q = 0; q < queue.length; q++) {
      for (const partner of partners[queue[q]!]!) {
        if (placed[partner] === mark || generation[partner] !== generation[node]) continue
        placed[partner] = mark
        out.push(partner)
        queue.push(partner)
      }
    }
  }
  for (let k = 0; k < row.length; k++) row[k] = out[k]!
}

/**
 * Keeps the row's order and makes neighbours at least `gap` apart while moving everyone as little as possible
 * (least squares, solved by merging overlapping blocks). Unlike pushing right, it does not drift the row.
 */
function separate(row: number[], x: Float64Array, gap: number, scratch: Scratch) {
  const { sum, count, start } = scratch
  let top = -1
  for (let j = 0; j < row.length; j++) {
    top++
    sum[top] = x[row[j]!]! - j * gap
    count[top] = 1
    start[top] = j
    while (top > 0 && sum[top - 1]! / count[top - 1]! > sum[top]! / count[top]!) {
      sum[top - 1]! += sum[top]!
      count[top - 1]! += count[top]!
      top--
    }
  }
  for (let b = 0; b <= top; b++) {
    const mean = sum[b]! / count[b]!
    for (let j = start[b]!; j < start[b]! + count[b]!; j++) x[row[j]!] = mean + j * gap
  }
}
