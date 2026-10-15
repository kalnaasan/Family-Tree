// PROTOTYPE (issue #10). Three structurally different touch models for the same tree.
import { useEffect, useRef, useState } from 'react'
import { useViewport, TreeCanvas, Hud } from './viewport.jsx'
import { PersonPanel } from './Panel.jsx'
import { relatives } from './store.js'

export const names = { A: 'Free canvas + bottom sheet', B: 'Walk the tree', C: 'Toolbar + minimap + callout' }
const Btn = ({ className = '', ...p }) => <button {...p} className={`flex min-h-12 min-w-12 items-center justify-center rounded-full bg-white px-3 text-lg shadow-lg active:bg-stone-100 disabled:opacity-30 ${className}`} />

// ---------- A: pure direct manipulation. Tap selects, a peeking bottom sheet appears, drag/tap the handle to expand.
export function VariantA({ L, s, focusId, setFocus, toast }) {
  const [sel, setSel] = useState(null), [open, setOpen] = useState(false), sw = useRef(0), addRef = useRef(null)
  const PEEK = 150
  const vp = useViewport(L, {
    onTap: id => { setSel(id); setOpen(false); ensureVisible(id) }, onTapEmpty: () => { setSel(null); setOpen(false) },
  })
  const ensureVisible = id => { // pan just enough that the person is not hidden behind the sheet
    const c = vp.now(), n = L.byId[id], sx = n.x * c.k + c.x, sy = n.y * c.k + c.y, lim = vp.size.h - PEEK - 50
    const dx = sx < 50 ? 50 - sx : sx > vp.size.w - 50 ? vp.size.w - 50 - sx : 0, dy = sy > lim ? lim - sy : sy < 90 ? 90 - sy : 0
    if (dx || dy) vp.animateTo({ ...c, x: c.x + dx, y: c.y + dy })
  }
  useEffect(() => { if (vp.size.ready) vp.set(vp.centerOn(L.byId[focusId], 0.8)) }, [vp.size.ready])
  const p = sel && s.persons.find(x => x.id === sel)
  return (
    <div className="absolute inset-0">
      <TreeCanvas vp={vp} L={L} selected={sel} focusId={focusId} />
      <Hud vp={vp} v="A" hint="Drag = pan · pinch = zoom · double-tap = zoom · tap a person" />
      <Btn className="absolute right-3 z-10" style={{ bottom: sel ? (open ? 'calc(62% + 12px)' : PEEK + 12) : 16 }} onClick={() => vp.animateTo(vp.centerOn(L.byId[focusId], 0.8, sel ? PEEK : 0))} aria-label="Back to Focus person">◎</Btn>
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden rounded-t-2xl bg-white shadow-[0_-4px_24px_rgba(0,0,0,.25)] transition-[height] duration-200" style={{ height: sel ? (open ? '62%' : PEEK) : 0 }}>
        <div className="flex h-9 shrink-0 touch-none items-center justify-center" onPointerDown={e => (sw.current = e.clientY)}
          onPointerUp={e => { const dy = e.clientY - sw.current; if (dy < -24) setOpen(true); else if (dy > 24) (open ? setOpen(false) : setSel(null)); else setOpen(o => !o) }}>
          <div className="h-1.5 w-10 rounded-full bg-stone-300" /></div>
        {p && (open ? <div className="overflow-y-auto"><PersonPanel s={s} L={L} id={sel} focusId={focusId} onFocus={setFocus} onAdd={(r, n) => toast(`(stub) Add ${r} of ${n}`)}
            onGoto={id => { setSel(id); vp.animateTo(vp.centerOn(L.byId[id], vp.now().k, vp.size.h * 0.62)) }} /></div> :
          <div className="px-4"><div className="text-lg font-semibold">{p.name} <span className="text-sm font-normal text-stone-500">{focusId === sel ? '★ Focus person' : p.gender}</span></div>
            <div className="mt-2 flex gap-2"><button onClick={() => setOpen(true)} className="min-h-12 flex-1 rounded-xl bg-emerald-700 text-sm font-medium text-white">＋ Add relative</button>
              <button onClick={() => setOpen(true)} className="min-h-12 flex-1 rounded-xl border border-stone-300 text-sm">Details</button></div></div>)}
      </div>
    </div>
  )
}

