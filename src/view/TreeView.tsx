import { useTreeStore } from '../domain/store.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { useTreeLayout } from './useTreeLayout.ts'

/** The Tree from the store, laid out and drawn. */
export function TreeView() {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const layout = useTreeLayout(persons, parentLinks, partnerships)
  return <TreeCanvas layout={layout} persons={persons} focusPersonId={focusPersonId} />
}
