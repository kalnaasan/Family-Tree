import { describe, expect, it, vi } from 'vitest'
import { addParentLink, addPerson } from '../domain/tree.ts'
import { generateTree } from './fixtures.ts'
import { LAYOUT_MEASURE, type WorkerLike, createLayoutClient } from './layoutClient.ts'
import { layoutTree } from './layoutTree.ts'
import { type LayoutRequest, createLayoutHandler, inputOf, transferablesOf } from './layoutWorkerCore.ts'

const OPTIONS = { nodeRadius: 32, trunkHeight: 200, rootsDepth: 140 }

/**
 * A Worker that runs the real handler in this thread but behaves like one at the edges: messages are copied
 * (structured clone), transferred buffers are detached afterwards, and answers arrive later.
 */
function inProcessWorker() {
  const handle = createLayoutHandler()
  const sent: LayoutRequest[] = []
  const worker: WorkerLike & { crash: () => void } = {
    onmessage: null,
    onerror: null,
    terminate: vi.fn(),
    crash: () => worker.onerror?.(new Error('boom')),
    postMessage(message) {
      const request = structuredClone(message) as LayoutRequest
      sent.push(request)
      const response = handle(request)
      const moved = structuredClone(response, { transfer: transferablesOf(response.layout) })
      setTimeout(() => worker.onmessage?.({ data: moved }), 0)
    },
  }
  return { worker, sent }
}

describe('layout in a Worker', () => {
  it('gives the same layout as laying out on the main thread', () => {
    const tree = generateTree(300, 1)
    const response = createLayoutHandler()({ seq: 7, input: inputOf(tree), options: OPTIONS })
    const direct = layoutTree(tree, OPTIONS)
    expect(response.seq).toBe(7)
    expect(response.layout.ids).toEqual(direct.ids)
    expect(Array.from(response.layout.x)).toEqual(Array.from(direct.x))
    expect(Array.from(response.layout.parentEdges)).toEqual(Array.from(direct.parentEdges))
  })

  it('sends only ids and links, not the people', () => {
    const tree = generateTree(20, 1)
    const input = inputOf(tree)
    expect(Object.keys(input).sort()).toEqual(['parentLinks', 'partnerships', 'personIds'])
    expect(input.personIds).toEqual(tree.persons.map((p) => p.id))
  })

  it('warm-starts from the layout it made last, even though that one was transferred away', () => {
    const tree = generateTree(500, 1)
    const handle = createLayoutHandler()
    const first = handle({ seq: 1, input: inputOf(tree), options: OPTIONS })
    // what the page receives: the buffers move, and are empty here afterwards
    structuredClone(first, { transfer: transferablesOf(first.layout) })
    expect(first.layout.x.byteLength).toBe(0)

    const newId = '00000000-0000-4000-8000-0000000fffff'
    const edited = addParentLink(addPerson(tree, { id: newId, firstName: 'New' }), newId, tree.persons[250]!.id)
    const second = handle({ seq: 2, input: inputOf(edited), options: OPTIONS })
    const warm = layoutTree(edited, { ...OPTIONS, previous: layoutTree(tree, OPTIONS) })
    expect(Array.from(second.layout.x)).toEqual(Array.from(warm.x))
  })

  describe('client', () => {
    it('lays out through the Worker and gets the typed arrays back', async () => {
      const { worker, sent } = inProcessWorker()
      const client = createLayoutClient(() => worker)
      const tree = generateTree(200, 2)
      const layout = await client.layout(tree, OPTIONS)
      expect(sent).toHaveLength(1)
      expect(layout.count).toBe(200)
      expect(layout.x.constructor.name).toBe('Float32Array')
      expect(Array.from(layout.x)).toEqual(Array.from(layoutTree(tree, OPTIONS).x))
    })

    it('answers each request with its own layout when several are in flight', async () => {
      const { worker } = inProcessWorker()
      const client = createLayoutClient(() => worker)
      const [small, big] = await Promise.all([
        client.layout(generateTree(30, 3), OPTIONS),
        client.layout(generateTree(60, 3), OPTIONS),
      ])
      expect([small.count, big.count]).toEqual([30, 60])
    })

    it('records how long the layout took', async () => {
      const { worker } = inProcessWorker()
      const client = createLayoutClient(() => worker)
      await client.layout(generateTree(50, 1), OPTIONS)
      expect(performance.getEntriesByName(LAYOUT_MEASURE).length).toBeGreaterThan(0)
    })

    it('lays out on this thread when there are no Workers', async () => {
      const client = createLayoutClient(() => null)
      const tree = generateTree(120, 1)
      expect(Array.from((await client.layout(tree, OPTIONS)).x)).toEqual(Array.from(layoutTree(tree, OPTIONS).x))
    })

    it('lays out on this thread when the Worker fails, for what was waiting and for what comes later', async () => {
      const { worker } = inProcessWorker()
      worker.postMessage = () => {} // never answers
      const client = createLayoutClient(() => worker)
      const waiting = client.layout(generateTree(80, 1), OPTIONS)
      worker.crash()
      expect((await waiting).count).toBe(80)
      expect(worker.terminate).toHaveBeenCalled()
      expect((await client.layout(generateTree(90, 1), OPTIONS)).count).toBe(90)
    })
  })
})
