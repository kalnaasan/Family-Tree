import { type ParseFailureRule, parseDocument } from '../domain/document.ts'
import type { Person, Tree } from '../domain/schema.ts'
import { MAX_PHOTO_BYTES, type PhotoType, sniffImage } from '../photos/sniff.ts'

export type ImportFailureRule = ParseFailureRule | 'not-json' | 'invalid-photo'

export type ImportResult =
  | { ok: true; tree: Tree; photos: Map<string, Blob> }
  /** `message` names the rule that failed, or the Person whose photo is bad. Nothing has been changed. */
  | { ok: false; rule: ImportFailureRule; message: string }

export interface ImportDependencies {
  /** Throws if the browser cannot open the image. */
  decode?: (blob: Blob) => Promise<void>
}

const MIME: Record<PhotoType, string> = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' }

const defaultDecode = async (blob: Blob) => {
  const bitmap = await createImageBitmap(blob)
  bitmap.close()
}

const fail = (rule: ImportFailureRule, message: string): ImportResult => ({ ok: false, rule, message })

const nameOf = (person: Person) => [person.firstName, person.lastName].filter(Boolean).join(' ')

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

type PhotoCheck = { ok: true; blob: Blob } | { ok: false; problem: string }

/** Checks one photo from the file as strictly as a chosen one: type, size cap, and that it can be opened. */
async function checkPhoto(value: unknown, decode: (blob: Blob) => Promise<void>): Promise<PhotoCheck> {
  const match = typeof value === 'string' ? /^data:([^;,]*);base64,([\s\S]*)$/.exec(value) : null
  if (!match) return { ok: false, problem: 'is not stored as an image' }
  const [, declared, base64] = match
  if (/^image\/hei[cf]/.test(declared)) return { ok: false, problem: 'is a HEIC photo, which browsers cannot open' }
  if (!Object.values(MIME).includes(declared)) return { ok: false, problem: 'is not a JPEG, PNG or WebP image' }

  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  const size = Math.floor((base64.length * 3) / 4) - padding
  if (size > MAX_PHOTO_BYTES) {
    return { ok: false, problem: `is ${megabytes(size)}, over the ${megabytes(MAX_PHOTO_BYTES)} limit` }
  }
  let bytes: Uint8Array<ArrayBuffer>
  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))
  } catch {
    return { ok: false, problem: 'is damaged (it is not valid base64)' }
  }
  if (bytes.length === 0) return { ok: false, problem: 'is empty' }

  const type = sniffImage(bytes)
  if (type === 'heic') return { ok: false, problem: 'is a HEIC photo, which browsers cannot open' }
  if (type === null || MIME[type] !== declared) return { ok: false, problem: 'is not the kind of image it says it is' }

  const blob = new Blob([bytes], { type: declared })
  try {
    await decode(blob)
  } catch {
    return { ok: false, problem: 'is damaged and cannot be opened' }
  }
  return { ok: true, blob }
}

/**
 * Reads an export file without changing anything: the document is checked by the same rules as a saved one
 * (shape, version, integrity), then every photo it carries. The first problem rejects the whole file, naming the rule
 * or the Person, so a half-good file never replaces a good Tree. A Person whose photo is not in the file just shows the
 * default figure; a photo no Person uses is ignored.
 */
export async function parseImport(text: string, dependencies: ImportDependencies = {}): Promise<ImportResult> {
  const decode = dependencies.decode ?? defaultDecode
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return fail('not-json', 'This file could not be read as JSON, so it is not a family-tree file')
  }

  const parsed = parseDocument(raw)
  if (!parsed.ok) return fail(parsed.rule, parsed.message)

  const carried = (raw as { photos?: unknown }).photos
  const photos = new Map<string, Blob>()
  if (carried !== undefined) {
    if (typeof carried !== 'object' || carried === null || Array.isArray(carried)) {
      return fail('invalid-photo', 'The photos in this file are not stored as a list of images')
    }
    const entries = carried as Record<string, unknown>
    for (const person of parsed.tree.persons) {
      const photoId = person.photoId
      if (!photoId || photos.has(photoId) || !Object.hasOwn(entries, photoId)) continue
      const check = await checkPhoto(entries[photoId], decode)
      if (!check.ok) return fail('invalid-photo', `The photo of ${nameOf(person)} ${check.problem}`)
      photos.set(photoId, check.blob)
    }
  }
  return { ok: true, tree: parsed.tree, photos }
}
