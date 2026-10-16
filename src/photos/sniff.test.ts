import { describe, expect, it } from 'vitest'
import { MAX_PHOTO_BYTES, sniffImage, validatePhotoFile } from './sniff.ts'

const bytes = (...values: (number | string)[]) =>
  Uint8Array.from(values.flatMap((v) => (typeof v === 'string' ? [...v].map((c) => c.charCodeAt(0)) : [v])))

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 16, 'JFIF')
const PNG = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a)
const WEBP = bytes('RIFF', 1, 2, 3, 4, 'WEBPVP8 ')
const HEIC = bytes(0, 0, 0, 24, 'ftypheic', 0, 0, 0, 0)
const AVIF = bytes(0, 0, 0, 24, 'ftypavif', 0, 0, 0, 0)

const file = (content: Uint8Array, name = 'photo.jpg', size = content.length) => {
  const blob = new Blob([content as Uint8Array<ArrayBuffer>]) as Blob & { name?: string }
  Object.defineProperty(blob, 'name', { value: name })
  Object.defineProperty(blob, 'size', { value: size })
  return blob
}

describe('sniffImage', () => {
  it('recognises the three supported formats by their first bytes', () => {
    expect(sniffImage(JPEG)).toBe('jpeg')
    expect(sniffImage(PNG)).toBe('png')
    expect(sniffImage(WEBP)).toBe('webp')
  })

  it('recognises HEIC, which is not supported', () => {
    expect(sniffImage(HEIC)).toBe('heic')
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypmif1'))).toBe('heic')
  })

  it('knows nothing else, not even AVIF, text or an empty file', () => {
    expect(sniffImage(AVIF)).toBeNull()
    expect(sniffImage(bytes('hello world, not a photo'))).toBeNull()
    expect(sniffImage(new Uint8Array())).toBeNull()
  })
})

describe('validatePhotoFile', () => {
  it('accepts a real JPEG, PNG or WebP whatever it is called', async () => {
    expect(await validatePhotoFile(file(JPEG))).toEqual({ ok: true, type: 'jpeg' })
    expect(await validatePhotoFile(file(PNG, 'scan.dat'))).toEqual({ ok: true, type: 'png' })
    expect(await validatePhotoFile(file(WEBP, 'x'))).toEqual({ ok: true, type: 'webp' })
  })

  it('rejects a HEIC photo and says to convert it to JPEG', async () => {
    const result = await validatePhotoFile(file(HEIC, 'IMG_0001.HEIC'))
    expect(result).toEqual({ ok: false, message: 'That is a HEIC photo, which browsers cannot open. Convert it to JPEG first.' })
  })

  it('rejects a HEIC file by its name when the bytes are not recognised either', async () => {
    const result = await validatePhotoFile(file(bytes('????????????'), 'IMG.heif'))
    expect(result.ok === false && result.message).toMatch(/HEIC/)
  })

  it('rejects other files by what they are, not what they are called', async () => {
    expect(await validatePhotoFile(file(bytes('%PDF-1.7 not a photo'), 'photo.jpg'))).toEqual({
      ok: false,
      message: 'That file is not a JPEG, PNG or WebP photo.',
    })
    expect(await validatePhotoFile(file(AVIF, 'a.avif'))).toMatchObject({ ok: false })
  })

  it('rejects a file over 25 MB and says its size', async () => {
    const result = await validatePhotoFile(file(JPEG, 'big.jpg', MAX_PHOTO_BYTES + 1.2 * 1024 * 1024))
    expect(result).toEqual({ ok: false, message: 'That file is 26.2 MB. Photos can be up to 25 MB.' })
  })

  it('accepts a file of exactly 25 MB', async () => {
    expect(await validatePhotoFile(file(JPEG, 'edge.jpg', MAX_PHOTO_BYTES))).toMatchObject({ ok: true })
  })

  it('rejects an empty file', async () => {
    expect(await validatePhotoFile(file(new Uint8Array(), 'empty.jpg'))).toEqual({ ok: false, message: 'That file is empty.' })
  })
})
