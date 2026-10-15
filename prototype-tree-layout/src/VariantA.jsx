// A: hand-rolled SVG styled after the reference image: tapered brown branches, roots at the base,
// round medallion people with green/tan rings, leaves. Pan (drag) + zoom (wheel) built by hand.
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { crown } from './layout.js'
export const name = 'SVG tree (reference style)'

const rnd = s => { const x = Math.sin(s * 9301 + 49297) * 233280; return x - Math.floor(x) }

// crown-aware branch: control points run along the radial direction so branches bow like real boughs
function bough(p, c, w0, w1) {
  const k = 0.5 * Math.hypot(c.x - p.x, c.y - p.y)
  const dp = p.theta === undefined ? { x: 0, y: -1 } : { x: Math.sin(p.theta), y: -Math.cos(p.theta) }
  const dc = c.theta === undefined ? { x: 0, y: -1 } : { x: Math.sin(c.theta), y: -Math.cos(c.theta) }
  return taperC(p, { x: p.x + dp.x * k, y: p.y + dp.y * k }, { x: c.x - dc.x * k, y: c.y - dc.y * k }, c, w0, w1)
}
function taperC(P0, C0, C1, P1, w0, w1) {
  const N = 14, L = [], R = []
  for (let i = 0; i <= N; i++) {
    const t = i / N, u = 1 - t
    const x = u ** 3 * P0.x + 3 * u * u * t * C0.x + 3 * u * t * t * C1.x + t ** 3 * P1.x
    const y = u ** 3 * P0.y + 3 * u * u * t * C0.y + 3 * u * t * t * C1.y + t ** 3 * P1.y
    const dx = 3 * u * u * (C0.x - P0.x) + 6 * u * t * (C1.x - C0.x) + 3 * t * t * (P1.x - C1.x)
    const dy = 3 * u * u * (C0.y - P0.y) + 6 * u * t * (C1.y - C0.y) + 3 * t * t * (P1.y - C1.y)
    const len = Math.hypot(dx, dy) || 1, w = (w0 + (w1 - w0) * t) / 2
    L.push([x - (dy / len) * w, y + (dx / len) * w]); R.push([x + (dy / len) * w, y - (dx / len) * w])
  }
  return 'M' + [...L, ...R.reverse()].map(q => q.map(Math.round).join(',')).join(' L') + 'Z'
}
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

export default function VariantA({ L: linear }) {
  const C = useMemo(() => crown(linear), [linear])
  const box = useRef(null)
  const [v, setV] = useState({ x: 0, y: 0, k: 1 })
  const drag = useRef(null)
  useLayoutEffect(() => {
    const r = box.current.getBoundingClientRect(), b = C.bounds
    const k = Math.min(r.width / (b.x1 - b.x0), r.height / (b.y1 - b.y0))
    setV({ k, x: -b.x0 * k + (r.width - (b.x1 - b.x0) * k) / 2, y: -b.y0 * k + (r.height - (b.y1 - b.y0) * k) / 2 })
  }, [C])
  const leaves = useMemo(() => C.nodes.flatMap((n, i) => [0, 1].map(j => {
    const a = rnd(i * 2 + j) * Math.PI * 2, d = 38 + rnd(i + j * 7) * 10
    return { x: n.x + Math.cos(a) * d, y: n.y + Math.sin(a) * d, r: a * 57 }
  })), [C])
  const O = { x: 0, y: 0 }
  const trunk = taperC({ x: 0, y: 300 }, { x: -20, y: 200 }, { x: 20, y: 100 }, O, 56, 40)
  const roots = [-1, -0.5, 0, 0.5, 1].map((s, i) => taperC({ x: 0, y: 300 }, { x: s * 40, y: 320 }, { x: s * 110, y: 330 }, { x: s * 190, y: 345 + (i % 2) * 15 }, 30, 3))
  const onWheel = e => {
    const r = e.currentTarget.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top
    const k = Math.min(4, Math.max(0.02, v.k * (e.deltaY < 0 ? 1.12 : 0.89)))
    setV({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k })
  }
  return (
    <div ref={box} className="h-full w-full cursor-grab overflow-hidden bg-gradient-to-b from-sky-100 via-violet-100 to-violet-200"
      onWheel={onWheel}
      onPointerDown={e => { drag.current = { x: e.clientX - v.x, y: e.clientY - v.y }; e.currentTarget.setPointerCapture(e.pointerId) }}
      onPointerMove={e => drag.current && setV(s => ({ ...s, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y }))}
      onPointerUp={() => (drag.current = null)}>
      <svg width="100%" height="100%" style={{ touchAction: 'none' }}>
        <g transform={`translate(${v.x},${v.y}) scale(${v.k})`}>
          {roots.map((d, i) => <path key={i} d={d} fill="#6b3f1d" />)}
          <path d={trunk} fill="#7a4a24" />
          {C.rootNodes.map(n => <path key={n.id} d={bough(O, n, 38, 14)} fill="#7a4a24" />)}
          {C.parentEdges.map(({ child, parent }, i) => (
            <path key={i} fill="#8b5a2b" d={bough(parent, child, Math.min(5 + parent.weight * 1.2, 22), Math.min(3 + child.weight * 1.2, 18))} />
          ))}
          {C.partnerEdges.map(({ a, b, ended }, i) => (
            <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={ended ? '#9ca3af' : '#b45309'} strokeWidth="4" strokeDasharray={ended ? '6 6' : ''} />
          ))}
          {leaves.map((l, i) => <ellipse key={i} cx={l.x} cy={l.y} rx="9" ry="4.5" fill="#8fa35a" transform={`rotate(${l.r} ${l.x} ${l.y})`} />)}
          {C.nodes.map(n => <Person key={n.id} n={n} female={/a$|e$/.test(n.name)} />)}
        </g>
      </svg>
    </div>
  )
}
