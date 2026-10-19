import { useEffect, useMemo, useState } from 'react'
import { PERF_BUDGET } from '../config/perf-budget.ts'
import type { ParentLink, Partnership, Person, Tree } from '../domain/schema.ts'
import { LAYOUT_MEASURE, createLayoutClient } from '../layout/layoutClient.ts'
import { type TreeLayout, layoutTree } from '../layout/layoutTree.ts'
import { CARD_H, CARD_PITCH, CARD_W, NODE_RADIUS, ROOTS_DEPTH, ROW_STEP, TRUNK_HEIGHT } from './geometry.ts'
import type { TreeShape } from './treeShape.ts'

const CROWN_OPTIONS = { nodeRadius: NODE_RADIUS, trunkHeight: TRUNK_HEIGHT, rootsDepth: ROOTS_DEPTH }
const ROWS_OPTIONS = { shape: 'rows' as const, gapX: CARD_PITCH, rowStep: ROW_STEP, cardWidth: CARD_W, cardHeight: CARD_H }
const optionsFor = (shape: TreeShape) => (shape === 'rows' ? ROWS_OPTIONS : CROWN_OPTIONS)

/** Lays out a Tree, starting from the previous result so one edit moves few people (spec section 4). */
function createWarmLayout(shape: TreeShape) {
  let previous: TreeLayout | undefined
  const options = optionsFor(shape)
  return (tree: Tree): TreeLayout => {
    const started = performance.now()
    previous = layoutTree(tree, { previous, ...options })
    performance.measure?.(LAYOUT_MEASURE, { start: started, end: performance.now() })
    return previous
  }
}

/** A layout together with the people it was made for: `persons[i]` is the Person `layout.ids[i]`. */
export interface LaidOut {
  layout: TreeLayout
  persons: Person[]
}

/**
 * The layout of the current Tree, or null while a big one is still being laid out. Recomputed only when persons or
 * links change, not on a Focus change. Up to ~1,000 people it is done on the spot; above that in a Web Worker, so
 * the screen stays smooth while it works (spec section 9). The previous result is only a hint for the warm start.
 *
 * While a big Tree is being laid out the previous drawing stays, with the people it was drawn for; the new one
 * replaces it as a whole.
 */
export function useTreeLayout(
  persons: Person[],
  parentLinks: ParentLink[],
  partnerships: Partnership[],
  shape: TreeShape = 'crown',
): LaidOut | null {
  const big = persons.length > PERF_BUDGET.workerLayoutAbove
  // a layout of one shape is no use as a warm start for the other
  const warmLayout = useMemo(() => createWarmLayout(shape), [shape])
  const [client] = useState(() => createLayoutClient())
  const [fromWorker, setFromWorker] = useState<LaidOut | null>(null)

  const sync = useMemo<LaidOut | null>(
    () =>
      big
        ? null
        : { persons, layout: warmLayout({ focusPersonId: null, persons, parentLinks, partnerships }) },
    [big, warmLayout, persons, parentLinks, partnerships],
  )

  useEffect(() => {
    if (!big) return
    let current = true
    void client.layout({ persons, parentLinks, partnerships }, optionsFor(shape)).then((layout) => {
      if (current) setFromWorker({ layout, persons })
    })
    return () => {
      current = false
    }
  }, [big, client, persons, parentLinks, partnerships, shape])
  useEffect(() => () => client.dispose(), [client])

  return big ? fromWorker : sync
}
