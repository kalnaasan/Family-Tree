import type { TreeState } from '../domain/store.ts'
import type { PhotoGc } from './photoGc.ts'
import { type PhotoStore, isQuotaError } from './photoStore.ts'

export type PhotoResult = { ok: true } | { ok: false; message: string }

export interface PhotoService {
  /** Stores the photo, then gives the Person it, as one undoable step. A failure leaves the Person untouched. */
  setPhoto: (personId: string, blob: Blob) => Promise<PhotoResult>
  /** Takes the Person's photo away, as one undoable step. The Blob is deleted once undo can no longer need it. */
  removePhoto: (personId: string) => void
}

interface Dependencies {
  store: { getState: () => Pick<TreeState, 'updatePerson'> }
  photos: PhotoStore
  gc: Pick<PhotoGc, 'protect' | 'noteStored'>
  newId?: () => string
}

/**
 * The only place a photo is attached to a Person. The Blob is written to storage first and the Tree changes after,
 * so a saved Tree never names a photo that is missing. If the write fails (storage full, say) the Person is left as
 * they were and the caller gets a message: a photo problem never blocks saving a Person's other details.
 */
export function createPhotoService({ store, photos, gc, newId = () => crypto.randomUUID() }: Dependencies): PhotoService {
  return {
    async setPhoto(personId, blob) {
      const photoId = newId()
      const release = gc.protect(photoId)
      try {
        await photos.put(photoId, blob)
        gc.noteStored(photoId)
        store.getState().updatePerson(personId, { photoId }, 'Change photo')
        return { ok: true }
      } catch (error) {
        return {
          ok: false,
          message: isQuotaError(error)
            ? 'There is not enough storage space left for this photo, so it was not added. Everything else is saved.'
            : 'The photo could not be saved, so it was not added. Everything else is saved.',
        }
      } finally {
        release()
      }
    },
    removePhoto(personId) {
      store.getState().updatePerson(personId, { photoId: undefined }, 'Remove photo')
    },
  }
}
