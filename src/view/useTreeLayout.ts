import { useMemo, useState } from 'react'
import type { ParentLink, Partnership, Person, Tree } from '../domain/schema.ts'
import { type TreeLayout, layoutTree } from '../layout/layoutTree.ts'
import { NODE_RADIUS, ROOTS_DEPTH, TRUNK_HEIGHT } from './geometry.ts'

/** Lays out a Tree, starting from the previous result so one edit moves few people (spec section 4). */
function createWarmLayout() {
  let previous: TreeLayout | undefined
  return (tree: Tree): TreeLayout => {
    previous = layoutTree(tree, { previous, nodeRadius: NODE_RADIUS, trunkHeight: TRUNK_HEIGHT, rootsDepth: ROOTS_DEPTH })
    return previous
  }
}

/**
 * The layout of the current Tree. Recomputed only when persons or links change, not on a Focus change. The
 * previous result is only a hint for the warm start; the layout would be the same without it.
 */
export function useTreeLayout(persons: Person[], parentLinks: ParentLink[], partnerships: Partnership[]): TreeLayout {
  const [warmLayout] = useState(createWarmLayout)
  return useMemo(
    () => warmLayout({ focusPersonId: null, persons, parentLinks, partnerships }),
    [warmLayout, persons, parentLinks, partnerships],
  )
}
