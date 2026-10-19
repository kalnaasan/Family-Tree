import { useEffect, useMemo } from 'react'
import { PERF_BUDGET } from '../config/perf-budget.ts'
import { allGroupKeys, branchGroups, branchSize, hiddenBy, revealPersons } from '../domain/collapse.ts'
import { deriveRelationships } from '../domain/labels.ts'
import { useTreeStore } from '../domain/store.ts'
import { formatNumber } from '../i18n/format.ts'
import { useLanguageStore } from '../i18n/language.ts'
import { msg } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { photoCache, usePhotoVersion } from '../photos/photos.ts'
import { useUiStore } from '../ui/uiStore.ts'
import type { GroupInfo } from './chartScene.ts'
import { TreeCanvas } from './TreeCanvas.tsx'
import { useTreeShape } from './treeShape.ts'
import { useTreeLayout } from './useTreeLayout.ts'

const NOTICE_KEY = 'family-tree.limit-notice'
const NOBODY: ReadonlySet<string> = new Set()

/** Says once, in this browser, that a Tree this big is drawn with less detail. */
function announceLimitOnce(): void {
  try {
    if (localStorage.getItem(NOTICE_KEY)) return
    localStorage.setItem(NOTICE_KEY, '1')
  } catch {
    // storage is unavailable: the notice may show again next time, which is better than never
  }
  // the sentence is worded when the toast is drawn, so it follows a language switch; the number is Western digits either way
  useUiStore
    .getState()
    .showToast(msg('tree.limit', { count: formatNumber(PERF_BUDGET.hardLimit, useLanguageStore.getState().language) }))
}

/** The Tree from the store, laid out and drawn. Clicking a Person opens them; the keyboard follows family links. */
export function TreeView() {
  const t = useT()
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
  const shape = useTreeShape((s) => s.shape)
  const rows = shape === 'rows'
  const collapsed = useUiStore((s) => s.collapsed)
  const setCollapsed = useUiStore((s) => s.setCollapsed)
  const toggleBranch = useUiStore((s) => s.toggleBranch)
  const tree = useMemo(() => ({ focusPersonId, persons, parentLinks, partnerships }), [focusPersonId, persons, parentLinks, partnerships])

  // On the chart, collapsed branches are taken out before the layout is made, so the rest closes up around the gap.
  const hidden = useMemo(() => (rows ? hiddenBy(tree, collapsed) : NOBODY), [rows, tree, collapsed])
  const shown = useMemo(() => {
    if (hidden.size === 0) return { persons, parentLinks, partnerships }
    return {
      persons: persons.filter((p) => !hidden.has(p.id)),
      parentLinks: parentLinks.filter((l) => !hidden.has(l.childId) && !hidden.has(l.parentId)),
      partnerships: partnerships.filter((p) => !hidden.has(p.personIds[0]) && !hidden.has(p.personIds[1])),
    }
  }, [hidden, persons, parentLinks, partnerships])
  const laidOut = useTreeLayout(shown.persons, shown.parentLinks, shown.partnerships, shape)
  const groups = useMemo<GroupInfo[] | undefined>(
    () =>
      rows
        ? branchGroups(tree).map((group) => {
            const isCollapsed = collapsed.has(group.key)
            return { ...group, collapsed: isCollapsed, hiddenCount: isCollapsed ? branchSize(tree, group.key) : 0 }
          })
        : undefined,
    [rows, tree, collapsed],
  )
  // Opening a Person, or picking them in the search, opens the way to them if they are inside a collapsed branch.
  useEffect(() => {
    if (hidden.size === 0) return
    const wanted = [selectedId, revealRequest?.id].filter((id): id is string => Boolean(id) && hidden.has(id as string))
    if (wanted.length > 0) setCollapsed(revealPersons(tree, collapsed, wanted))
  }, [hidden, selectedId, revealRequest, tree, collapsed, setCollapsed])
  const atLimit = persons.length >= PERF_BUDGET.hardLimit
  useEffect(() => {
    if (atLimit) announceLimitOnce()
  }, [atLimit])
  const links = useMemo(() => ({ persons, parentLinks, partnerships }), [persons, parentLinks, partnerships])
  const relationships = useMemo(
    () => deriveRelationships({ focusPersonId, persons, parentLinks, partnerships }),
    [focusPersonId, persons, parentLinks, partnerships],
  )
  // a big Tree is laid out in a Worker: until the first layout is back there is nothing to draw yet
  if (!laidOut) return <p aria-live="polite" className="p-4 text-ink-soft">{t('tree.layingOut')}</p>
  return (
    <TreeCanvas
      layout={laidOut.layout}
      persons={laidOut.persons}
      reducedDetail={atLimit}
      focusPersonId={focusPersonId}
      links={links}
      relationships={relationships}
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
      groups={groups}
      onToggleBranch={toggleBranch}
      onExpandAll={() => setCollapsed(new Set())}
      onCollapseAll={() => setCollapsed(allGroupKeys(tree))}
      onEnsureShown={(id) => setCollapsed(revealPersons(tree, collapsed, [id]))}
    />
  )
}
