// PROTOTYPE: ?variant=A|B|C. Throwaway; see issue #2.
import { createRoot } from 'react-dom/client'
import { useEffect, useMemo, useState } from 'react'
import './index.css'
import { persons, parentLinks, partnerships } from './data.js'
import { layout } from './layout.js'
import VariantA, { name as nameA } from './VariantA.jsx'
import VariantB, { name as nameB } from './VariantB.jsx'
import VariantC, { name as nameC } from './VariantC.jsx'

const V = { A: [VariantA, nameA], B: [VariantB, nameB], C: [VariantC, nameC] }
const keys = Object.keys(V)

function App() {
  const [v, setV] = useState(new URLSearchParams(location.search).get('variant') ?? 'A')
  const L = useMemo(() => layout({ persons, parentLinks, partnerships }), [])
  const go = d => {
    const next = keys[(keys.indexOf(v) + d + keys.length) % keys.length]
    setV(next); history.replaceState(null, '', `?variant=${next}`)
  }
  useEffect(() => {
    const h = e => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1) }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  })
  const [Comp, label] = V[v]
  return (
    <div className="h-screen w-screen">
      <Comp L={L} />
      <div className="fixed bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-white shadow-xl">
        <button onClick={() => go(-1)}>←</button><span>{v} ({label})</span><button onClick={() => go(1)}>→</button>
      </div>
    </div>
  )
}
createRoot(document.getElementById('root')).render(<App />)
