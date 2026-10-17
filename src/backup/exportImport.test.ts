import { describe, expect, it, vi } from 'vitest'
import type { Tree } from '../domain/schema.ts'
import { addParentLink, addPerson, emptyTree } from '../domain/tree.ts'
import { memoryPhotoStore } from '../photos/memoryPhotoStore.ts'
import { MAX_PHOTO_BYTES } from '../photos/sniff.ts'
import { buildExport, exportFileName } from './exportFile.ts'
import { parseImport } from './importFile.ts'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ANNA_PHOTO = id(101)
const BEN_PHOTO = id(102)
const now = new Date('2026-06-01T09:30:00Z')

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 2, 3])
const PNG = Uint8Array.from([0x89, ...ascii('PNG'), 13, 10, 26, 10, 0, 0, 0, 13])
const WEBP = Uint8Array.from([...ascii('RIFF'), 8, 0, 0, 0, ...ascii('WEBP'), 1, 2, 3, 4])
const HEIC = Uint8Array.from([0, 0, 0, 24, ...ascii('ftypheic'), 0, 0, 0, 0])

const dataUrl = (mime: string, bytes: Uint8Array) => `data:${mime};base64,${btoa(String.fromCharCode(...bytes))}`
const bytesOf = async (blob: Blob) => [...new Uint8Array(await blob.arrayBuffer())]

/** Anna and Ben, parents of Cleo; Anna and Ben have photos. */
function family(): Tree {
  let tree = emptyTree()
  tree = addPerson(tree, { id: id(1), firstName: 'Anna', lastName: 'Meier', photoId: ANNA_PHOTO })
  tree = addPerson(tree, { id: id(2), firstName: 'Ben', photoId: BEN_PHOTO })
  tree = addPerson(tree, { id: id(3), firstName: 'Cleo', birthDate: '2001-04' })
  tree = addParentLink(tree, id(3), id(1))
  tree = addParentLink(tree, id(3), id(2))
  return { ...tree, focusPersonId: id(3) }
}

function photoStore() {
  const store = memoryPhotoStore()
  store.blobs.set(ANNA_PHOTO, new Blob([WEBP], { type: 'image/webp' }))
  store.blobs.set(BEN_PHOTO, new Blob([JPEG], { type: 'image/jpeg' }))
  return store
}

/** The family's document with the given `photos` value (whatever it is, valid or not). */
function fileWith(photos: unknown) {
  return JSON.stringify({ format: 'family-tree', schemaVersion: 2, exportedAt: now.toISOString(), ...family(), photos })
}

const decodeAll = async () => {}

describe('export', () => {
  it('names the file after the day', () => {
    expect(exportFileName(now)).toBe('family-tree-2026-06-01.json')
  })

  it('writes the document and, when asked, every photo the Tree uses as a data URL', async () => {
    const built = await buildExport(family(), photoStore(), { includePhotos: true, now })
    const file = JSON.parse(built.text)
    expect(file).toMatchObject({ format: 'family-tree', schemaVersion: 2, exportedAt: now.toISOString(), focusPersonId: id(3) })
    expect(Object.keys(file.photos).sort()).toEqual([ANNA_PHOTO, BEN_PHOTO])
    expect(file.photos[ANNA_PHOTO]).toBe(dataUrl('image/webp', WEBP))
    expect(built).toMatchObject({ photoCount: 2, missingPhotos: 0 })
  })

  it('leaves photos out when not included, and says nothing about them in the file', async () => {
    const built = await buildExport(family(), photoStore(), { includePhotos: false, now })
    expect(JSON.parse(built.text)).not.toHaveProperty('photos')
    expect(built.photoCount).toBe(0)
  })

  it('leaves out photos nobody uses, and counts the ones that are missing from storage', async () => {
    const store = photoStore()
    store.blobs.set(id(999), new Blob([PNG], { type: 'image/png' })) // belongs to nobody
    store.blobs.delete(BEN_PHOTO)
    const built = await buildExport(family(), store, { includePhotos: true, now })
    expect(Object.keys(JSON.parse(built.text).photos)).toEqual([ANNA_PHOTO])
    expect(built).toMatchObject({ photoCount: 1, missingPhotos: 1 })
  })
})

