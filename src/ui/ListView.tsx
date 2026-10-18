import { useCallback, useMemo, useState } from 'react'
import { type Relationship, deriveRelationships } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { searchPersons } from '../domain/search.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatList } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { useT } from '../i18n/useT.ts'
import { displayName, lifeSpan } from '../view/text.ts'
import { useUiStore } from './uiStore.ts'
import { useLabeler } from './useLabeler.ts'

interface Model {
  /** Child id -> the parent they are listed under. */
  home: Map<string, string>
  roots: Person[]
  /** Children listed under a parent: those for whom this is the first parent. */
  kids: Map<string, Person[]>
  /** Children who have this parent too but are listed under their first parent; shown as a pointer. */
  refs: Map<string, { person: Person; home: Person }[]>
  /** Each Person's descriptor; the words are made when they are drawn, in the language in use. */
  relationships: Map<string, Relationship>
  /** Each Person's partners, worded when drawn. */
  partners: Map<string, { name: string; former: boolean }[]>
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

    const partners = new Map<string, { name: string; former: boolean }[]>()
    for (const partnership of partnerships) {
      const [a, b] = partnership.personIds.map((id) => byId.get(id))
      if (!a || !b) continue
      const former = partnership.status === 'ended'
      push(partners, a.id, { name: b.firstName, former })
      push(partners, b.id, { name: a.firstName, former })
    }

    const relationships = deriveRelationships({ focusPersonId, persons, parentLinks, partnerships })
    return {
      home,
      roots: persons.filter((p) => !home.has(p.id)),
      kids,
      refs,
      relationships,
      partners,
      focusPersonId,
    }
  }, [persons, parentLinks, partnerships, focusPersonId])
}

const buttonClass = 'min-h-11 rounded px-2 text-start hover:bg-stone-100'

/** "with Ana, Ben (former)": the partners of a Person, or nothing. */
function usePartnersLine(model: Model): (personId: string) => string | null {
  const t = useT()
  const language = useLanguageStore((s) => s.language)
  return useCallback(
    (personId) => {
      const partners = model.partners.get(personId)
      if (!partners) return null
      const names = partners.map((p) => (p.former ? t('list.former', { name: p.name }) : p.name))
      return t('list.with', { names: formatList(names, language) })
    },
    [model, t, language],
  )
}

interface Words {
  /** "Focus person" words are the caller's; this is the Relationship label, or null. */
  labelOf: ReturnType<typeof useLabeler>
  partnersLine: ReturnType<typeof usePartnersLine>
}

function Item({ person, depth, model, words }: { person: Person; depth: number; model: Model; words: Words }) {
  const t = useT()
  const { labelOf, partnersLine } = words
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
  const relationship = person.id === model.focusPersonId ? t('person.focus') : labelOf(person)
  const partners = partnersLine(person.id)
  const name = displayName(person)

  return (
    <li>
      <div className="flex items-center">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(open ? 'list.collapse' : 'list.expand', { name: person.firstName })}
            onClick={() => setOpen(!open)}
            className="grid size-11 shrink-0 place-items-center rounded hover:bg-stone-100"
          >
            {/* the "closed" triangle points the way the page reads, so it is flipped when that is right to left */}
            <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
              {open ? '▾' : '▸'}
            </span>
          </button>
        ) : (
          <span aria-hidden="true" className="size-11 shrink-0" />
        )}
        <button
          type="button"
          dir="auto"
          aria-current={selectedId === person.id ? 'true' : undefined}
          onClick={() => select(person.id)}
          className={`${buttonClass} flex-1 ${selectedId === person.id ? 'bg-stone-200 font-semibold' : ''}`}
        >
          {[name, relationship, lifeSpan(person, t)].filter(Boolean).join(' · ')}
          {partners && <span className="block text-sm text-stone-700">{partners}</span>}
        </button>
      </div>
      {open && expandable && (
        <ul className="ms-5 border-s border-stone-300 ps-2">
          {kids.map((kid) => (
            <Item key={kid.id} person={kid} depth={depth + 1} model={model} words={words} />
          ))}
          {refs.map(({ person: other, home }) => (
            <li key={other.id} className="ps-11">
              <button type="button" onClick={() => select(other.id)} className={buttonClass}>
                {t('list.alsoChild', { name: displayName(other), home: home.firstName })}
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
  const t = useT()
  const model = useModel()
  // made once for the whole list, not once per row: a row would add its own subscription to the language
  const partnersLine = usePartnersLine(model)
  const labelOf = useLabeler(model.relationships)
  const words: Words = { labelOf, partnersLine }
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
        {t('list.title')}
      </h2>
      {filtering ? (
        matches.length > 0 ? (
          <ul>
            {matches.map((person) => {
              const relationship = person.id === model.focusPersonId ? t('person.focus') : labelOf(person)
              const partners = partnersLine(person.id)
              return (
                <li key={person.id}>
                  <button
                    type="button"
                    dir="auto"
          aria-current={selectedId === person.id ? 'true' : undefined}
                    onClick={() => select(person.id)}
                    className={`${buttonClass} w-full ${selectedId === person.id ? 'bg-stone-200 font-semibold' : ''}`}
                  >
                    {[displayName(person), relationship, lifeSpan(person, t)].filter(Boolean).join(' · ')}
                    {partners && <span className="block text-sm text-stone-700">{partners}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="px-2 text-stone-700">{t('list.noMatch', { query: query.trim() })}</p>
        )
      ) : (
        <ul>
          {model.roots.map((person) => (
            <Item key={person.id} person={person} depth={0} model={model} words={words} />
          ))}
        </ul>
      )}
    </section>
  )
}
