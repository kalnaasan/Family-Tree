// PROTOTYPE: shared person detail body (chips to jump to relatives + big add-relative buttons). Add actions are stubs.
import { RELATIONS, relatives } from './store.js'
export function PersonPanel({ s, L, id, focusId, onGoto, onAdd, onFocus, addRef }) {
  const p = s.persons.find(x => x.id === id), r = relatives(s, id), nm = i => s.persons.find(x => x.id === i).name
  const byX = (a, b) => L.byId[a.id].x - L.byId[b.id].x
  const Row = ({ title, items }) => items.length ? (
    <div className="mb-3"><div className="mb-1 text-xs uppercase tracking-wide text-stone-500">{title}</div>
      <div className="flex flex-wrap gap-2">{[...items].sort(byX).map(i => (
        <button key={i.id} onClick={() => onGoto(i.id)} className="min-h-11 rounded-full border border-stone-300 bg-white px-4 text-sm active:bg-stone-100">{nm(i.id)}{i.ended ? ' (ex)' : ''}</button>))}</div></div>) : null
  const ids = a => a.map(id => ({ id }))
  return (
    <div className="px-4 pb-6">
      <div className="mb-3 flex items-center justify-between"><div className="text-xl font-semibold">{p.name} <span className="text-sm font-normal text-stone-500">{p.gender}</span></div>
        <button onClick={() => onFocus(id)} className="min-h-11 rounded-full bg-amber-100 px-4 text-sm">{focusId === id ? '★ Focus person' : 'Set as Focus person'}</button></div>
      {Row({ title: "Parents", items: ids(r.parents) })}{Row({ title: "Partners", items: r.partners })}
      {Row({ title: "Children", items: ids(r.children) })}{Row({ title: "Siblings", items: ids(r.sibs) })}
      <div ref={addRef} className="mb-1 mt-4 text-xs uppercase tracking-wide text-stone-500">Add a relative of {p.name}</div>
      <div className="grid grid-cols-2 gap-2">{RELATIONS.map(x => (
        <button key={x} onClick={() => onAdd(x, p.name)} className="min-h-12 rounded-xl bg-emerald-700 px-3 text-sm font-medium text-white active:bg-emerald-800">＋ {x}</button>))}</div>
    </div>
  )
}
