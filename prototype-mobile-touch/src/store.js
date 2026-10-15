// PROTOTYPE (issue #10): read-only data + helpers. Add-relative itself is stubbed (decided in the Add-relative ticket).
export const RELATIONS = ['Father', 'Mother', 'Brother', 'Sister', 'Husband', 'Wife', 'Partner', 'Son', 'Daughter', 'Child']
export function relatives(s, id) {
  const parents = s.parentLinks.filter(([c]) => c === id).map(([, p]) => p)
  const children = s.parentLinks.filter(([, p]) => p === id).map(([c]) => c)
  const partners = s.partnerships.filter(([a, b]) => a === id || b === id).map(([a, b, e]) => ({ id: a === id ? b : a, ended: !!e }))
  const sibs = [...new Set(parents.flatMap(p => s.parentLinks.filter(([, pp]) => pp === p).map(([c]) => c)))].filter(c => c !== id)
  return { parents, children, partners, sibs }
}
