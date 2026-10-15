// PROTOTYPE (issue #5): three add-relative flows over the same rules in store.js.
import { useState } from 'react'
import { RELATIONS, clarify, apply, nameOf } from './store.js'

const btn = 'rounded-md border border-stone-300 bg-white px-2 py-1 text-sm hover:bg-stone-100'
const primary = 'rounded-md bg-emerald-700 px-3 py-1 text-sm text-white disabled:opacity-40'

// Shared hook: one pending "add" with relation, name, gender, answer to the clarifying question.
function useAdd(state, id, commit) {
  const [rel, setRel] = useState(null), [name, setName] = useState(''), [gender, setGender] = useState('unknown'), [choice, setChoice] = useState(null), [err, setErr] = useState('')
  const q = rel ? clarify(state, id, rel.key) : null
  const pick = r => { setRel(r); setGender(r.gender); setChoice(null); setName(''); setErr('') }
  const reset = () => { setRel(null); setErr('') }
  const submit = () => {
    try { commit(apply(state, id, rel.key, { name: name.trim(), gender }, choice ?? q?.default)); reset() } catch (e) { setErr(e.message) }
  }
  return { rel, q, name, setName, gender, setGender, choice: choice ?? q?.default, setChoice, err, pick, reset, submit, ok: name.trim() && !q?.blocked }
}
const GenderPick = ({ a }) => (
  <select value={a.gender} onChange={e => a.setGender(e.target.value)} className={btn}>
    {['female', 'male', 'other', 'unknown'].map(g => <option key={g}>{g}</option>)}
  </select>
)

