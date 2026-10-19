import { useEffect, useRef, useState } from 'react'
import type { Person } from '../domain/schema.ts'
import { type MessageRef, msg, renderMessage } from '../i18n/messageRef.ts'
import { useT } from '../i18n/useT.ts'
import { decodePhoto } from '../photos/encode.ts'
import { photoCache, photoService, usePhotoVersion } from '../photos/photos.ts'
import { validatePhotoFile } from '../photos/sniff.ts'
import { CropDialog } from './CropDialog.tsx'

/** A Person's photo in a circle, or the plain figure when there is none (or it is still loading). */
export function Avatar({ person, size }: { person: Pick<Person, 'photoId'>; size: number }) {
  usePhotoVersion() // asks again when the photo has loaded
  const url = person.photoId ? photoCache.urlFor(person.photoId, 'full') : undefined
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-line-strong bg-surface-soft"
    >
      {url ? (
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" width={size * 0.6} height={size * 0.6} fill="#78716c">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8z" />
        </svg>
      )}
    </span>
  )
}

/**
 * Choose, crop, replace and remove a Person's photo (spec section 6). Each change is its own undoable step and takes
 * effect at once; Save and Cancel on the form are about the written details. A photo that cannot be added says why
 * here and never stops the other details from being saved.
 */
export function PhotoField({ person }: { person: Person }) {
  const t = useT()
  const input = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<MessageRef | null>(null)
  const [bitmap, setBitmap] = useState<ImageBitmap | null>(null)

  // a decoded photo holds memory until it is closed
  useEffect(() => () => bitmap?.close(), [bitmap])

  const onChoose = async (file: File) => {
    setMessage(null)
    const check = await validatePhotoFile(file)
    if (!check.ok) {
      setMessage(check.message)
      return
    }
    try {
      setBitmap(await decodePhoto(file))
    } catch {
      setMessage(msg('photo.unreadable'))
    }
  }

  const onConfirm = async (photo: Blob) => {
    const result = await photoService.setPhoto(person.id, photo)
    if (!result.ok) setMessage(result.message)
    setBitmap(null)
  }

  return (
    <section aria-labelledby={`photo-${person.id}`} className="flex flex-col gap-2">
      <h3 id={`photo-${person.id}`} className="font-medium">
        {t('photo.title')}
      </h3>
      <div className="flex items-center gap-3">
        <Avatar person={person} size={64} />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="btn px-3"
          >
            {person.photoId ? t('photo.change') : t('photo.choose')}
          </button>
          {person.photoId && (
            <button
              type="button"
              onClick={() => {
                setMessage(null)
                photoService.removePhoto(person.id)
              }}
              className="btn px-3"
            >
              {t('photo.remove')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,.heic,.heif"
        aria-label={t('photo.fileLabel')}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          event.target.value = '' // choosing the same file again must still fire
          if (file) void onChoose(file)
        }}
      />
      {message && (
        <p role="alert" className="text-danger">
          {renderMessage(t, message)}
        </p>
      )}
      {bitmap && <CropDialog bitmap={bitmap} onCancel={() => setBitmap(null)} onConfirm={onConfirm} />}
    </section>
  )
}