describe('round trip', () => {
  it('export then import gives the identical document and photos', async () => {
    const tree = family()
    const first = await buildExport(tree, photoStore(), { includePhotos: true, now })
    const imported = await parseImport(first.text, { decode: decodeAll })
    if (!imported.ok) throw new Error(imported.message)
    expect(imported.tree).toEqual(tree)
    expect(imported.photos.size).toBe(2)
    expect(await bytesOf(imported.photos.get(ANNA_PHOTO)!)).toEqual([...WEBP])
    expect(imported.photos.get(ANNA_PHOTO)!.type).toBe('image/webp')
    expect(await bytesOf(imported.photos.get(BEN_PHOTO)!)).toEqual([...JPEG])

    // exporting what was imported writes the very same file
    const store = memoryPhotoStore()
    for (const [photoId, blob] of imported.photos) store.blobs.set(photoId, blob)
    const second = await buildExport(imported.tree, store, { includePhotos: true, now })
    expect(second.text).toBe(first.text)
  })

  it('also holds without photos', async () => {
    const tree = family()
    const first = await buildExport(tree, photoStore(), { includePhotos: false, now })
    const imported = await parseImport(first.text, { decode: decodeAll })
    if (!imported.ok) throw new Error(imported.message)
    expect(imported.tree).toEqual(tree)
    expect(imported.photos.size).toBe(0)
    expect((await buildExport(imported.tree, memoryPhotoStore(), { includePhotos: false, now })).text).toBe(first.text)
  })

  it('an empty Tree survives it', async () => {
    const built = await buildExport(emptyTree(), memoryPhotoStore(), { includePhotos: true, now })
    const imported = await parseImport(built.text, { decode: decodeAll })
    expect(imported).toMatchObject({ ok: true, tree: emptyTree() })
  })
})

describe('import checks', () => {
  it('rejects text that is not JSON', async () => {
    expect(await parseImport('<html>nope</html>')).toMatchObject({ ok: false, rule: 'not-json' })
    expect(await parseImport('')).toMatchObject({ ok: false, rule: 'not-json' })
  })

  it('rejects JSON that is not a family-tree document, naming the rule', async () => {
    expect(await parseImport('{"hello":1}')).toMatchObject({ ok: false, rule: 'not-a-document' })
    expect(await parseImport('[]')).toMatchObject({ ok: false, rule: 'not-a-document' })
  })

  it('rejects a newer version, and malformed data, naming the rule', async () => {
    const tree = JSON.parse((await buildExport(family(), photoStore(), { includePhotos: false, now })).text)
    expect(await parseImport(JSON.stringify({ ...tree, schemaVersion: 99 }))).toMatchObject({
      ok: false,
      rule: 'unsupported-version',
    })
    expect(await parseImport(JSON.stringify({ ...tree, persons: [{ id: 'x' }] }))).toMatchObject({
      ok: false,
      rule: 'invalid-data',
    })
  })

  it('rejects a Tree that breaks an integrity rule, naming it', async () => {
    const tree = JSON.parse((await buildExport(family(), photoStore(), { includePhotos: false, now })).text)
    tree.parentLinks.push({ childId: id(1), parentId: id(3), kind: 'birth' }) // Cleo's child is Anna: a cycle
    const result = await parseImport(JSON.stringify(tree))
    expect(result.ok).toBe(false)
    expect((result as { rule: string }).rule).not.toBe('invalid-data')
  })

  it('still reads a version 1 document', async () => {
    const tree = JSON.parse((await buildExport(family(), photoStore(), { includePhotos: false, now })).text)
    for (const person of tree.persons) delete person.photoId
    expect(await parseImport(JSON.stringify({ ...tree, schemaVersion: 1 }))).toMatchObject({ ok: true })
  })
})

