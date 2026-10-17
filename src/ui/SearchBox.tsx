import { type KeyboardEvent, useId, useMemo, useState } from 'react'
import { deriveRelationships } from '../domain/labels.ts'
import { searchPersons } from '../domain/search.ts'
import { useTreeStore } from '../domain/store.ts'
import { useT } from '../i18n/useT.ts'
import { displayName, lifeSpan } from '../view/text.ts'
import { useUiStore } from './uiStore.ts'
import { useLabeler } from './useLabeler.ts'

/** The results list shows this many; "keep typing" covers the rest. */
export const MAX_RESULTS = 8

/**
 * Search over first and last name (spec section 11). With the tree showing it is a combobox: type, arrow to a result,
 * Enter (or tap) selects that Person and pans the tree to them at the same zoom. In the List view the same box filters
 * the list instead (see `ListView`), so there is no pop-up there.
 */
export function SearchBox() {
  const t = useT()
  const listId = useId()
  const query = useUiStore((s) => s.query)
  const setQuery = useUiStore((s) => s.setQuery)
  const reveal = useUiStore((s) => s.reveal)
  const listView = useUiStore((s) => s.listView)
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const [dismissed, setDismissed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const results = useMemo(() => searchPersons(persons, query), [persons, query])
  const shown = results.slice(0, MAX_RESULTS)
  const relationships = useMemo(
    () => (query.trim() ? deriveRelationships({ focusPersonId, persons, parentLinks, partnerships }) : null),
    [query, focusPersonId, persons, parentLinks, partnerships],
  )
  const labelOf = useLabeler(relationships)

  const popup = !listView && query.trim() !== '' && !dismissed
  const active = Math.min(activeIndex, Math.max(0, shown.length - 1))
  const optionId = (n: number) => `${listId}-option-${n}`

  const pick = (id: string) => {
    reveal(id)
    setQuery('')
    setActiveIndex(0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      // first Escape closes the results, the next clears the text
      if (popup) setDismissed(true)
      else setQuery('')
      event.preventDefault()
    } else if (!popup || listView) {
      if (event.key === 'ArrowDown' && query.trim() && !listView) {
        setDismissed(false)
        event.preventDefault()
      }
    } else if (event.key === 'ArrowDown' && shown.length > 0) {
      setActiveIndex((active + 1) % shown.length)
      event.preventDefault()
    } else if (event.key === 'ArrowUp' && shown.length > 0) {
      setActiveIndex((active - 1 + shown.length) % shown.length)
      event.preventDefault()
    } else if (event.key === 'Enter' && shown[active]) {
      pick(shown[active]!.id)
      event.preventDefault()
    }
  }

  const summary = !query.trim()
    ? ''
    : results.length === 0
      ? t('search.none')
      : listView
        ? t('search.showing', { count: results.length })
        : t('search.results', { count: results.length })

  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <input
        type="text"
        role={listView ? 'searchbox' : 'combobox'}
        aria-label={t('search.label')}
        placeholder={t('search.label')}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setDismissed(false)
          setActiveIndex(0)
        }}
        onKeyDown={onKeyDown}
        onBlur={() => setDismissed(true)}
        onFocus={() => setDismissed(false)}
        {...(listView
          ? {}
          : {
              'aria-expanded': popup,
              'aria-controls': listId,
              'aria-autocomplete': 'list' as const,
              'aria-activedescendant': popup && shown.length > 0 ? optionId(active) : undefined,
            })}
        className="min-h-11 w-full rounded-lg border border-line-strong bg-white px-3 placeholder:text-ink-soft"
      />
      <div aria-live="polite" className="sr-only">
        {summary}
      </div>
      {!listView && (
        <div
          hidden={!popup}
          // keep the box focused while a result is pressed
          onMouseDown={(event) => event.preventDefault()}
          className="absolute top-full left-0 z-40 mt-1 max-h-[60dvh] w-80 max-w-[calc(100vw-2rem)] overflow-y-auto rounded border border-line-strong bg-white shadow-lg"
        >
          <ul id={listId} role="listbox" aria-label={t('search.resultsLabel')}>
            {shown.map((person, n) => {
              const label = person.id === focusPersonId ? t('person.focus') : labelOf(person)
              const text = [displayName(person), label, lifeSpan(person)].filter(Boolean).join(' · ')
              return (
                <li
                  key={person.id}
                  id={optionId(n)}
                  role="option"
                  aria-selected={n === active}
                  onClick={() => pick(person.id)}
                  className={`flex min-h-11 cursor-pointer items-center px-3 ${n === active ? 'bg-stone-200 font-semibold' : ''}`}
                >
                  {text}
                </li>
              )
            })}
          </ul>
          {results.length === 0 && <p className="flex min-h-11 items-center px-3 text-stone-700">{t('search.none')}</p>}
          {results.length > shown.length && (
            <p className="flex min-h-11 items-center px-3 text-sm text-stone-700">
              {t('search.more', { count: results.length - shown.length })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
