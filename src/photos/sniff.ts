/** Spec section 6: JPEG, PNG and WebP up to 25 MB. */
export const MAX_PHOTO_BYTES = 25 * 1024 * 1024

export type PhotoType = 'jpeg' | 'png' | 'webp'

const ascii = (bytes: Uint8Array, from: number, length: number) =>
  String.fromCharCode(...bytes.slice(from, from + length))

/** The brands of the HEIF family that phones write for "HEIC" photos. */
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'heif'])

/** What the first bytes of a file say it is, whatever its name or declared type claims. */
export function sniffImage(bytes: Uint8Array): PhotoType | 'heic' | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg'
  if (ascii(bytes, 1, 3) === 'PNG' && bytes[0] === 0x89) return 'png'
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'webp'
  if (ascii(bytes, 4, 4) === 'ftyp' && HEIC_BRANDS.has(ascii(bytes, 8, 4))) return 'heic'
  return null
}

export type PhotoCheck = { ok: true; type: PhotoType } | { ok: false; message: string }

const megabytes = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/** Checks a chosen file before anything is decoded, with a message that says what to do about it. */
export async function validatePhotoFile(file: Blob & { name?: string }): Promise<PhotoCheck> {
  if (file.size === 0) return { ok: false, message: 'That file is empty.' }
  if (file.size > MAX_PHOTO_BYTES) {
    return { ok: false, message: `That file is ${megabytes(file.size)}. Photos can be up to 25 MB.` }
  }
  const type = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()))
  if (type === 'heic' || (type === null && /\.hei[cf]$/i.test(file.name ?? ''))) {
    return { ok: false, message: 'That is a HEIC photo, which browsers cannot open. Convert it to JPEG first.' }
  }
  if (type === null) return { ok: false, message: 'That file is not a JPEG, PNG or WebP photo.' }
  return { ok: true, type }
}
