import { create } from 'zustand'

/**
 * How the Tree is drawn: `rows` is the chart (generations in straight rows, branches that collapse), `crown` is the
 * artistic tree (spec section 4). A device setting like the Language: kept in this browser, not in the Tree or a backup.
 */
export type TreeShape = 'rows' | 'crown'

export const TREE_SHAPE_KEY = 'family-tree.treeShape'

/** What is used when nothing is stored. */
export const DEFAULT_TREE_SHAPE: TreeShape = 'crown'

function read(): TreeShape {
  try {
    const stored = localStorage.getItem(TREE_SHAPE_KEY)
    if (stored === 'rows' || stored === 'crown') return stored
  } catch {
    // storage is unavailable: the default is used, and a choice lasts until the page closes
  }
  return DEFAULT_TREE_SHAPE
}

interface TreeShapeState {
  shape: TreeShape
  setShape: (shape: TreeShape) => void
}

export const useTreeShape = create<TreeShapeState>()((set) => ({
  shape: read(),
  setShape: (shape) => {
    try {
      localStorage.setItem(TREE_SHAPE_KEY, shape)
    } catch {
      // see above
    }
    set({ shape })
  },
}))
