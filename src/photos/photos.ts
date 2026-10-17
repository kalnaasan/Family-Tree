import { useSyncExternalStore } from 'react'
import { snapshotKeeper } from '../backup/snapshots.ts'
import { useTreeStore } from '../domain/store.ts'
import { createPhotoCache } from './photoCache.ts'
import { createPhotoGc } from './photoGc.ts'
import { createPhotoService } from './photoService.ts'
import { createPhotoStore } from './photoStore.ts'

/** The app's one photo storage, cache of object URLs, cleanup and service, all on the app's Tree store. */
export const photoStore = createPhotoStore()
export const photoCache = createPhotoCache({ photos: photoStore })
// photos in a saved version stay, so restoring that version brings its photos back too
export const photoGc = createPhotoGc(
  useTreeStore,
  photoStore,
  (photoId) => photoCache.forget(photoId),
  snapshotKeeper.referencedPhotoIds,
)
export const photoService = createPhotoService({ store: useTreeStore, photos: photoStore, gc: photoGc })

/** Re-renders the caller whenever a photo's object URL becomes ready or is released. Returns the cache's version. */
export const usePhotoVersion = (): number => useSyncExternalStore(photoCache.subscribe, photoCache.version)
