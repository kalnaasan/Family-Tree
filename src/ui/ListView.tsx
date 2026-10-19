import { useCallback, useEffect, useMemo, useState } from 'react'
import { type Relationship, deriveRelationships } from '../domain/labels.ts'
import type { Person } from '../domain/schema.ts'
import { searchPersons } from '../domain/search.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatList } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { useT } from '../i18n/useT.ts'
import { displayName, lifeSpan } from '../view/text.ts'
import { ChevronIcon, LinkIcon } from './icons.tsx'
import { PersonAvatar } from './kit/PersonAvatar.tsx'
import { PersonLine } from './PersonLine.tsx'
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

/** Nesting is drawn only this many levels deep; below it the list stays at one indent so a long line of descent keeps its width. */
const MAX_INDENT = 4

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
  /** Whether a branch is open: what the user chose, else open for the first two generations. */
  isOpen: (personId: string, depth: number) => boolean
  toggle: (personId: string, open: boolean) => void
}

/** The second line of an entry: partners, and how many children there are. */
function Details({ partners, childCount }: { partners: string | null; childCount: number }) {
  const t = useT()
  const parts = [partners, childCount > 0 ? t('list.children', { count: childCount }) : null].filter(Boolean)
  return parts.length > 0 ? <span className="block text-sm text-ink-soft">{parts.join(' · ')}</span> : null
}

function Item({ person, depth, model, words }: { person: Person; depth: number; model: Model; words: Words }) {
  const t = useT()
  const { labelOf, partnersLine, isOpen, toggle } = words
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  const kids = model.kids.get(person.id) ?? []
  const refs = model.refs.get(person.id) ?? []
  const expandable = kids.length > 0 || refs.length > 0
  const open = isOpen(person.id, depth)
  const relationship = person.id === model.focusPersonId ? t('person.focus') : labelOf(person)
  const name = displayName(person)

  return (
    <li>
      <div className="flex items-center">
        {expandable ? (
          <button
            type="button"
            aria-expanded={open}
            aria-label={t(open ? 'list.collapse' : 'list.expand', { name: person.firstName })}
            onClick={() => toggle(person.id, !open)}
            className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface-soft"
          >
            <ChevronIcon open={open} />
          </button>
        ) : (
          <span aria-hidden="true" className="size-11 shrink-0" />
        )}
        <button
          type="button"
          aria-current={selectedId === person.id ? 'true' : undefined}
          onClick={() => select(person.id)}
          className="person-row flex-1"
        >
          <PersonAvatar person={person} />
          <span className="min-w-0">
            <span className="block">
              <PersonLine name={name} rest={[relationship, lifeSpan(person, t)]} />
            </span>
            <Details partners={partnersLine(person.id)} childCount={kids.length + refs.length} />
          </span>
        </button>
      </div>
      {open && expandable && (
        <ul className={`border-s border-line ps-2 ${depth < MAX_INDENT ? 'ms-5' : ''}`}>
          {kids.map((kid) => (
            <Item key={kid.id} person={kid} depth={depth + 1} model={model} words={words} />
          ))}
          {refs.map(({ person: other, home }) => (
            <li key={other.id}>
              {/* the Person is listed in full under their first parent: this is a pointer to them, not a second copy */}
              <button type="button" onClick={() => select(other.id)} className="person-row ps-11 text-ink-soft">
                <span aria-hidden="true" className="shrink-0 text-bark">
                  <LinkIcon />
                </span>
                <PersonLine name={displayName(other)} rest={[t('list.alsoUnder', { home: home.firstName })]} />
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
  const persons = useTreeStore((s) => s.persons)
  const query = useUiStore((s) => s.query)
  const select = useUiStore((s) => s.select)
  const selectedId = useUiStore((s) => s.selectedId)

  // What the user opened or closed by hand, over "the first two generations are open"; Expand all and Collapse all
  // set the base for everyone and clear what was chosen one by one.
  const [base, setBase] = useState<'default' | 'open' | 'closed'>('default')
  const [chosen, setChosen] = useState<ReadonlyMap<string, boolean>>(new Map())
  const isOpen = useCallback(
    (personId: string, depth: number) => chosen.get(personId) ?? (base === 'open' ? true : base === 'closed' ? false : depth < 2),
    [chosen, base],
  )
  const toggle = useCallback((personId: string, open: boolean) => setChosen((prev) => new Map(prev).set(personId, open)), [])
  const setAll = (value: 'open' | 'closed') => {
    setBase(value)
    setChosen(new Map())
  }

  // Whoever is open in the panel must be visible in the list: their ancestors open up for them, once per newly opened
  // Person, so a branch can still be collapsed by hand afterwards.
  useEffect(() => {
    if (!selectedId) return
    const ancestors: string[] = []
    for (let at = model.home.get(selectedId); at; at = model.home.get(at)) ancestors.push(at)
    if (ancestors.length === 0) return
    setChosen((prev) => {
      const next = new Map(prev)
      for (const ancestor of ancestors) next.set(ancestor, true)
      return next
    })
    // only a newly opened Person opens the way: the Tree changing under an open Person must not undo a collapse
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const words: Words = { labelOf, partnersLine, isOpen, toggle }
  // With something typed in the search box the list shows only the matches, flat, best first.
  const matches = useMemo(() => searchPersons(persons, query), [persons, query])
  const filtering = query.trim() !== ''
  // a bottom sheet covers the end of the list: leave room to scroll it clear
  const sheetHeight = useUiStore((s) => s.sheetHeight)
  return (
    <section aria-labelledby="list-title" style={{ paddingBottom: sheetHeight + 16 }} className="h-full overflow-auto bg-surface">
      <h2 id="list-title" className="sr-only">
        {t('list.title')}
      </h2>
      {!filtering && (
        <div className="sticky top-0 z-10 flex gap-1 border-b border-line bg-surface px-3 py-1">
          <button type="button" onClick={() => setAll('open')} className="btn-ghost">
            {t('list.expandAll')}
          </button>
          <button type="button" onClick={() => setAll('closed')} className="btn-ghost">
            {t('list.collapseAll')}
          </button>
        </div>
      )}
      <div className="mx-auto max-w-3xl p-3">
        {filtering ? (
          matches.length > 0 ? (
            <ul>
              {matches.map((person) => {
                const relationship = person.id === model.focusPersonId ? t('person.focus') : labelOf(person)
                return (
                  <li key={person.id}>
                    <button
                      type="button"
                      aria-current={selectedId === person.id ? 'true' : undefined}
                      onClick={() => select(person.id)}
                      className="person-row"
                    >
                      <PersonAvatar person={person} />
                      <span className="min-w-0">
                        <span className="block">
                          <PersonLine name={displayName(person)} rest={[relationship, lifeSpan(person, t)]} />
                        </span>
                        <Details partners={partnersLine(person.id)} childCount={(model.kids.get(person.id)?.length ?? 0) + (model.refs.get(person.id)?.length ?? 0)} />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="px-2 text-ink-soft">{t('list.noMatch', { query: query.trim() })}</p>
          )
        ) : (
          <ul>
            {model.roots.map((person) => (
              <Item key={person.id} person={person} depth={0} model={model} words={words} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
