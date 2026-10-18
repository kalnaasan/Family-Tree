import { Fragment } from 'react'

/**
 * A line about a Person: "Name · label · years". The name sits in a `<bdi>`, so it reads in its own direction (an
 * Arabic name in an English page, a Latin one in an Arabic page) without pulling the rest of the line with it; the
 * label and the years keep the direction of the page. Parts that are missing are left out.
 */
export function PersonLine({ name, rest }: { name: string; rest: readonly (string | null | undefined)[] }) {
  return (
    <>
      <bdi>{name}</bdi>
      {rest.filter(Boolean).map((part, index) => (
        <Fragment key={index}>
          {' · '}
          {part}
        </Fragment>
      ))}
    </>
  )
}
