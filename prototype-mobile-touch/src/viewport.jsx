// PROTOTYPE (issue #10): shared touch viewport + SVG tree. Pointer Events only (touch, pen and mouse behave the same).
// Gestures: 1 finger drag = pan, 2 fingers = pinch-zoom + pan, double-tap = zoom toggle, long-press, mouse wheel / trackpad pinch.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
const MIN = 0.2, MAX = 2.5, SLOP = 8
const clampK = k => Math.min(MAX, Math.max(MIN, k))
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function useViewport(L, cbs) {
  const ref = useRef(null)
  const [size, setSize] = useState({ w: 360, h: 640, ready: false })
  const [v, setV] = useState({ x: 0, y: 0, k: 0.6 })
  const [gesture, setGesture] = useState('—')
  const vRef = useRef(v), cb = useRef(cbs), anim = useRef(0), ptrs = useRef(new Map()), g = useRef({})
  cb.current = cbs
  const put = nv => { vRef.current = nv; setV(nv) }
  const set = useCallback(nv => { cancelAnimationFrame(anim.current); put(nv) }, [])
  const zoomAt = (px, py, k2) => { const c = vRef.current; k2 = clampK(k2); const r = k2 / c.k; return { k: k2, x: px - (px - c.x) * r, y: py - (py - c.y) * r } }

  useLayoutEffect(() => {
    const el = ref.current, m = () => setSize({ w: el.clientWidth, h: el.clientHeight, ready: true })
    const ro = new ResizeObserver(m); ro.observe(el); m(); return () => ro.disconnect()
  }, [])

  const animateTo = useCallback(t => {
    cancelAnimationFrame(anim.current)
    if (reduce()) return put(t)
    const from = vRef.current, t0 = performance.now()
    const step = now => {
      const u = Math.min(1, (now - t0) / 300), e = 1 - (1 - u) ** 3
      put({ x: from.x + (t.x - from.x) * e, y: from.y + (t.y - from.y) * e, k: from.k + (t.k - from.k) * e })
      if (u < 1) anim.current = requestAnimationFrame(step)
    }
    anim.current = requestAnimationFrame(step)
  }, [])

  const rel = e => { const r = ref.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const down = e => {
    const [x, y] = rel(e), s = g.current
    ptrs.current.set(e.pointerId, { x, y }); cancelAnimationFrame(anim.current)
    if (ptrs.current.size === 1) {
      Object.assign(s, { moved: false, multi: false, lpFired: false, sx: x, sy: y, downId: e.target.closest?.('[data-id]')?.dataset.id ?? null })
      clearTimeout(s.lp)
      s.lp = setTimeout(() => { if (!s.moved && !s.multi && s.downId && cb.current.onLongPress) { s.lpFired = true; setGesture('long-press'); cb.current.onLongPress(s.downId) } }, 500)
    } else { s.multi = true; clearTimeout(s.lp) }
  }
  const move = e => {
    const p = ptrs.current.get(e.pointerId); if (!p) return
    const [x, y] = rel(e), s = g.current
    if (ptrs.current.size === 1) {
      if (!s.moved && Math.hypot(x - s.sx, y - s.sy) < SLOP) return // touch slop: tiny finger jitter is still a tap
      if (!s.moved) { s.moved = true; clearTimeout(s.lp); ref.current.setPointerCapture(e.pointerId) }
      const c = vRef.current; set({ ...c, x: c.x + x - p.x, y: c.y + y - p.y }); setGesture('pan'); p.x = x; p.y = y
    } else if (ptrs.current.size === 2) {
      p.x = x; p.y = y
      const [a, b] = [...ptrs.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2
      if (s.pd) { const z = zoomAt(cx, cy, vRef.current.k * d / s.pd); set({ ...z, x: z.x + cx - s.pcx, y: z.y + cy - s.pcy }); setGesture('pinch') }
      s.pd = d; s.pcx = cx; s.pcy = cy; s.moved = true
    }
  }
  const up = e => {
    const s = g.current
    if (!ptrs.current.delete(e.pointerId)) return
    clearTimeout(s.lp); if (ptrs.current.size < 2) s.pd = null
    if (ptrs.current.size === 0 && !s.moved && !s.multi && !s.lpFired && e.type === 'pointerup') {
      const [x, y] = rel(e), now = performance.now(), lt = s.lastTap
      if (lt && now - lt.t < 300 && Math.hypot(x - lt.x, y - lt.y) < 30) {
        s.lastTap = null; const k = vRef.current.k
        animateTo(zoomAt(x, y, k < 1.2 ? k * 2 : k / 2)); setGesture('double-tap zoom')
      } else {
        s.lastTap = { t: now, x, y }
        if (s.downId) { setGesture('tap person'); cb.current.onTap?.(s.downId) } else { setGesture('tap empty'); cb.current.onTapEmpty?.() }
      }
    }
  }
  useEffect(() => {
    const el = ref.current
    const h = e => { e.preventDefault(); const r = el.getBoundingClientRect(); set(zoomAt(e.clientX - r.left, e.clientY - r.top, vRef.current.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)))); setGesture('wheel zoom') }
    el.addEventListener('wheel', h, { passive: false }); return () => el.removeEventListener('wheel', h)
  }, [])

  return {
    ref, v, size, gesture,
    handlers: { onPointerDown: down, onPointerMove: move, onPointerUp: up, onPointerCancel: up },
    animateTo, set,
    zoomBy: f => animateTo(zoomAt(size.w / 2, size.h / 2, vRef.current.k * f)),
    fit: () => { const k = clampK(Math.min(size.w / L.width, size.h / L.height) * 0.92); return { k, x: (size.w - L.width * k) / 2, y: (size.h - L.height * k) / 2 } },
    centerOn: (n, k = vRef.current.k, reserveBottom = 0) => ({ k, x: size.w / 2 - n.x * k, y: (size.h - reserveBottom) / 2 - n.y * k }),
    toScreen: n => ({ x: n.x * v.k + v.x, y: n.y * v.k + v.y }),
    now: () => vRef.current,
  }
}

