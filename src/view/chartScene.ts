import type { TreeLayout } from '../layout/layoutTree.ts'
import { CARD_H, CARD_W, ROW_STEP } from './geometry.ts'
import { type Rect, rectsIntersect } from './viewport.ts'

/** A branch group as the chart is told about it: the whole Tree's, so a collapsed one still has its children. */
export interface GroupInfo {
  key: string
  parents: string[]
  children: string[]
  collapsed: boolean
  /** How many people the group hides when collapsed (the "+N" on its button). */
  hiddenCount: number
}

/** Where a group's button sits: the centre, and what the connectors of that group look like. */
export interface ChartGroup {
  key: string
  /** Layout indices of the parents that are on the chart. */
  parents: number[]
  collapsed: boolean
  hiddenCount: number
  /** How many children are on the chart (zero when collapsed). */
  shownChildren: number
  chip: { x: number; y: number }
  /** Connectors of birth links, and of adoptive links (drawn dashed). */
  solid: string
  dashed: string
  box: Rect
}

export interface StepEdge {
  child: number
  parent: number
  path: string
  box: Rect
}

export interface ChartScene {
  layout: TreeLayout
  groups: ChartGroup[]
  steps: StepEdge[]
  /** Partner edge `e` as a path between the two cards, and whether it is a current or an ended partnership. */
  partnerPaths: string[]
  partnerBoxes: Rect[]
}

const HALF_H = CARD_H / 2
const HALF_W = CARD_W / 2
/** From the bottom of a row of cards to the bus a family hangs from. */
const BUS_BELOW_CARD = (ROW_STEP - CARD_H) / 2
const CHIP_BELOW_CARD = 24

const r = (value: number) => Math.round(value * 10) / 10

