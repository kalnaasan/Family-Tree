import { serializeDocument } from '../domain/document.ts'
import type { Tree } from '../domain/schema.ts'

/** Downloads the current Tree as a JSON file. Photos are added by the Export ticket. */
export function downloadBackup(tree: Tree, now: Date = new Date()): void {
  const blob = new Blob([JSON.stringify(serializeDocument(tree, now), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `family-tree-${now.toISOString().slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
