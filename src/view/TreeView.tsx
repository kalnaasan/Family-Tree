import { useEffect, useMemo } from 'react'
import { PERF_BUDGET } from '../config/perf-budget.ts'
import { deriveRelationships } from '../domain/labels.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatNumber } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { photoCache, usePhotoVersion } from '../photos/photos.ts'
import { useUiStore } from '../ui/uiStore.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { useTreeLayout } from './useTreeLayout.ts'

const NOTICE_KEY = 'family-tree.limit-notice'

/** Says once, in this browser, that a Tree this big is drawn with less detail. */
function announceLimitOnce(): void {
  try {
    if (localStorage.getItem(NOTICE_KEY)) return
    localStorage.setItem(NOTICE_KEY, '1')
  } catch {
    // storage is unavailable: the notice may show again next time, which is better than never
  }
  useUiStore
    .getState()
    .showToast(
      `This tree has ${formatNumber(PERF_BUDGET.hardLimit, useLanguageStore.getState().language)} people or more, the most the app is made for. It is drawn with less detail, and may be slow.`,
    )
}

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
  const photoVersion = usePhotoVersion()
  const laidOut = useTreeLayout(persons, parentLinks, partnerships)
  const atLimit = persons.length >= PERF_BUDGET.hardLimit
  useEffect(() => {
    if (atLimit) announceLimitOnce()
  }, [atLimit])
  const links = useMemo(() => ({ parentLinks, partnerships }), [parentLinks, partnerships])
  const labels = useMemo(
    () =>
      new Map(
        [...deriveRelationships({ focusPersonId, persons, parentLinks, partnerships })].map(([id, r]) => [id, r.label]),
      ),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  // a big Tree is laid out in a Worker: until the first layout is back there is nothing to draw yet
  if (!laidOut) return <p aria-live="polite" className="p-4 text-stone-700">Laying out your tree…</p>
  return (
    <TreeCanvas
      layout={laidOut.layout}
      persons={laidOut.persons}
      reducedDetail={atLimit}
      focusPersonId={focusPersonId}
      links={links}
      labels={labels}
      onSetFocusPerson={(id) => {
        if (!useTreeStore.getState().readOnly) useTreeStore.getState().setFocusPerson(id)
      }}
      selectedPersonId={selectedId}
      // tapping the tree always brings the sheet back to its short peek
      onSelectPerson={(id) => {
        select(id)
        useUiStore.getState().setSheet('peek')
      }}
      revealRequest={revealRequest}
      photoUrlFor={photoCache.urlFor}
      photoVersion={photoVersion}
      coveredBottom={sheetHeight}
      hideControls={sheetHeight > 0 && sheet === 'expanded'}
    />
  )
}
