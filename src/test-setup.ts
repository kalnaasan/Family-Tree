import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom has no modal dialogs: opening one just sets `open`, which is what shows it (some tests run without a DOM)
if (typeof HTMLDialogElement !== 'undefined') {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
}