const ring = g => (g === 'female' ? '#059669' : g === 'male' ? '#b45309' : '#a8a29e')
export function TreeCanvas({ vp, L, selected, focusId, dim }) {
  const { x, y, k } = vp.v
  return (
    <div ref={vp.ref} {...vp.handlers} className="absolute inset-0 select-none overflow-hidden bg-amber-50" style={{ touchAction: 'none' }}>
      <svg width="100%" height="100%" className="block">
        <g transform={`translate(${x} ${y}) scale(${k})`}>
          {L.parentEdges.map((e, i) => <line key={i} x1={e.parent.x} y1={e.parent.y} x2={e.child.x} y2={e.child.y} stroke="#8b5a2b" strokeWidth="3" />)}
          {L.partnerEdges.map((e, i) => <line key={i} x1={e.a.x} y1={e.a.y} x2={e.b.x} y2={e.b.y} stroke="#c0392b" strokeWidth="2.5" strokeDasharray={e.ended ? '5 4' : ''} />)}
          {L.nodes.map(n => (
            <g key={n.id} data-id={n.id} transform={`translate(${n.x} ${n.y})`} opacity={dim && !dim.has(n.id) ? 0.3 : 1}>
              {/* hit slop: never smaller than ~24 screen px radius, even zoomed out */}
              <circle r={Math.min(52, Math.max(34, 24 / k))} fill="transparent" />
              <circle r="28" fill="white" stroke={ring(n.gender)} strokeWidth="4" />
              {selected === n.id && <circle r="36" fill="none" stroke="#0ea5e9" strokeWidth="4" />}
              {focusId === n.id && <text y="-38" textAnchor="middle" fontSize="16" fill="#b45309">★</text>}
              <text textAnchor="middle" dy="4" fontSize={k < 0.45 ? 18 : 12} fontWeight="500" fill="#44403c" style={{ pointerEvents: 'none' }}>{k < 0.45 ? n.name[0] : n.name}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  )
}

export function Hud({ vp, v, hint }) {
  return (
    <div className="pointer-events-none absolute left-2 top-12 z-30 max-w-[70%] rounded-lg bg-black/75 px-2 py-1 text-[11px] leading-tight text-green-200">
      {v} · zoom {Math.round(vp.v.k * 100)}% · last: {vp.gesture}<br /><span className="text-stone-300">{hint}</span>
    </div>
  )
}
