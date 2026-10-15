// PROTOTYPE (issue #5): in-memory tree + the ambiguity rules for "add relative". Shared by all variants so they
// differ only in presentation. Mirrors the data model: Persons, birth Parent links, Partnerships.
export const initial = {
  persons: [
    ['karl', 'Karl', 'male'], ['maria', 'Maria', 'female'], ['eva', 'Eva', 'female'],
    ['ben', 'Ben', 'male'], ['lea', 'Lea', 'female'], ['tom', 'Tom', 'male'],
    ['nina', 'Nina', 'female'], ['max', 'Max', 'male'], ['zoe', 'Zoe', 'female'],
  ].map(([id, name, gender]) => ({ id, name, gender })),
  parentLinks: [['ben','karl'],['ben','maria'],['lea','karl'],['lea','maria'],['tom','karl'],['tom','eva'],['max','ben'],['max','nina'],['zoe','lea']],
  partnerships: [['karl','maria'],['karl','eva',true],['ben','nina']], // [a, b, ended?]
}
export const RELATIONS = [
  { key: 'father', label: 'Father', gender: 'male', kind: 'parent' },
  { key: 'mother', label: 'Mother', gender: 'female', kind: 'parent' },
  { key: 'brother', label: 'Brother', gender: 'male', kind: 'sibling' },
  { key: 'sister', label: 'Sister', gender: 'female', kind: 'sibling' },
  { key: 'husband', label: 'Husband', gender: 'male', kind: 'partner' },
  { key: 'wife', label: 'Wife', gender: 'female', kind: 'partner' },
  { key: 'partner', label: 'Partner', gender: 'unknown', kind: 'partner' },
  { key: 'son', label: 'Son', gender: 'male', kind: 'child' },
  { key: 'daughter', label: 'Daughter', gender: 'female', kind: 'child' },
  { key: 'child', label: 'Child', gender: 'unknown', kind: 'child' },
]
const rel = k => RELATIONS.find(r => r.key === k)
export const nameOf = (s, id) => s.persons.find(p => p.id === id)?.name ?? id
export const parentsOf = (s, id) => s.parentLinks.filter(([c]) => c === id).map(([, p]) => p)
export const partnersOf = (s, id) =>
  s.partnerships.filter(([a, b]) => a === id || b === id).map(([a, b, ended]) => ({ id: a === id ? b : a, ended: !!ended }))

// Returns null when nothing is ambiguous, { blocked } when impossible, or a question to ask.
export function clarify(s, id, key) {
  const r = rel(key), n = nameOf(s, id)
  if (r.kind === 'parent') {
    const ps = parentsOf(s, id)
    if (ps.length >= 2) return { blocked: `${n} already has two birth parents (${ps.map(p => nameOf(s, p)).join(' and ')}).` }
    if (ps.length === 1) return {
      question: `Are ${nameOf(s, ps[0])} and the new ${r.label.toLowerCase()} partners?`,
      options: [{ value: 'current', label: 'Yes, current partners' }, { value: 'ended', label: 'Yes, but it ended' }, { value: 'none', label: 'No partnership' }], default: 'current',
    }
    return null
  }
  if (r.kind === 'sibling') {
    const ps = parentsOf(s, id)
    if (ps.length === 0) return {
      question: `${n} has no parents yet. A sibling must share a parent.`,
      options: [{ value: 'new', label: 'Create an unnamed shared parent' }], default: 'new',
    }
    if (ps.length === 1) return null
    return {
      question: `Which parents does the new ${r.label.toLowerCase()} share with ${n}?`,
      options: [{ value: 'both', label: `Both: ${ps.map(p => nameOf(s, p)).join(' + ')}` },
        ...ps.map(p => ({ value: p, label: `Only ${nameOf(s, p)} (half-sibling)` }))], default: 'both',
    }
  }
  if (r.kind === 'child') {
    const ps = partnersOf(s, id)
    if (ps.length === 0) return null
    return {
      question: `Who is the other parent of the new ${r.label.toLowerCase()}?`,
      options: [...ps.map(p => ({ value: p.id, label: `${nameOf(s, p.id)}${p.ended ? ' (ended partnership)' : ''}` })), { value: 'none', label: `Nobody / not recorded` }],
      default: ps.find(p => !p.ended)?.id ?? ps[0].id,
    }
  }
  return { // partner
    question: 'Is this partnership still current?',
    options: [{ value: 'current', label: 'Current' }, { value: 'ended', label: 'Ended' }], default: 'current',
  }
}

// Applies the add; returns { state, created: [human-readable lines] } — the "surfaced state".
export function apply(s, id, key, { name, gender }, choice) {
  const r = rel(key), q = clarify(s, id, key)
  if (q?.blocked) throw new Error(q.blocked)
  const c = choice ?? q?.default
  const uid = `p${s.persons.length + 1}`
  const persons = [...s.persons, { id: uid, name, gender }], links = [...s.parentLinks], ships = [...s.partnerships], log = [`+ Person ${name} (${gender})`]
  const nm = x => persons.find(q => q.id === x)?.name
  const link = (child, parent) => { links.push([child, parent]); log.push(`+ Parent link: ${nm(child)} is child of ${nm(parent)}`) }
  const ship = (a, b, ended) => { ships.push([a, b, ended]); log.push(`+ Partnership ${nm(a)} & ${nm(b)}${ended ? ' (ended)' : ''}`) }
  if (r.kind === 'parent') {
    link(id, uid)
    const other = parentsOf(s, id)[0]
    if (other && c !== 'none') ship(other, uid, c === 'ended')
  } else if (r.kind === 'sibling') {
    let ps = parentsOf(s, id)
    if (ps.length === 0) {
      persons.push({ id: `${uid}x`, name: '(unnamed parent)', gender: 'unknown' }); log.push('+ Person (unnamed parent)')
      link(id, `${uid}x`); ps = [`${uid}x`]
    } else if (ps.length === 2 && c !== 'both') ps = [c]
    ps.forEach(p => link(uid, p))
  } else if (r.kind === 'child') {
    link(uid, id)
    if (c && c !== 'none') link(uid, c)
  } else ship(id, uid, c === 'ended')
  return { state: { persons, parentLinks: links, partnerships: ships }, created: log }
}