// ---------- B: "walk the tree". Tapping recentres + zooms to a readable level; relatives are lit, the rest dimmed.
// A thumb bar follows family links (touch version of the arrow-key navigation); tap the centred person again for details.
export function VariantB({ L, s, focusId, setFocus, toast }) {
  const [sel, setSel] = useState(focusId), [panel, setPanel] = useState(false), cyc = useRef({})
  const BAR = 124
  const vp = useViewport(L, { onTap: id => (id === sel ? setPanel(true) : goto(id)), onTapEmpty: () => setPanel(false) })
  const goto = id => { setSel(id); setPanel(false); vp.animateTo(vp.centerOn(L.byId[id], 1.1, BAR)) }
  useEffect(() => { if (vp.size.ready) vp.set(vp.centerOn(L.byId[focusId], 1.1, BAR)) }, [vp.size.ready])
  const r = relatives(s, sel), byX = a => [...a].sort((x, y) => L.byId[x].x - L.byId[y].x)
  const sibs = byX([sel, ...r.sibs]), me = sibs.indexOf(sel)
  const lists = { up: byX(r.parents), down: byX(r.children), heart: byX(r.partners.map(p => p.id)), left: sibs.length > 1 ? [sibs[(me - 1 + sibs.length) % sibs.length]] : [], right: sibs.length > 1 ? [sibs[(me + 1) % sibs.length]] : [] }
  const step = d => { const l = lists[d]; if (!l.length) return; const key = sel + d; cyc.current[key] = ((cyc.current[key] ?? -1) + 1) % l.length; goto(l[cyc.current[key]]) }
  const dim = new Set([sel, ...r.parents, ...r.children, ...r.partners.map(p => p.id), ...r.sibs])
  const N = ({ d, label }) => <Btn disabled={!lists[d].length} onClick={() => step(d)} className="flex-1 flex-col !rounded-xl text-base leading-tight">{label}{lists[d].length > 1 && <span className="text-[10px] text-stone-500">{lists[d].length}</span>}</Btn>
  return (
    <div className="absolute inset-0">
      <TreeCanvas vp={vp} L={L} selected={sel} focusId={focusId} dim={dim} />
      <Hud vp={vp} v="B" hint="Tap a person = centre + zoom · tap again = details · bar follows family links" />
      <div className="absolute inset-x-0 bottom-0 z-20 bg-white/95 p-2 shadow-[0_-4px_24px_rgba(0,0,0,.2)]" style={{ height: BAR }}>
        <div className="mb-1 flex items-center justify-between px-1"><span className="text-sm font-semibold">{s.persons.find(x => x.id === sel).name}</span>
          <span className="flex gap-2"><button className="min-h-11 px-2 text-sm underline" onClick={() => vp.animateTo(vp.fit())}>Overview</button><button className="min-h-11 px-2 text-sm underline" onClick={() => setPanel(true)}>Details</button></span></div>
        <div className="flex gap-2">{N({ d: "up", label: "↑ Parent" })}{N({ d: "left", label: "◀" })}{N({ d: "heart", label: "♥ Partner" })}{N({ d: "right", label: "▶" })}{N({ d: "down", label: "↓ Child" })}</div>
      </div>
      {panel && <><div className="absolute inset-0 z-30 bg-black/30" onClick={() => setPanel(false)} />
        <div className="absolute inset-x-0 bottom-0 z-40 max-h-[75%] overflow-y-auto rounded-t-2xl bg-white pt-3 shadow-xl">
          <PersonPanel s={s} L={L} id={sel} focusId={focusId} onFocus={setFocus} onGoto={goto} onAdd={(x, n) => toast(`(stub) Add ${x} of ${n}`)} /></div></>}
    </div>
  )
}

