import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { PersonLine } from './PersonLine.tsx'

afterEach(cleanup)

describe('PersonLine', () => {
  it('reads like "Name · label · years", with the name isolated in its own direction', () => {
    const { container } = render(<p><PersonLine name="Maria Keller" rest={['mother', '1962']} /></p>)
    expect(container).toHaveTextContent('Maria Keller · mother · 1962')
    const name = container.querySelector('bdi')!
    expect(name).toHaveTextContent('Maria Keller')
    // the parts around it are not inside it: they keep the direction of the line they are in
    expect(container.querySelectorAll('bdi')).toHaveLength(1)
  })

  it('leaves out what is missing, and shows just the name when there is nothing else', () => {
    const { container } = render(
      <p>
        <PersonLine name="محمد" rest={[null, undefined, '', '1962']} />
      </p>,
    )
    expect(container).toHaveTextContent('محمد · 1962')
    cleanup()
    const alone = render(<p><PersonLine name="Maria" rest={[null]} /></p>)
    expect(alone.container).toHaveTextContent(/^Maria$/)
  })

  it('has an accessible name that is just the words, whatever the markup', () => {
    const { container } = render(
      <button type="button">
        <PersonLine name="Ana" rest={['sister', '1990']} />
      </button>,
    )
    expect(container.querySelector('button')).toHaveAccessibleName('Ana · sister · 1990')
  })
})