// ── A: popover on the card; ambiguity as chips inline, only when needed ─────────────────────────────────────────
export function VariantA({ L, state, selected, commit }) {
  const a = useAdd(state, selected, commit), n = L.byId[selected]
  if (!n) return null
  return (
    <div style={{ left: n.x + 44, top: n.y - 40 }} className="absolute z-10 w-64 rounded-xl border bg-white p-3 shadow-xl">
      <div className="mb-2 text-sm font-semibold">Add to {n.name}</div>
      {!a.rel ? (
        <div className="grid grid-cols-3 gap-1">{RELATIONS.map(r => <button key={r.key} className={btn} onClick={() => a.pick(r)}>{r.label}</button>)}</div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm">New <b>{a.rel.label.toLowerCase()}</b> of {n.name}</div>
          {a.q?.blocked ? <div className="text-sm text-red-700">{a.q.blocked}</div> : <>
            {a.q && <div><div className="mb-1 text-xs text-stone-600">{a.q.question}</div>
              <div className="flex flex-wrap gap-1">{a.q.options.map(o => <button key={o.value} onClick={() => a.setChoice(o.value)}
                className={`${btn} ${a.choice === o.value ? '!border-sky-500 !bg-sky-100' : ''}`}>{o.label}</button>)}</div></div>}
            <div className="flex gap-1"><input autoFocus placeholder="Name" value={a.name} onChange={e => a.setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && a.ok && a.submit()} className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm" /><GenderPick a={a} /></div></>}
          {a.err && <div className="text-sm text-red-700">{a.err}</div>}
          <div className="flex justify-between"><button className={btn} onClick={a.reset}>Back</button><button className={primary} disabled={!a.ok} onClick={a.submit}>Add</button></div>
        </div>
      )}
    </div>
  )
}

// ── B: side panel listing existing relatives per group, "+ Add" per group, form with all fields at once ─────────
export function VariantB({ state, selected, commit, onSelect }) {
  const a = useAdd(state, selected, commit)
  if (!selected) return null
  const parents = state.parentLinks.filter(([c]) => c === selected).map(([, p]) => p)
  const kids = state.parentLinks.filter(([, p]) => p === selected).map(([c]) => c)
  const ships = state.partnerships.filter(([x, y]) => x === selected || y === selected)
  const sibs = [...new Set(parents.flatMap(p => state.parentLinks.filter(([c, q]) => q === p && c !== selected).map(([c]) => c)))]
  const Row = ({ ids, kind }) => <>{ids.map(i => <button key={i} className="mr-1 text-sm underline" onClick={() => onSelect(i)}>{nameOf(state, i)}</button>)}
    {RELATIONS.filter(r => r.kind === kind).map(r => <button key={r.key} className={`${btn} mr-1`} onClick={() => a.pick(r)}>+ {r.label}</button>)}</>
  return (
    <aside className="fixed right-0 top-0 h-full w-80 overflow-auto border-l bg-white p-4 shadow-xl">
      <h2 className="mb-3 text-lg font-semibold">{nameOf(state, selected)}</h2>
      {[['Parents', parents, 'parent'], ['Partners', ships.map(([x, y]) => (x === selected ? y : x)), 'partner'], ['Siblings', sibs, 'sibling'], ['Children', kids, 'child']].map(([t, ids, k]) => (
        <div key={t} className="mb-3"><div className="mb-1 text-xs uppercase tracking-wide text-stone-500">{t}</div><Row ids={ids} kind={k} /></div>))}
      {a.rel && (
        <div className="mt-4 space-y-2 rounded-lg border bg-stone-50 p-3">
          <div className="text-sm font-semibold">New {a.rel.label.toLowerCase()}</div>
          {a.q?.blocked ? <div className="text-sm text-red-700">{a.q.blocked}</div> : <>
            <input placeholder="Name" value={a.name} onChange={e => a.setName(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
            <GenderPick a={a} />
            {a.q && <label className="block text-xs text-stone-600">{a.q.question}
              <select value={a.choice} onChange={e => a.setChoice(e.target.value)} className="mt-1 w-full rounded-md border bg-white px-2 py-1 text-sm">
                {a.q.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>}</>}
          {a.err && <div className="text-sm text-red-700">{a.err}</div>}
          <div className="flex justify-between"><button className={btn} onClick={a.reset}>Cancel</button><button className={primary} disabled={!a.ok} onClick={a.submit}>Save</button></div>
        </div>
      )}
    </aside>
  )
}

// ── C: wizard dialog: relation → clarifying question in plain words → details → summary of what will be created ──
export function VariantC({ state, selected, commit }) {
  const a = useAdd(state, selected, commit), [step, setStep] = useState(0)
  const [open, setOpen] = useState(true)
  if (!selected) return null
  const close = () => { a.reset(); setStep(0) }
  const next = () => setStep(s => (s === 1 && !a.q ? 2 : s + 1))
  const preview = a.rel && a.name && !a.q?.blocked ? (() => { try { return apply(state, selected, a.rel.key, { name: a.name, gender: a.gender }, a.choice).created } catch { return [] } })() : []
  if (!open) return <button className="fixed left-4 top-4 rounded bg-sky-600 px-3 py-1 text-white" onClick={() => setOpen(true)}>Add relative…</button>
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30">
      <div className="w-[26rem] rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex justify-between"><h2 className="font-semibold">Add a relative of {nameOf(state, selected)}</h2><button onClick={() => { close(); setOpen(false) }}>✕</button></div>
        {step === 0 && <div className="grid grid-cols-2 gap-2">{RELATIONS.map(r => <button key={r.key} className={`${btn} py-3`} onClick={() => { a.pick(r); setStep(clarify(state, selected, r.key) ? 1 : 2) }}>{r.label}</button>)}</div>}
        {step === 1 && a.q && <div className="space-y-2">
          {a.q.blocked ? <div className="text-red-700">{a.q.blocked}</div> : <><div>{a.q.question}</div>
            {a.q.options.map(o => <label key={o.value} className="block"><input type="radio" checked={a.choice === o.value} onChange={() => a.setChoice(o.value)} /> {o.label}</label>)}</>}
          <div className="flex justify-between pt-2"><button className={btn} onClick={() => setStep(0)}>Back</button>{!a.q.blocked && <button className={primary} onClick={next}>Next</button>}</div></div>}
        {step === 2 && <div className="space-y-2">
          <div>New {a.rel.label.toLowerCase()}</div>
          <input autoFocus placeholder="Name" value={a.name} onChange={e => a.setName(e.target.value)} className="w-full rounded-md border px-2 py-1" />
          <GenderPick a={a} />
          {preview.length > 0 && <pre className="rounded bg-stone-100 p-2 text-xs">This will create:{'\n'}{preview.join('\n')}</pre>}
          {a.err && <div className="text-red-700">{a.err}</div>}
          <div className="flex justify-between pt-2"><button className={btn} onClick={() => setStep(a.q ? 1 : 0)}>Back</button>
            <button className={primary} disabled={!a.ok} onClick={() => { a.submit(); setStep(0) }}>Create</button></div></div>}
      </div>
    </div>
  )
}
export const names = { A: 'Popover on the card', B: 'Side panel with groups', C: 'Wizard dialog' }
