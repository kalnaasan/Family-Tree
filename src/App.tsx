import { type FormEvent, useState } from 'react'
import { SaveIndicator } from './components/SaveIndicator.tsx'
import { useTreeStore } from './domain/store.ts'
import { usePersistenceStatus } from './persistence/saveStatus.ts'
import { usePersistence } from './persistence/usePersistence.ts'

export function App() {
  usePersistence()
  const load = usePersistenceStatus((s) => s.load)
  const loadMessage = usePersistenceStatus((s) => s.loadMessage)
  const persons = useTreeStore((s) => s.persons)
  const addPerson = useTreeStore((s) => s.addPerson)
  const [firstName, setFirstName] = useState('')

  // TEMPORARY: a bare add-person form so persistence can be exercised end to end.
  // The first-person and add-relative flow ticket replaces it.
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (!firstName.trim()) return
    addPerson({ firstName })
    setFirstName('')
  }

  return (
    <main className="mx-auto max-w-xl p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Family Tree</h1>
        <SaveIndicator />
      </header>

      {load === 'invalid' && (
        <p role="alert" className="mt-4 rounded border border-red-800 p-3 text-red-800">
          Your saved tree could not be read ({loadMessage}). It has not been changed, and nothing will be saved
          until this is resolved.
        </p>
      )}
      {load === 'unavailable' && (
        <p role="alert" className="mt-4 rounded border border-red-800 p-3 text-red-800">
          Saving is not available in this browser ({loadMessage}). Changes will be lost when you leave; export a
          backup to keep them.
        </p>
      )}

      {load !== 'loading' && load !== 'invalid' && (
        <>
          <form onSubmit={onSubmit} className="mt-6 flex gap-2">
            <label className="flex flex-1 flex-col text-sm">
              First name
              <input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 min-h-11 rounded border border-stone-500 px-2"
              />
            </label>
            <button type="submit" className="mt-6 min-h-11 rounded bg-green-800 px-4 text-white">
              Add person
            </button>
          </form>
          <ul className="mt-4 list-disc pl-6" aria-label="People">
            {persons.map((p) => (
              <li key={p.id}>{p.firstName}</li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
