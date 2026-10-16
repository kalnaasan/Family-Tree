import type { CropRect } from './crop.ts'

/** The stored size of a photo: a square this many pixels across (spec section 6). */
export const PHOTO_SIZE = 512
/** The size of the copy used when the tree is zoomed out. */
export const THUMBNAIL_SIZE = 192
const WEBP_QUALITY = 0.82
const JPEG_QUALITY = 0.85

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/**
 * Opens a photo with its EXIF orientation applied, so a phone photo taken sideways comes out upright. The bitmap's
 * width and height are those of the upright picture, which is what the crop works in. Throws if it cannot be decoded.
 */
export const decodePhoto = (file: Blob): Promise<ImageBitmap> => createImageBitmap(file, { imageOrientation: 'from-image' })

/**
 * Cuts the cropped square out of the photo and encodes it as a 512 px WebP (JPEG where the browser cannot write
 * WebP). Drawing onto a canvas and encoding afresh is what drops the EXIF block, with its location and camera data.
 */
export async function encodePhoto(bitmap: ImageBitmap, crop: CropRect): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = PHOTO_SIZE
  canvas.height = PHOTO_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot draw images.')
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, crop.x, crop.y, crop.side, crop.side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
  const webp = await toBlob(canvas, 'image/webp', WEBP_QUALITY)
  if (webp?.type === 'image/webp') return webp
  const jpeg = await toBlob(canvas, 'image/jpeg', JPEG_QUALITY)
  if (!jpeg) throw new Error('The photo could not be encoded.')
  return jpeg
}

/** A smaller copy of a stored photo, for drawing a medallion when the tree is zoomed out. */
export async function makeThumbnail(photo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(photo, {
    resizeWidth: THUMBNAIL_SIZE,
    resizeHeight: THUMBNAIL_SIZE,
    resizeQuality: 'high',
  })
  try {
    const canvas = document.createElement('canvas')
    canvas.width = THUMBNAIL_SIZE
    canvas.height = THUMBNAIL_SIZE
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
    const blob = await toBlob(canvas, photo.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp', WEBP_QUALITY)
    if (!blob) throw new Error('The thumbnail could not be encoded.')
    return blob
  } finally {
    bitmap.close()
  }
}
