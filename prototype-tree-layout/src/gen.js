// PROTOTYPE: deterministic generated big tree (?n=150) to test "unlimited members".
export function generate(n) {
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const persons = [], parentLinks = [], partnerships = []
  const add = name => { const id = 'p' + persons.length; persons.push({ id, name }); return id }
  let frontier = []
  for (let i = 0; i < 3; i++) { const a = add('Root' + i), b = add('Mate' + i); partnerships.push([a, b]); frontier.push([a, b]) }
  while (persons.length < n && frontier.length) {
    const [a, b] = frontier.shift()
    const kids = 1 + Math.floor(r() * 3)
    for (let k = 0; k < kids && persons.length < n; k++) {
      const c = add('P' + persons.length); parentLinks.push([c, a], [c, b])
      if (r() < 0.7 && persons.length < n) { const m = add('M' + persons.length); partnerships.push([c, m]); frontier.push([c, m]) }
    }
  }
  return { persons, parentLinks, partnerships }
}
