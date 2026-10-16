import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DOT_RADIUS, PersonNode, type PersonNodeProps } from './PersonNode.tsx'
import { PALETTE } from './palette.ts'

const base: PersonNodeProps = {
  id: '00000000-0000-4000-8000-000000000001',
  x: 10,
  y: 20,
  bucket: 'full',
  name: 'Maria Keller',
  initial: 'M',
  life: '1930–2001',
  gender: 'female',
  deceased: false,
  isFocus: false,
}

function draw(props: Partial<PersonNodeProps> = {}) {
  const { container } = render(
    <svg>
      <PersonNode {...base} {...props} />
    </svg>,
  )
  return container.querySelector('svg')!
}

describe('PersonNode', () => {
  it('full: shows the name, the dates and two leaves', () => {
    const svg = draw()
    expect(svg).toHaveTextContent('Maria Keller')
    expect(svg).toHaveTextContent('1930–2001')
    expect(svg.querySelectorAll('ellipse[rx="9"]')).toHaveLength(2)
    expect(svg.querySelector('[data-person-id]')).toHaveAttribute('transform', 'translate(10 20)')
  })

  it('noLeaves: the same without the leaves', () => {
    const svg = draw({ bucket: 'noLeaves' })
    expect(svg).toHaveTextContent('Maria Keller')
    expect(svg.querySelectorAll('ellipse[rx="9"]')).toHaveLength(0)
  })

  it('initial: only the first letter, no name or dates', () => {
    const svg = draw({ bucket: 'initial' })
    expect(svg).toHaveTextContent(/^M$/)
    expect(svg).not.toHaveTextContent('Maria')
  })

  it('dot: a single small circle in the ring colour', () => {
    const svg = draw({ bucket: 'dot' })
    const dot = svg.querySelector('circle[data-person-id]')!
    expect(dot).toHaveAttribute('r', String(DOT_RADIUS))
    expect(dot).toHaveAttribute('fill', PALETTE.ring.female)
    expect(svg.querySelectorAll('text')).toHaveLength(0)
  })

  it('leaves are hidden from assistive technology', () => {
    const leaves = draw().querySelector('ellipse[rx="9"]')!.parentElement!
    expect(leaves).toHaveAttribute('aria-hidden', 'true')
  })

  it('the ring colour follows gender, with a neutral for other and unknown', () => {
    const ring = (gender: PersonNodeProps['gender']) =>
      draw({ gender }).querySelector('circle[stroke-width="6"]')!.getAttribute('stroke')
    expect(ring('female')).toBe(PALETTE.ring.female)
    expect(ring('male')).toBe(PALETTE.ring.male)
    expect(ring('other')).toBe(PALETTE.ring.other)
    expect(ring('female')).not.toBe(ring('male'))
  })

  it('a deceased Person has a muted ring and a mark, not colour alone', () => {
    const living = draw()
    const dead = draw({ deceased: true })
    expect(dead.querySelector('circle[stroke-width="6"]')).toHaveAttribute('stroke', PALETTE.ringDeceased.female)
    expect(dead.querySelectorAll('circle').length).toBeGreaterThan(living.querySelectorAll('circle').length)
  })

  it('the Focus person has an extra ring', () => {
    expect(draw({ isFocus: true }).querySelectorAll('circle').length).toBe(draw().querySelectorAll('circle').length + 1)
  })

  it('uses the default figure unless there is a photo', () => {
    expect(draw().querySelector('image')).toBeNull()
    const withPhoto = draw({ photoUrl: 'blob:photo' })
    expect(withPhoto.querySelector('image')).toHaveAttribute('href', 'blob:photo')
  })

  it('leaves the others alone: re-rendering with equal props keeps the same DOM node', () => {
    const { container, rerender } = render(
      <svg>
        <PersonNode {...base} />
      </svg>,
    )
    const node = container.querySelector('[data-person-id]')
    rerender(
      <svg>
        <PersonNode {...base} />
      </svg>,
    )
    expect(container.querySelector('[data-person-id]')).toBe(node)
  })
})
