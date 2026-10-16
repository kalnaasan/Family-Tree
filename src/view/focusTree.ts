/** Hands the keyboard back to the tree: to its current Person if one is drawn, otherwise to the tree itself. */
export function focusTree(): void {
  const frame = document.querySelector<HTMLElement>('[aria-label="Family tree"]')
  if (!frame) return
  const current = frame.querySelector<SVGElement>('[data-person-id][tabindex="0"]')
  ;(current ?? frame).focus({ preventScroll: true })
}
