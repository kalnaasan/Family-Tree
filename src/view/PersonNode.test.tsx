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
  ariaLabel: 'Maria Keller, mother, born 1930, died 2001',
  gender: 'female',
  deceased: false,
  isFocus: false,
  isSelected: false,
  isCurrent: false,
}

function draw(props: Partial<PersonNodeProps> = {}) {
  const { container } = render(
    <svg>
      <PersonNode {...base} {...props} />
    </svg>,
  )
  return container.querySelector('svg')!
}

describe('PersonNode direction (spec section 13.3)', () => {
  const lines = (svg: SVGElement) => [...svg.querySelectorAll('text')].filter((text) => text.textContent !== base.initial)

  it('reads the name in its own direction and the dates in the direction the page reads', () => {
    const svg = draw({ name: 'محمد الأحمد', nameDirection: 'rtl', life: '1930–2001', lifeDirection: 'ltr' })
    const [name, life] = lines(svg)
    expect(name).toHaveAttribute('direction', 'rtl')
    expect(life).toHaveAttribute('direction', 'ltr')
  })

  it('does not tie the name to the page: a Latin name stays left to right on a page that reads right to left', () => {
    const svg = draw({ name: 'Maria Keller', nameDirection: 'ltr', life: '2001–1930', lifeDirection: 'rtl' })
    const [name, life] = lines(svg)
    expect(name).toHaveAttribute('direction', 'ltr')
    expect(life).toHaveAttribute('direction', 'rtl')
  })

  it('embeds each line, so its direction really is the base of its own text and not the page\'s', () => {
    const [name] = lines(draw({ nameDirection: 'rtl' }))
    expect(name).toHaveAttribute('unicode-bidi', 'embed')
  })

  it('is left to right when nothing is said', () => {
    const [name, life] = lines(draw())
    expect(name).toHaveAttribute('direction', 'ltr')
    expect(life).toHaveAttribute('direction', 'ltr')
  })
})

describe('PersonNode', () => {
  it('full: shows the name, the dates and two leaves', () => {
    const svg = draw()
    expect(svg).toHaveTextContent('Maria Keller')
    expect(svg).toHaveTextContent('1930–2001')
    expect(svg.querySelectorAll('ellipse[rx="9"]')).toHaveLength(2)
    expect(svg.querySelector('[data-person-wrapper]')).toHaveAttribute('transform', 'translate(10 20)')
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
    const dot = svg.querySelector('[data-person-id] > circle')!
    expect(dot).toHaveAttribute('r', String(DOT_RADIUS))
    expect(dot).toHaveAttribute('fill', PALETTE.ring.female)
    expect(svg.querySelectorAll('text')).toHaveLength(0)
  })

  describe('for assistive technology and the keyboard', () => {
    it.each(['full', 'noLeaves', 'initial', 'dot'] as const)('%s: a named button', (bucket) => {
      const node = draw({ bucket }).querySelector('[data-person-id]')!
      expect(node).toHaveAttribute('role', 'button')
      expect(node).toHaveAttribute('aria-label', 'Maria Keller, mother, born 1930, died 2001')
    })

    it.each(['full', 'initial', 'dot'] as const)('%s: only the current Person is in the tab order', (bucket) => {
      expect(draw({ bucket, isCurrent: true }).querySelector('[data-person-id]')).toHaveAttribute('tabindex', '0')
      expect(draw({ bucket, isCurrent: false }).querySelector('[data-person-id]')).toHaveAttribute('tabindex', '-1')
    })

    it('hides every decorative part: the drawn name and dates, figure, leaves, marks and rings', () => {
      const svg = draw({ deceased: true, isFocus: true, isSelected: true })
      const node = svg.querySelector('[data-person-id]')!
      for (const part of node.querySelectorAll('text, ellipse, circle[stroke-dasharray], circle[fill="none"]')) {
        expect(part.closest('[aria-hidden="true"]') ?? part).toHaveAttribute('aria-hidden', 'true')
      }
      for (const text of svg.querySelectorAll('text')) expect(text).toHaveAttribute('aria-hidden', 'true')
    })

    it('has a keyboard ring that index.css shows only while focused', () => {
      expect(draw().querySelector('[data-person-id] > .cursor-ring')).toHaveAttribute('aria-hidden', 'true')
      expect(draw({ bucket: 'dot' }).querySelector('[data-person-id] > .cursor-ring')).not.toBeNull()
    })

    it('marks the open Person with aria-current', () => {
      expect(draw({ isSelected: true }).querySelector('[data-person-id]')).toHaveAttribute('aria-current', 'true')
      expect(draw().querySelector('[data-person-id]')).not.toHaveAttribute('aria-current')
    })
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

  it('the open Person has a dashed ring that is not the Focus ring', () => {
    const open = draw({ isSelected: true, isFocus: true })
    expect(open.querySelector(`circle[stroke="${PALETTE.selected}"]`)).toHaveAttribute('stroke-dasharray')
    expect(open.querySelector(`circle[stroke="${PALETTE.focus}"]`)).not.toHaveAttribute('stroke-dasharray')
    expect(draw().querySelector(`circle[stroke="${PALETTE.selected}"]`)).toBeNull()
    expect(draw({ isSelected: true, bucket: 'initial' }).querySelector(`circle[stroke="${PALETTE.selected}"]`)).not.toBeNull()
  })

  it('a Person who is not a relative of the open one is drawn faint, and stays a button', () => {
    expect(draw({ isDimmed: true }).querySelector('[data-person-wrapper]')).toHaveAttribute('opacity', '0.35')
    expect(draw().querySelector('[data-person-wrapper]')).not.toHaveAttribute('opacity')
    expect(draw({ isDimmed: true }).querySelector('[data-person-id]')).toHaveAttribute('role', 'button')
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
