// PROTOTYPE tree view shared by the variants: simple card tree, roots at the bottom (not the point of this prototype).
const ring = g => (g === 'female' ? 'border-emerald-600' : g === 'male' ? 'border-amber-700' : 'border-stone-400')
export function Tree({ L, selected, onSelect, overlay }) {
  return (
    <div className="relative" style={{ width: L.width, height: L.height }}>
      <svg className="absolute inset-0" width={L.width} height={L.height}>
        {L.parentEdges.map((e, i) => <line key={i} x1={e.parent.x} y1={e.parent.y} x2={e.child.x} y2={e.child.y} stroke="#8b5a2b" strokeWidth="3" />)}
        {L.partnerEdges.map((e, i) => <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="#c0392b" strokeWidth="2" strokeDasharray={e.ended ? '5 4' : ''} />)}
      </svg>
      {L.nodes.map(n => (
        <button key={n.id} onClick={() => onSelect(n.id)} style={{ left: n.x - 32, top: n.y - 32 }}
          className={`absolute flex h-16 w-16 items-center justify-center rounded-full border-4 bg-white text-xs font-medium ${ring(n.gender)} ${selected === n.id ? 'ring-4 ring-sky-400' : ''}`}>
          {n.name}
        </button>
      ))}
      {overlay}
    </div>
  )
}
