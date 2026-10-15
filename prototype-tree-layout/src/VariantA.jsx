// A: hand-rolled SVG styled after the reference image: tapered brown branches, roots at the base,
// round medallion people with green/tan rings, leaves. Pan (drag) + zoom (wheel) built by hand.
import { useMemo, useRef, useState } from 'react'
export const name = 'SVG tree (reference style)'

const rnd = s => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }

function taper(x0, y0, x1, y1, w0, w1, bend = 0) {
  const my = (y0 + y1) / 2, N = 14, L = [], R = []
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t
    const cx0 = x0 + bend, cx1 = x1 - bend
    const x = u ** 3 * x0 + 3 * u * u * t * cx0 + 3 * u * t * t * cx1 + t ** 3 * x1
    const y = u ** 3 * y0 + 3 * u * u * t * my + 3 * u * t * t * my + t ** 3 * y1
    const dx = 3 * u * u * (cx0 - x0) + 6 * u * t * (cx1 - cx0) + 3 * t * t * (x1 - cx1)
    const dy = 3 * u * u * (my - y0) + 6 * u * t * (my - my) + 3 * t * t * (y1 - my)
    const len = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2
    L.push([x - (dy / len) * w, y + (dx / len) * w]); R.push([x + (dy / len) * w, y - (dx / len) * w])
  }
  return 'M' + [...L, ...R.reverse()].map(p => p.join(',')).join(' L') + 'Z'
}

function Person({ n, female }) {
  const ring = n.gen % 2 ? '#c98a4b' : '#8a9a5b'
  return (
    <g transform={`translate(${n.x},${n.y})`}>
      <circle r="31" fill="#f3dfb5" stroke={ring} strokeWidth="6" />
      <circle cy="-9" r="6" fill="#8b5a2b" />
      {female ? <path d="M0,-3 L-9,16 H9 Z" fill="#8b5a2b" /> : <rect x="-7" y="-2" width="14" height="18" rx="4" fill="#8b5a2b" />}
      <text y="48" textAnchor="middle" fontSize="12" fill="#4a3320">{n.name}</text>
    </g>
  )
}

export default function VariantA({ L }) {
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef(null)
  const leaves = useMemo(() => L.nodes.flatMap((n, i) => [0, 1].map(j => {
    const a = rnd(i * 2 + j) * Math.PI * 2, d = 38 + rnd(i + j * 7) * 10
    return { x: n.x + Math.cos(a) * d, y: n.y + Math.sin(a) * d, r: a * 57 }
  })), [L])
  const roots = useMemo(() => L.nodes.filter(n => n.gen === 0).flatMap((n, i) => [-1, 0, 1].map(s => ({
    d: taper(n.x, n.y, n.x + s * (50 + rnd(i + s) * 40), n.y + 70 + rnd(i * 3 + s) * 30, 10, 2, s * 12),
  }))), [L])
  const onWheel = e => {
    const r = e.currentTarget.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
    const k = Math.min(4, Math.max(0.15, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
    setV({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k })
  }
  return (
    <div className="h-full w-full cursor-grab overflow-hidden bg-gradient-to-b from-sky-100 via-violet-100 to-violet-200"
      onWheel={onWheel}
      onPointerDown={e => { drag.current = { x: e.clientX - v.x, y: e.clientY - v.y }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => drag.current && setV(s => ({ ...s, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }))}
      onPointerUp={() => (drag.current = null)}>
      <svg width="100%" height="100%" style={{ touchAction: 'none' }}>
        <g transform={`translate(${v.x + 40},${v.y + 20}) scale(${v.k})`}>
          {roots.map((r, i) => <path key={i} d={r.d} fill="#7a4a24" />)}
          {L.parentEdges.map(({ child, parent }, i) => (
            <path key={i} fill="#8b5a2b" d={taper(parent.x, parent.y, child.x, child.y,
              Math.min(6 + parent.weight * 1.4, 26), Math.min(4 + child.weight * 1.4, 22), (child.x - parent.x) * 0.15)} />
          ))}
          {L.partnerEdges.map(({ a, b, ended }, i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ended ? '#9ca3af' : '#b45309'} strokeWidth="4" strokeDasharray={ended ? '6 6' : ''} />
          ))}
          {leaves.map((l, i) => <ellipse key={i} cx={l.x} cy={l.y} rx="9" ry="4.5" fill="#8fa35a" transform={`rotate(${l.r} ${l.x} ${l.y})`} />)}
          {L.nodes.map(n => <Person key={n.id} n={n} female={/a$|e$/.test(n.name)} />)}
        </g>
      </svg>
    </div>
  )
}
