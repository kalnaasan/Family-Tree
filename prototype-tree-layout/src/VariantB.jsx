// B: React Flow (@xyflow/react) fed the shared positions: free pan/zoom, minimap, node dragging.
import { ReactFlow, Background, MiniMap, Controls } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
export const name = 'React Flow'
export default function VariantB({ L }) {
  const nodes = L.nodes.map(n => ({
    id: n.id, position: { x: n.x - 40, y: n.y - 18 }, data: { label: n.name },
    style: { background: '#4d7c0f', color: 'white', borderRadius: 999, width: 80, border: '2px solid #365314' },
  }))
  const edges = [
    ...L.parentEdges.map(({ child, parent }, i) => ({
      id: `p${i}`, source: parent.id, target: child.id, type: 'default',
      style: { stroke: '#7c4a21', strokeWidth: Math.min(2 + parent.weight, 14) },
    })),
    ...L.partnerEdges.map(({ a, b, ended }, i) => ({
      id: `m${i}`, source: a.id, target: b.id, type: 'straight',
      style: { stroke: ended ? '#9ca3af' : '#be185d', strokeWidth: 3, strokeDasharray: ended ? '5 5' : undefined },
    })),
  ]
  return (
    <div className="h-full">
      <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}>
        <Background /><MiniMap /><Controls />
      </ReactFlow>
    </div>
  )
}