describe('import checks on photos', () => {
  const anna = (value: unknown) => parseImport(fileWith({ [ANNA_PHOTO]: value }), { decode: decodeAll })
  const messageOf = (result: Awaited<ReturnType<typeof anna>>) => (result.ok ? '' : result.message)

  it('accepts JPEG, PNG and WebP', async () => {
    for (const [mime, bytes] of [
      ['image/jpeg', JPEG],
      ['image/png', PNG],
      ['image/webp', WEBP],
    ] as const) {
      expect(await anna(dataUrl(mime, bytes))).toMatchObject({ ok: true })
    }
  })

  it('rejects a photo that is not an image data URL, naming the Person', async () => {
    for (const value of [42, null, 'https://example.com/a.jpg', 'data:text/plain;base64,aGk=', 'data:image/svg+xml;base64,PHN2Zz4=']) {
      const result = await anna(value)
      expect(result).toMatchObject({ ok: false, rule: 'invalid-photo' })
      expect(messageOf(result)).toContain('Anna Meier')
    }
  })

  it('rejects a HEIC photo, with the reason', async () => {
    for (const result of [await anna(dataUrl('image/heic', HEIC)), await anna(dataUrl('image/jpeg', HEIC))]) {
      expect(result).toMatchObject({ ok: false, rule: 'invalid-photo' })
      expect(messageOf(result)).toMatch(/Anna Meier.*HEIC/)
    }
  })

  it('rejects bytes that are not the declared kind of image', async () => {
    const result = await anna(dataUrl('image/png', JPEG))
    expect(result).toMatchObject({ ok: false, rule: 'invalid-photo' })
    expect(messageOf(result)).toContain('not the kind of image')
    expect(await anna(dataUrl('image/jpeg', Uint8Array.from([1, 2, 3, 4])))).toMatchObject({ ok: false })
  })

  it('rejects damaged base64 and an empty photo', async () => {
    expect(await anna('data:image/jpeg;base64,@@@not base64@@@')).toMatchObject({ ok: false, rule: 'invalid-photo' })
    expect(await anna('data:image/jpeg;base64,')).toMatchObject({ ok: false, rule: 'invalid-photo' })
  })

  it('rejects a photo over 25 MB without decoding it', async () => {
    const decode = vi.fn()
    const huge = `data:image/webp;base64,${'A'.repeat(Math.ceil(((MAX_PHOTO_BYTES + 3) * 4) / 3))}`
    const result = await parseImport(fileWith({ [ANNA_PHOTO]: huge }), { decode })
    expect(result).toMatchObject({ ok: false, rule: 'invalid-photo' })
    expect(messageOf(result)).toMatch(/Anna Meier.*25\.0 MB/)
    expect(decode).not.toHaveBeenCalled()
  })

  it('rejects a photo the browser cannot open', async () => {
    const decode = vi.fn().mockRejectedValue(new Error('bad image'))
    const result = await parseImport(fileWith({ [ANNA_PHOTO]: dataUrl('image/webp', WEBP) }), { decode })
    expect(result).toMatchObject({ ok: false, rule: 'invalid-photo' })
    expect(messageOf(result)).toMatch(/Anna Meier.*cannot be opened/)
  })

  it('names the Person whose photo is bad, not the first one', async () => {
    const result = await parseImport(fileWith({ [ANNA_PHOTO]: dataUrl('image/webp', WEBP), [BEN_PHOTO]: 'garbage' }), {
      decode: decodeAll,
    })
    expect(messageOf(result)).toMatch(/^The photo of Ben /)
  })

  it('rejects the whole file for one bad photo: nothing partial comes back', async () => {
    const result = await parseImport(fileWith({ [ANNA_PHOTO]: dataUrl('image/webp', WEBP), [BEN_PHOTO]: 7 }), {
      decode: decodeAll,
    })
    expect(result.ok).toBe(false)
    expect(result).not.toHaveProperty('photos')
  })

  it('rejects photos that are not a map', async () => {
    for (const photos of [[], 'x', 5, null]) {
      expect(await parseImport(fileWith(photos), { decode: decodeAll })).toMatchObject({ ok: false, rule: 'invalid-photo' })
    }
  })

  it('a Person whose photo is not in the file is fine: they get the default figure', async () => {
    const result = await parseImport(fileWith({ [BEN_PHOTO]: dataUrl('image/jpeg', JPEG) }), { decode: decodeAll })
    if (!result.ok) throw new Error(result.message)
    expect([...result.photos.keys()]).toEqual([BEN_PHOTO])
    expect(result.tree.persons.find((p) => p.id === id(1))?.photoId).toBe(ANNA_PHOTO)
  })

  it('a photo nobody uses is ignored, even a bad one', async () => {
    const result = await parseImport(fileWith({ [id(555)]: 'garbage', [ANNA_PHOTO]: dataUrl('image/png', PNG) }), {
      decode: decodeAll,
    })
    if (!result.ok) throw new Error(result.message)
    expect([...result.photos.keys()]).toEqual([ANNA_PHOTO])
  })
})