// ---------- C: explicit controls. Always-visible zoom buttons (thumb zone), minimap to jump around, callout anchored on the tapped card.
export function VariantC({ L, s, focusId, setFocus, toast }) {
  const [sel, setSel] = useState(null), [detail, setDetail] = useState(false)
  const vp = useViewport(L, { onTap: setSel, onTapEmpty: () => setSel(null), onLongPress: id => { setSel(id); setDetail(true) } })
  useEffect(() => { if (vp.size.ready) vp.set(vp.centerOn(L.byId[focusId], 0.8)) }, [vp.size.ready])
  const MW = 110, MH = 90, ms = Math.min(MW / L.width, MH / L.height), c = vp.v
  const jump = e => { const r = e.currentTarget.getBoundingClientRect(), wx = (e.clientX - r.left) / ms, wy = (e.clientY - r.top) / ms; vp.set({ ...c, x: vp.size.w / 2 - wx * c.k, y: vp.size.h / 2 - wy * c.k }) }
  const n = sel && L.byId[sel], sp = n && vp.toScreen(n), p = sel && s.persons.find(x => x.id === sel)
  const below = sp && sp.y < 130, vis = sp && sp.x > 0 && sp.x < vp.size.w && sp.y > 0 && sp.y < vp.size.h
  return (
    <div className="absolute inset-0">
      <TreeCanvas vp={vp} L={L} selected={sel} focusId={focusId} />
      <Hud vp={vp} v="C" hint="Drag/pinch · +/− buttons · minimap jumps · tap = callout · long-press = details" />
      <div className="absolute bottom-6 right-3 z-20 flex flex-col gap-3">
        <Btn onClick={() => vp.zoomBy(1.5)} aria-label="Zoom in">＋</Btn><Btn onClick={() => vp.zoomBy(1 / 1.5)} aria-label="Zoom out">－</Btn>
        <Btn onClick={() => vp.animateTo(vp.fit())} aria-label="Show whole tree">⤢</Btn><Btn onClick={() => vp.animateTo(vp.centerOn(L.byId[focusId], 0.8))} aria-label="Back to Focus person">◎</Btn></div>
      <div className="absolute bottom-6 left-3 z-20 touch-none rounded-lg border border-stone-400 bg-white/90 shadow" style={{ width: MW, height: MH }} onPointerDown={jump} onPointerMove={e => e.buttons && jump(e)}>
        <svg width={MW} height={MH}>{L.nodes.map(q => <circle key={q.id} cx={q.x * ms} cy={q.y * ms} r="2" fill={q.id === focusId ? '#b45309' : '#78716c'} />)}
          <rect x={-c.x / c.k * ms} y={-c.y / c.k * ms} width={vp.size.w / c.k * ms} height={vp.size.h / c.k * ms} fill="rgba(14,165,233,.15)" stroke="#0ea5e9" /></svg></div>
      {p && vis && !detail && (
        <div className="absolute z-20 -translate-x-1/2 rounded-2xl bg-white p-2 shadow-xl" style={{ left: Math.min(Math.max(sp.x, 110), vp.size.w - 110), top: below ? sp.y + 40 * c.k + 14 : sp.y - 40 * c.k - 14, transform: `translate(-50%, ${below ? '0' : '-100%'})` }}>
          <div className="px-2 pb-1 text-sm font-semibold">{p.name}</div>
          <div className="flex gap-1"><button className="min-h-11 rounded-xl bg-emerald-700 px-3 text-sm text-white" onClick={() => setDetail(true)}>＋ Add</button>
            <button className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm" onClick={() => setDetail(true)}>Details</button>
            <button className="min-h-11 rounded-xl border border-stone-300 px-3 text-sm" onClick={() => setFocus(sel)}>★</button></div></div>)}
      {detail && sel && (
        <div className="absolute inset-0 z-40 flex flex-col bg-white"><div className="flex h-14 shrink-0 items-center justify-between border-b px-2"><span className="px-2 font-semibold">Person</span>
          <button className="min-h-12 min-w-12 text-xl" onClick={() => setDetail(false)} aria-label="Close">✕</button></div>
          <div className="overflow-y-auto pt-3"><PersonPanel s={s} L={L} id={sel} focusId={focusId} onFocus={setFocus} onAdd={(x, nm) => toast(`(stub) Add ${x} of ${nm}`)}
            onGoto={id => { setSel(id); setDetail(false); vp.animateTo(vp.centerOn(L.byId[id], vp.now().k)) }} /></div></div>)}
    </div>
  )
}
