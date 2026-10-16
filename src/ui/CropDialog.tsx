import { type KeyboardEvent, type PointerEvent, useEffect, useId, useRef, useState } from 'react'
import {
  KEY_ZOOM_FACTOR,
  MAX_CROP_ZOOM,
  MIN_CROP_ZOOM,
  type CropState,
  clampCrop,
  cropRect,
  dragCrop,
  initialCrop,
  nudgeCrop,
  zoomCrop,
} from '../photos/crop.ts'
import { encodePhoto } from '../photos/encode.ts'

/** The preview is this many CSS pixels across (drawn at twice that, so it is sharp on a phone). */
const PREVIEW_PX = 280

interface Props {
  /** The photo, already upright. */
  bitmap: ImageBitmap
  onCancel: () => void
  /** Gets the cropped, encoded photo. The dialog stays open, busy, until this settles. */
  onConfirm: (photo: Blob) => Promise<void>
}

/**
 * The circular crop step (spec section 6): drag the photo or use the arrow keys to place it, the slider or + and -
 * to zoom. A modal `<dialog>`, so the keyboard stays inside it and Escape cancels.
 */
export function CropDialog({ bitmap, onCancel, onConfirm }: Props) {
  const titleId = useId()
  const hintId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const photo = { width: bitmap.width, height: bitmap.height }
  const [crop, setCrop] = useState<CropState>(() => initialCrop(photo))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => dialog?.close()
  }, [])

  // The preview shows exactly the pixels that will be kept.
  useEffect(() => {
    const context = canvasRef.current?.getContext('2d')
    if (!context) return
    const { x, y, side } = cropRect({ width: bitmap.width, height: bitmap.height }, crop)
    context.imageSmoothingQuality = 'high'
    context.drawImage(bitmap, x, y, side, side, 0, 0, PREVIEW_PX * 2, PREVIEW_PX * 2)
  }, [bitmap, crop])

  const onKeyDown = (event: KeyboardEvent) => {
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key] as
      | [-1 | 0 | 1, -1 | 0 | 1]
      | undefined
    if (move) setCrop((c) => nudgeCrop(photo, c, move[0], move[1]))
    else if (event.key === '+' || event.key === '=') setCrop((c) => zoomCrop(photo, c, KEY_ZOOM_FACTOR))
    else if (event.key === '-' || event.key === '_') setCrop((c) => zoomCrop(photo, c, 1 / KEY_ZOOM_FACTOR))
    else return
    event.preventDefault()
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current
    if (!start || start.pointerId !== event.pointerId) return
    const [dx, dy] = [event.clientX - start.x, event.clientY - start.y]
    start.x = event.clientX
    start.y = event.clientY
    setCrop((c) => dragCrop(photo, c, dx, dy, PREVIEW_PX))
  }
  const endDrag = () => {
    drag.current = null
  }

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm(await encodePhoto(bitmap, cropRect(photo, crop)))
    } catch {
      setError('The photo could not be prepared. Try another one.')
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault() // the parent closes it
        if (!busy) onCancel()
      }}
      // The dialog sits inside the person's panel, which closes on Escape: this Escape belongs to the dialog alone.
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.stopPropagation()
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-xl border border-stone-400 bg-white p-5 shadow-xl backdrop:bg-black/50"
    >
      <h2 id={titleId} className="text-xl font-semibold">
        Crop photo
      </h2>
      <p id={hintId} className="mt-1 text-sm text-stone-700">
        Drag the photo, or use the arrow keys, to place it. Zoom with the slider, or with + and −.
      </p>

      <div
        role="group"
        aria-label="Photo position"
        aria-describedby={hintId}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ width: PREVIEW_PX, height: PREVIEW_PX }}
        className="mx-auto my-4 cursor-grab touch-none overflow-hidden rounded-full border-4 border-stone-700 bg-stone-200 outline-offset-4 focus-visible:outline-3 focus-visible:outline-sky-800 active:cursor-grabbing"
      >
        <canvas
          ref={canvasRef}
          width={PREVIEW_PX * 2}
          height={PREVIEW_PX * 2}
          aria-hidden="true"
          className="pointer-events-none block size-full"
        />
      </div>

      <label className="flex items-center gap-3">
        <span className="font-medium">Zoom</span>
        <input
          type="range"
          min={MIN_CROP_ZOOM}
          max={MAX_CROP_ZOOM}
          step={0.01}
          value={crop.zoom}
          onChange={(event) => setCrop((c) => clampCrop(photo, { ...c, zoom: Number(event.target.value) }))}
          className="h-11 flex-1"
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 text-red-800">
          {error}
        </p>
      )}

      <div className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="min-h-11 flex-1 rounded bg-green-800 px-4 font-medium text-white disabled:opacity-60"
        >
          {busy ? 'Saving…' : 'Use this photo'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-11 rounded border border-stone-500 px-4 disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </dialog>
  )
}
