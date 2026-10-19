import type { Person } from '../../domain/schema.ts'
import { initialOf } from '../../view/text.ts'
import { Avatar } from '../PhotoField.tsx'

/** The Person's photo in a circle, or their initial. Decoration only: the name beside it is what is read out. */
export function PersonAvatar({ person, size = 40 }: { person: Pick<Person, 'firstName' | 'photoId' | 'deceased'>; size?: number }) {
  if (person.photoId) return <Avatar person={person} size={size} />
  return (
    <span
      aria-hidden="true"
      dir="auto"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      className={`grid shrink-0 place-items-center rounded-full border-2 bg-accent-soft font-semibold text-bark ${person.deceased ? 'border-dashed border-line-strong' : 'border-accent'}`}
    >
      {initialOf(person)}
    </span>
  )
}
