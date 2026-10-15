// A: hand-rolled SVG. Branches are thick bezier strokes (thickness = descendants), leaves are cards.
export const name = 'Hand-rolled SVG'
export default function VariantA({ L }) {
  return (
    <div className="h-full overflow-auto bg-gradient-to-t from-amber-100 to-sky-100">
      <svg width={L.width} height={L.height} className="mx-auto">
        {L.parentEdges.map(({ child, parent }, i) => {
          const my = (child.y + parent.y) / 2
          return <path key={i} d={`M${parent.x},${parent.y} C${parent.x},${my} ${child.x},${my} ${child.x},${child.y}`}
            fill="none" stroke="#7c4a21" strokeLinecap="round" strokeWidth={Math.min(3 + parent.weight * 1.6, 18)} opacity=".85" />
        })}
        {L.partnerEdges.map(({ a, b, ended }, i) => (
          <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ended ? '#9ca3af' : '#be185d'} strokeWidth="3" strokeDasharray={ended ? '5 5' : ''} />
        ))}
        {L.nodes.map(n => (
          <g key={n.id} transform={`translate(${n.x},${n.y})`}>
            <ellipse rx="42" ry="22" fill="#4d7c0f" stroke="#365314" strokeWidth="2" />
            <text textAnchor="middle" dy="5" fill="white" fontSize="14">{n.name}</text>
          </g>
        ))}
      </svg>
    </div>
  )
}
