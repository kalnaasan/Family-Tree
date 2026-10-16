import { useTreeStore } from '../domain/store.ts'
import { useUiStore } from '../ui/uiStore.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { useTreeLayout } from './useTreeLayout.ts'

/** The Tree from the store, laid out and drawn. Clicking a Person opens them. */
export function TreeView() {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  const layout = useTreeLayout(persons, parentLinks, partnerships)
  return (
    <TreeCanvas
      layout={layout}
      persons={persons}
      focusPersonId={focusPersonId}
      selectedPersonId={selectedId}
      onSelectPerson={select}
    />
  )
}
