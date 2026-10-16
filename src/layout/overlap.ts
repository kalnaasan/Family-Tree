import type { TreeLayout } from './layoutTree.ts'

/** Pairs of Persons closer than `minDistance` (centre to centre). Uses a grid, so it is fast at 5,000 people. */
export function findOverlaps(layout: TreeLayout, minDistance: number, limit = 20): [number, number][] {
  const cells = new Map<string, number[]>()
  const key = (cx: number, cy: number) => `${cx},${cy}`
  for (let i = 0; i < layout.count; i++) {
    const k = key(Math.floor(layout.x[i]! / minDistance), Math.floor(layout.y[i]! / minDistance))
    const list = cells.get(k)
    if (list) list.push(i)
    else cells.set(k, [i])
  }
  const found: [number, number][] = []
  for (let i = 0; i < layout.count; i++) {
    const cx = Math.floor(layout.x[i]! / minDistance)
    const cy = Math.floor(layout.y[i]! / minDistance)
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(key(cx + dx, cy + dy)) ?? []) {
          if (j <= i) continue
          if (Math.hypot(layout.x[i]! - layout.x[j]!, layout.y[i]! - layout.y[j]!) < minDistance) {
            found.push([i, j])
            if (found.length >= limit) return found
          }
        }
      }
    }
  }
  return found
}
