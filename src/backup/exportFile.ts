import { serializeDocument } from '../domain/document.ts'
import type { Tree, TreeDocument } from '../domain/schema.ts'
import type { PhotoStore } from '../photos/photoStore.ts'

/** The Tree document, plus (spec section 6) a `photos` map from `photoId` to a base64 data URL. */
export type ExportDocument = TreeDocument & { photos?: Record<string, string> }

/** "data:image/webp;base64,...". */
export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('The photo could not be read.'))
    reader.readAsDataURL(blob)
  })
}

export interface BuiltExport {
  text: string
  /** How many photos went into the file. */
  photoCount: number
  /** People whose photo is named in the Tree but missing from storage; they show the default figure, here as there. */
  missingPhotos: number
}

export const exportFileName = (now: Date) => `family-tree-${now.toISOString().slice(0, 10)}.json`

/**
 * The text of an export file. Only the photos the Tree uses are included, and only when asked for ("Include photos",
 * on by default). The document part is exactly what is saved, so importing the file gives the same Tree back.
 */
export async function buildExport(
  tree: Tree,
  photos: Pick<PhotoStore, 'get'>,
  options: { includePhotos: boolean; now?: Date },
): Promise<BuiltExport> {
  const document: ExportDocument = serializeDocument(tree, options.now ?? new Date())
  let photoCount = 0
  let missingPhotos = 0
  if (options.includePhotos) {
    const included: Record<string, string> = {}
    for (const person of tree.persons) {
      const photoId = person.photoId
      if (!photoId || photoId in included) continue
      const blob = await photos.get(photoId)
      if (!blob) {
        missingPhotos++
        continue
      }
      included[photoId] = await blobToDataUrl(blob)
      photoCount++
    }
    if (photoCount > 0) document.photos = included
  }
  return { text: JSON.stringify(document, null, 2), photoCount, missingPhotos }
}
