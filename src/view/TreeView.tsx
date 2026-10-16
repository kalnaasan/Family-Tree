import { useMemo } from 'react'
import { deriveRelationships } from '../domain/labels.ts'
import { useTreeStore } from '../domain/store.ts'
import { useUiStore } from '../ui/uiStore.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { useTreeLayout } from './useTreeLayout.ts'

/** The Tree from the store, laid out and drawn. Clicking a Person opens them; the keyboard follows family links. */
export function TreeView() {
  const persons = useTreeStore((s) => s.persons)
  const parentLinks = useTreeStore((s) => s.parentLinks)
  const partnerships = useTreeStore((s) => s.partnerships)
  const focusPersonId = useTreeStore((s) => s.focusPersonId)
  const selectedId = useUiStore((s) => s.selectedId)
  const select = useUiStore((s) => s.select)
  const sheet = useUiStore((s) => s.sheet)
  const sheetHeight = useUiStore((s) => s.sheetHeight)
  const revealRequest = useUiStore((s) => s.revealRequest)
  const layout = useTreeLayout(persons, parentLinks, partnerships)
  const links = useMemo(() => ({ parentLinks, partnerships }), [parentLinks, partnerships])
  const labels = useMemo(
    () =>
      new Map(
        [...deriveRelationships({ focusPersonId, persons, parentLinks, partnerships })].map(([id, r]) => [id, r.label]),
      ),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  return (
    <TreeCanvas
      layout={layout}
      persons={persons}
      focusPersonId={focusPersonId}
      links={links}
      labels={labels}
      onSetFocusPerson={(id) => useTreeStore.getState().setFocusPerson(id)}
      selectedPersonId={selectedId}
      // tapping the tree always brings the sheet back to its short peek
      onSelectPerson={(id) => {
        select(id)
        useUiStore.getState().setSheet('peek')
      }}
      revealRequest={revealRequest}
      coveredBottom={sheetHeight}
      hideControls={sheetHeight > 0 && sheet === 'expanded'}
    />
  )
}
