// PROTOTYPE (issue #10): ?variant=A|B|C. Throwaway, read-only data, add-relative stubbed. Switcher is at the TOP so it never covers sheets.
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { makeFamily } from './family.js'
import { layout } from './layout.js'
import { VariantA, VariantB, VariantC, names } from './variants.jsx'

const V = { A: VariantA, B: VariantB, C: VariantC }, keys = Object.keys(V)
const { state: s, focusId: f0 } = makeFamily()
function App() {
  const [v, setV] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const [focusId, setFocus] = useState(f0), [msg, setMsg] = useState('')
  const L = useMemo(() => layout(s), [])
  const go = d => { const k = keys[(keys.indexOf(v) + d + keys.length) % keys.length]; setV(k); history.replaceState(null, '', `?variant=${k}`) }
  useEffect(() => {
    const h = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(''), 2200); return () => clearTimeout(t) } }, [msg])
  const Comp = V[v]
  return (
    <div className="fixed inset-0 h-dvh">
      <Comp key={v} L={L} s={s} focusId={focusId} setFocus={setFocus} toast={setMsg} />
      <div className="absolute left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black px-2 text-sm text-white shadow-xl">
        <button className="min-h-11 min-w-10" onClick={() => go(-1)}>←</button><span className="whitespace-nowrap">{v} · {names[v]}</span><button className="min-h-11 min-w-10" onClick={() => go(1)}>→</button></div>
      {msg && <div className="absolute left-1/2 top-24 z-50 -translate-x-1/2 rounded-lg bg-stone-900 px-3 py-2 text-sm text-white">{msg}</div>}
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
