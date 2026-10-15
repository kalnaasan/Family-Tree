// PROTOTYPE: ?variant=A|B|C. Throwaway; see issue #5. In-memory only.
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { initial } from './store.js'
import { layout } from './layout.js'
import { Tree } from './Tree.jsx'
import { VariantA, VariantB, VariantC, names } from './variants.jsx'

const V = { A: VariantA, B: VariantB, C: VariantC }, keys = Object.keys(V)
function App() {
  const [v, setV] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const [state, setState] = useState(initial), [selected, setSelected] = useState('ben'), [log, setLog] = useState(['(nothing added yet)'])
  const L = useMemo(() => layout(state), [state])
  const go = d => { const k = keys[(keys.indexOf(v) + d + keys.length) % keys.length]; setV(k); history.replaceState(null, '', `?variant=${k}`) }
  useEffect(() => {
    const h = e => { if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const commit = ({ state: s, created }) => { setState(s); setLog(created) }
  const Comp = V[v], props = { L, state, selected, commit, onSelect: setSelected }
  return (
    <div className="h-screen w-screen overflow-auto bg-amber-50">
      <div className="p-8"><Tree L={L} selected={selected} onSelect={setSelected} overlay={v === 'A' && <Comp {...props} />} /></div>
      {v !== 'A' && <Comp {...props} />}
      <pre className="fixed bottom-16 left-4 max-w-md rounded bg-black/80 p-3 text-xs text-green-200">Last add — stored changes:{'\n'}{log.join('\n')}</pre>
      <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-white shadow-xl">
        <button onClick={() => go(-1)}>←</button><span>{v} ({names[v]})</span><button onClick={() => go(1)}>→</button>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
