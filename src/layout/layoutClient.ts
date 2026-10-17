import type { Tree } from '../domain/schema.ts'
import { type LayoutOptions, type TreeLayout, layoutTree } from './layoutTree.ts'
import { type LayoutResponse, inputOf } from './layoutWorkerCore.ts'

/** The part of `Worker` that is used. */
export interface WorkerLike {
  postMessage(message: unknown): void
  onmessage: ((event: { data: LayoutResponse }) => void) | null
  onerror: ((event: unknown) => void) | null
  terminate(): void
}

export interface LayoutClient {
  /** Lays the Tree out off the main thread. Resolves with the layout of this Tree, whatever was asked since. */
  layout(tree: Pick<Tree, 'persons' | 'parentLinks' | 'partnerships'>, options?: Omit<LayoutOptions, 'previous'>): Promise<TreeLayout>
  dispose(): void
}

/** Name of the performance measure for one layout (the time from asking to having it), read by the performance tests. */
export const LAYOUT_MEASURE = 'family-tree:layout'

export const startWorker = (): WorkerLike | null => {
  if (typeof Worker === 'undefined') return null
  try {
    return new Worker(new URL('./layoutWorker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike
  } catch {
    return null
  }
}

/**
 * Talks to the layout Worker. Without Workers, or if the Worker fails, the layout is done on this thread instead, so
 * the Tree is always drawn; only the smoothness of a big Tree is lost.
 */
export function createLayoutClient(createWorker: () => WorkerLike | null = startWorker): LayoutClient {
  let worker: WorkerLike | null | undefined
  let seq = 0
  let previous: TreeLayout | undefined
  const waiting = new Map<number, { resolve: (layout: TreeLayout) => void; run: () => TreeLayout }>()

  const onThisThread = (tree: Pick<Tree, 'persons' | 'parentLinks' | 'partnerships'>, options: LayoutOptions) => {
    previous = layoutTree({ focusPersonId: null, ...tree }, { ...options, previous })
    return previous
  }

  /** The Worker is not usable: everything waiting is done here, and later requests do not try it again. */
  const giveUpOnWorker = () => {
    worker?.terminate()
    worker = null
    for (const [id, entry] of [...waiting]) {
      waiting.delete(id)
      entry.resolve(entry.run())
    }
  }

  const start = () => {
    if (worker !== undefined) return worker
    worker = createWorker()
    if (worker) {
      worker.onmessage = (event) => {
        const entry = waiting.get(event.data.seq)
        if (!entry) return
        waiting.delete(event.data.seq)
        entry.resolve(event.data.layout)
      }
      worker.onerror = giveUpOnWorker
    }
    return worker
  }

  return {
    layout(tree, options = {}) {
      const started = performance.now()
      const done = (layout: TreeLayout) => {
        performance.measure?.(LAYOUT_MEASURE, { start: started, end: performance.now() })
        return layout
      }
      const run = () => onThisThread(tree, options)
      const active = start()
      if (!active) return Promise.resolve(done(run()))
      const id = ++seq
      return new Promise<TreeLayout>((resolve) => {
        waiting.set(id, { resolve, run })
        active.postMessage({ seq: id, input: inputOf(tree), options })
      }).then(done)
    },
    dispose() {
      worker?.terminate()
      worker = undefined
      waiting.clear()
    },
  }
}
