import { useEffect } from 'react'
import { startAppBackupSession } from '../backup/backup.ts'
import { useTreeStore } from '../domain/store.ts'
import { photoGc } from '../photos/photos.ts'
import { startPersistence } from './session.ts'
import { createTreeStorage } from './storage.ts'

/** Loads the saved Tree on mount and autosaves changes while the component is mounted. */
export function usePersistence(): void {
  useEffect(() => {
    let stop: (() => void) | undefined
    let cancelled = false
    void startPersistence(useTreeStore, createTreeStorage(), photoGc, startAppBackupSession).then((cleanup) => {
      // React StrictMode mounts, unmounts and mounts again; drop a start that was already cleaned up.
      if (cancelled) cleanup()
      else stop = cleanup
    })
    return () => {
      cancelled = true
      stop?.()
    }
  }, [])
}