export function buildChartScene(layout: TreeLayout, groups: readonly GroupInfo[]): ChartScene {
  const index = new Map<string, number>()
  layout.ids.forEach((id, i) => index.set(id, i))
  const partnered = new Set<string>()
  for (let e = 0; e < layout.partnerEnded.length; e++) {
    const a = layout.partnerEdges[2 * e]!
    const b = layout.partnerEdges[2 * e + 1]!
    partnered.add(`${a}:${b}`)
    partnered.add(`${b}:${a}`)
  }
  // which children are drawn dashed: those linked to a group's parent by an adoptive link
  const adoptive = new Set<string>()
  for (let e = 0; e < layout.parentEdgeKind.length; e++) {
    if (layout.parentEdgeKind[e] === 1) adoptive.add(`${layout.parentEdges[2 * e]}:${layout.parentEdges[2 * e + 1]}`)
  }

  const chartGroups: ChartGroup[] = []
  for (const group of groups) {
    const parents = group.parents.map((id) => index.get(id)).filter((i): i is number => i !== undefined)
    if (parents.length === 0) continue
    const children = group.children.map((id) => index.get(id)).filter((i): i is number => i !== undefined)
    if (children.length === 0 && !group.collapsed) continue
    const rowY = Math.max(...parents.map((p) => layout.y[p]!))
    const couple =
      parents.length === 2 && partnered.has(`${parents[0]}:${parents[1]}`) && layout.y[parents[0]!] === layout.y[parents[1]!]
    const meanX = parents.reduce((sum, p) => sum + layout.x[p]!, 0) / parents.length
    // each place a line leaves a parent: the middle of a couple's bar, else the bottom of each card
    const drops = couple
      ? [{ x: (layout.x[parents[0]!]! + layout.x[parents[1]!]!) / 2, y: rowY }]
      : parents.map((p) => ({ x: layout.x[p]!, y: layout.y[p]! + HALF_H }))
    const childTop = children.length > 0 ? Math.min(...children.map((c) => layout.y[c]!)) - HALF_H : rowY + ROW_STEP - HALF_H
    const busY = childTop - BUS_BELOW_CARD
    const chipY = couple || parents.length === 1 ? rowY + HALF_H + CHIP_BELOW_CARD : busY
    const chipX = couple ? drops[0]!.x : meanX

    let solid = ''
    let dashed = ''
    const xs = drops.map((d) => d.x)
    if (children.length === 0) {
      for (const drop of drops) solid += `M${r(drop.x)},${r(drop.y)}L${r(drop.x)},${r(chipY - 12)}`
    } else {
      for (const drop of drops) solid += `M${r(drop.x)},${r(drop.y)}L${r(drop.x)},${r(busY)}`
      for (const child of children) {
        const x = layout.x[child]!
        xs.push(x)
        const drop = `M${r(x)},${r(busY)}L${r(x)},${r(layout.y[child]! - HALF_H)}`
        if (parents.some((p) => adoptive.has(`${child}:${p}`))) dashed += drop
        else solid += drop
      }
      solid += `M${r(Math.min(...xs))},${r(busY)}L${r(Math.max(...xs))},${r(busY)}`
    }
    chartGroups.push({
      key: group.key,
      parents,
      collapsed: group.collapsed,
      hiddenCount: group.hiddenCount,
      shownChildren: children.length,
      chip: { x: chipX, y: chipY },
      solid,
      dashed,
      box: {
        x0: Math.min(...xs, chipX) - 30,
        x1: Math.max(...xs, chipX) + 30,
        y0: Math.min(...drops.map((d) => d.y)),
        y1: Math.max(busY, chipY + 30, ...children.map((c) => layout.y[c]! - HALF_H)),
      },
    })
  }

  const steps: StepEdge[] = []
  for (let e = 0; e < layout.parentEdgeKind.length; e++) {
    if (layout.parentEdgeKind[e] !== 2) continue
    const child = layout.parentEdges[2 * e]!
    const parent = layout.parentEdges[2 * e + 1]!
    const x1 = layout.x[parent]!
    const y1 = layout.y[parent]! + HALF_H
    const x2 = layout.x[child]!
    const y2 = layout.y[child]! - HALF_H
    const mid = (y1 + y2) / 2
    steps.push({
      child,
      parent,
      path: `M${r(x1)},${r(y1)}L${r(x1)},${r(mid)}L${r(x2)},${r(mid)}L${r(x2)},${r(y2)}`,
      box: { x0: Math.min(x1, x2), y0: Math.min(y1, y2), x1: Math.max(x1, x2), y1: Math.max(y1, y2) },
    })
  }

  const partnerPaths: string[] = []
  const partnerBoxes: Rect[] = []
  for (let e = 0; e < layout.partnerEnded.length; e++) {
    const a = layout.partnerEdges[2 * e]!
    const b = layout.partnerEdges[2 * e + 1]!
    const ax = layout.x[a]!
    const ay = layout.y[a]!
    const bx = layout.x[b]!
    const by = layout.y[b]!
    if (Math.abs(ay - by) < 1) {
      const left = Math.min(ax, bx) + HALF_W
      const right = Math.max(ax, bx) - HALF_W
      partnerPaths.push(`M${r(left)},${r(ay)}L${r(right)},${r(ay)}`)
    } else {
      partnerPaths.push(`M${r(ax)},${r(ay)}L${r(bx)},${r(by)}`)
    }
    partnerBoxes.push({ x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) })
  }

  return { layout, groups: chartGroups, steps, partnerPaths, partnerBoxes }
}

/** The parts of the chart that touch a rectangle of the world. */
export interface ChartVisible {
  persons: number[]
  groups: ChartGroup[]
  steps: StepEdge[]
  partners: number[]
}

export function selectVisibleChart(scene: ChartScene, rect: Rect): ChartVisible {
  const { layout } = scene
  const near: Rect = { x0: rect.x0 - CARD_W, y0: rect.y0 - CARD_H, x1: rect.x1 + CARD_W, y1: rect.y1 + CARD_H }
  const persons: number[] = []
  for (let i = 0; i < layout.count; i++) {
    const x = layout.x[i]!
    const y = layout.y[i]!
    if (x >= near.x0 && x <= near.x1 && y >= near.y0 && y <= near.y1) persons.push(i)
  }
  const partners: number[] = []
  scene.partnerBoxes.forEach((box, e) => {
    if (rectsIntersect(near, box)) partners.push(e)
  })
  return {
    persons,
    groups: scene.groups.filter((group) => rectsIntersect(near, group.box)),
    steps: scene.steps.filter((step) => rectsIntersect(near, step.box)),
    partners,
  }
}
