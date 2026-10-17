/** Hands the user a file to keep (an export), as a download. */
export function downloadTextFile(text: string, fileName: string): void {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // the browser starts reading the file after the click returns; letting go of it at once can cancel the download
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
