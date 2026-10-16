import { useTreeStore } from '../domain/store.ts'
import { useUiStore } from './uiStore.ts'

/**
 * TEMPORARY keyboard way in to a Person, until the tree's own arrow-key navigation and the List view arrive.
 * Hidden until it receives focus, then shown over the tree.
 */
export function PeopleList() {
  const persons = useTreeStore((s) => s.persons)
  const select = useUiStore((s) => s.select)
  return (
    <ul
      aria-label="People"
      className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:top-2 focus-within:left-2 focus-within:z-20 focus-within:max-h-[60%] focus-within:overflow-y-auto focus-within:rounded focus-within:border focus-within:border-stone-500 focus-within:bg-white focus-within:p-2 focus-within:shadow"
    >
      {persons.map((p) => (
        <li key={p.id}>
          <button type="button" onClick={() => select(p.id)} className="min-h-11 w-full px-3 text-left">
            {p.firstName}
          </button>
        </li>
      ))}
    </ul>
  )
}
