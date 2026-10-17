import { useEffect } from 'react'
import { startAppBackupSession } from '../backup/backup.ts'
import { useTreeStore } from '../domain/store.ts'
import { photoGc } from '../photos/photos.ts'
import { type EditingSession, createEditingSession } from './editingSession.ts'
import { startPersistence } from './session.ts'
import { createTreeStorage } from './storage.ts'
import { createWriterLock } from './writerLock.ts'

let active: EditingSession | undefined

/** Makes this tab the one that edits (from the "Take over editing" button). Resolves once it is. */
export const takeOverEditing = async (): Promise<void> => {
  await active?.takeOver()
}

/**
 * Takes the editing role if no other tab has it, loads the saved Tree, and autosaves changes while this tab is the
 * editing one. Otherwise the Tree is shown read-only (spec section 10).
 */
export function usePersistence(): void {
  useEffect(() => {
    const editing = createEditingSession({
      createLock: (hooks) => createWriterLock(hooks),
      begin: (mode) => startPersistence(useTreeStore, createTreeStorage(), photoGc, startAppBackupSession, mode),
    })
    // Starting on the next turn lets React StrictMode's mount, unmount, mount settle before the lock is asked for.
    const timer = setTimeout(() => {
      active = editing
      void editing.start()
    }, 0)
    return () => {
      clearTimeout(timer)
      if (active === editing) active = undefined
      editing.stop()
    }
  }, [])
}
