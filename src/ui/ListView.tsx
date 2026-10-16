import { useMemo, useState } from 'react'
import { deriveRelationships } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { searchPersons } from '../domain/search.ts'
import { useTreeStore } from '../domain/store.ts'
import { displayName, lifeSpan } from '../view/text.ts'
import { useUiStore } from './uiStore.ts'

interface Model {
  /** Child id -> the parent they are listed under. */
  home: Map<string, string>
  roots: Person[]
  /** Children listed under a parent: those for whom this is the first parent. */
  kids: Map<string, Person[]>
  /** Children who have this parent too but are listed under their first parent; shown as a pointer. */
  refs: Map<string, { person: Person; home: Person }[]>
  labels: Map<string, string | null>
  partners: Map<string, string>
  focusPersonId: string | null
}

function useModel(): Model {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)

  return useMemo(() => {
    const byId = new Map(persons.map((p) => [p.id, p]))
    const blood = parentLinks.filter((l) => l.kind !== 'step')
    // A Person with two parents appears once in full, under their first parent (so the list stays finite).
    const home = new Map<string, string>()
    for (const link of blood) if (!home.has(link.childId)) home.set(link.childId, link.parentId)

    const kids = new Map<string, Person[]>()
    const refs = new Map<string, { person: Person; home: Person }[]>()
    const push = <T,>(map: Map<string, T[]>, key: string, value: T) => map.set(key, [...(map.get(key) ?? []), value])
    for (const link of blood) {
      const child = byId.get(link.childId)
      const homeParent = byId.get(home.get(link.childId)!)
      if (!child || !homeParent) continue
      if (home.get(link.childId) === link.parentId) push(kids, link.parentId, child)
      else push(refs, link.parentId, { person: child, home: homeParent })
    }

    const partnerNames = new Map<string, string[]>()
    for (const partnership of partnerships) {
      const [a, b] = partnership.personIds.map((id) => byId.get(id))
      if (!a || !b) continue
      const note = (other: Person) => (partnership.status === 'ended' ? `${other.firstName} (former)` : other.firstName)
      push(partnerNames, a.id, note(b))
      push(partnerNames, b.id, note(a))
    }

    const labels = new Map(
      [...deriveRelationships({ focusPersonId, persons, parentLinks, partnerships })].map(([id, r]) => [id, r.label]),
    )
    return {
      home,
      roots: persons.filter((p) => !home.has(p.id)),
      kids,
      refs,
      labels,
      partners: new Map([...partnerNames].map(([id, names]) => [id, names.join(', ')])),
      focusPersonId,
    }
  }, [persons, parentLinks, partnerships, focusPersonId])
}

const buttonClass = 'min-h-11 rounded px-2 text-left hover:bg-stone-100'

function Item({ person, depth, model }: { person: Person; depth: number; model: Model }) {
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  // The first two generations start open; deeper ones are collapsed so a big Tree stays manageable.
  const [open, setOpen] = useState(depth < 2)
  // Whoever is open in the panel must be visible in the list: their ancestors open up for them.
  const holdsSelected = useMemo(() => {
    for (let at = selectedId; at; at = model.home.get(at) ?? null) {
      if (model.home.get(at) === person.id) return true
    }
    return false
  }, [selectedId, model, person.id])
  // Done once per newly opened Person, so a branch can still be collapsed by hand afterwards.
  const [openedFor, setOpenedFor] = useState<string | null>(null)
  if (holdsSelected && openedFor !== selectedId) {
    setOpenedFor(selectedId)
    setOpen(true)
  }
  const kids = model.kids.get(person.id) ?? []
  const refs = model.refs.get(person.id) ?? []
  const expandable = kids.length > 0 || refs.length > 0
  const relationship = person.id === model.focusPersonId ? 'Focus person' : model.labels.get(person.id)
  const partners = model.partners.get(person.id)
  const name = displayName(person)

  return (
    <li>
      <div className="flex items-center">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? 'Collapse' : 'Expand'} ${person.firstName}'s family`}
            onClick={() => setOpen(!open)}
            className="grid size-11 shrink-0 place-items-center rounded hover:bg-stone-100"
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
          </button>
        ) : (
          <span aria-hidden="true" className="size-11 shrink-0" />
        )}
        <button
          type="button"
          aria-current={selectedId === person.id ? 'true' : undefined}
          onClick={() => select(person.id)}
          className={`${buttonClass} flex-1 ${selectedId === person.id ? 'bg-stone-200 font-semibold' : ''}`}
        >
          {[name, relationship, lifeSpan(person)].filter(Boolean).join(' · ')}
          {partners && <span className="block text-sm text-stone-700">with {partners}</span>}
        </button>
      </div>
      {open && expandable && (
        <ul className="ml-5 border-l border-stone-300 pl-2">
          {kids.map((kid) => (
            <Item key={kid.id} person={kid} depth={depth + 1} model={model} />
          ))}
          {refs.map(({ person: other, home }) => (
            <li key={other.id} className="pl-11">
              <button type="button" onClick={() => select(other.id)} className={buttonClass}>
                {displayName(other)} · also a child here, listed under {home.firstName}
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * The Tree as a nested, collapsible list (spec section 7): the same Persons, the same Relationship labels and the
 * same detail panel with its add/edit actions as the drawing, for anyone who finds a list easier than a graph.
 */
export function ListView() {
  const model = useModel()
  const persons = useTreeStore((s) => s.persons)
  const query = useUiStore((s) => s.query)
  const select = useUiStore((s) => s.select)
  const selectedId = useUiStore((s) => s.selectedId)
  // With something typed in the search box the list shows only the matches, flat, best first.
  const matches = useMemo(() => searchPersons(persons, query), [persons, query])
  const filtering = query.trim() !== ''
  // a bottom sheet covers the end of the list: leave room to scroll it clear
  const sheetHeight = useUiStore((s) => s.sheetHeight)
  return (
    <section aria-labelledby="list-title" style={{ paddingBottom: sheetHeight + 16 }} className="h-full overflow-auto bg-white p-4">
      <h2 id="list-title" className="sr-only">
        Family list
      </h2>
      {filtering ? (
        matches.length > 0 ? (
          <ul>
            {matches.map((person) => {
              const relationship = person.id === model.focusPersonId ? 'Focus person' : model.labels.get(person.id)
              const partners = model.partners.get(person.id)
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    aria-current={selectedId === person.id ? 'true' : undefined}
                    onClick={() => select(person.id)}
                    className={`${buttonClass} w-full ${selectedId === person.id ? 'bg-stone-200 font-semibold' : ''}`}
                  >
                    {[displayName(person), relationship, lifeSpan(person)].filter(Boolean).join(' · ')}
                    {partners && <span className="block text-sm text-stone-700">with {partners}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-2 text-stone-700">No one matches “{query.trim()}”.</p>
        )
      ) : (
        <ul>
          {model.roots.map((person) => (
            <Item key={person.id} person={person} depth={0} model={model} />
          ))}
        </ul>
      )}
    </section>
  )
}
