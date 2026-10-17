import type { Tree } from '../domain/schema.ts'
import { type LayoutOptions, type TreeLayout, layoutTree } from './layoutTree.ts'

/** What the layout needs of a Tree: who is in it and how they are linked. Names and dates do not matter. */
export interface LayoutInput {
  personIds: string[]
  parentLinks: Tree['parentLinks']
  partnerships: Tree['partnerships']
}

export interface LayoutRequest {
  seq: number
  input: LayoutInput
  options: Omit<LayoutOptions, 'previous'>
}

export interface LayoutResponse {
  seq: number
  layout: TreeLayout
}

export const inputOf = (tree: Pick<Tree, 'persons' | 'parentLinks' | 'partnerships'>): LayoutInput => ({
  personIds: tree.persons.map((p) => p.id),
  parentLinks: tree.parentLinks,
  partnerships: tree.partnerships,
})

/** Every buffer of a layout, to be handed over to the other thread rather than copied. */
export function transferablesOf(layout: TreeLayout): ArrayBuffer[] {
  return [
    layout.generation,
    layout.lineX,
    layout.x,
    layout.y,
    layout.theta,
    layout.radius,
    layout.weight,
    layout.parentEdges,
    layout.parentEdgeKind,
    layout.partnerEdges,
    layout.partnerEnded,
  ].map((array) => array.buffer as ArrayBuffer)
}

/**
 * The Worker's brain, free of any Worker API so it can be tested directly. It keeps the layout it made last and starts
 * the next one from it (a warm start), so one edit moves few people. The previous layout is kept as a copy, since the
 * buffers of the one that is sent are transferred away and no longer readable here.
 */
export function createLayoutHandler() {
  let previous: TreeLayout | undefined
  return (request: LayoutRequest): LayoutResponse => {
    const { input, options } = request
    const tree: Tree = {
      focusPersonId: null,
      persons: input.personIds.map((id) => ({ id, firstName: '', gender: 'unknown', deceased: false })),
      parentLinks: input.parentLinks,
      partnerships: input.partnerships,
    }
    const layout = layoutTree(tree, { ...options, previous })
    previous = { ...layout, ids: layout.ids, lineX: layout.lineX.slice() }
    return { seq: request.seq, layout }
  }
}
