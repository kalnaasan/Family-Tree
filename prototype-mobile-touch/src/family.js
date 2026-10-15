// PROTOTYPE: deterministic ~40-person family (4 generations) so panning/zooming actually matters.
const F = ['Maria','Eva','Lea','Nina','Zoe','Anna','Mia','Ida','Clara','Emma','Lena','Sara','Hanna','Julia','Laura','Greta','Rosa','Nora','Elsa','Vera','Alma','Frieda','Tilda','Ruth','Paula']
const M = ['Karl','Ben','Tom','Max','Paul','Jan','Leo','Finn','Otto','Emil','Hugo','Jonas','Felix','Theo','Lukas','Noah','Erik','Anton','Ralf','Kurt','Willi','Bruno','Ernst','Hans','Moritz']
export function makeFamily() {
  const persons = [], parentLinks = [], partnerships = []
  let f = 0, m = 0, focusId = null
  const add = g => { const name = g === 'female' ? F[f++] : M[m++]; const id = name.toLowerCase(); persons.push({ id, name, gender: g }); return id }
  const grow = (a, b, depth) => {
    const kids = [4, 2, 2][depth] ?? 0
    for (let i = 0; i < kids; i++) {
      const c = add(i % 2 ? 'female' : 'male'); parentLinks.push([c, a], [c, b])
      if (depth === 1 && i === 0) focusId = c
      if (depth < 2) { const s = add(i % 2 ? 'male' : 'female'); partnerships.push([c, s]); grow(c, s, depth + 1) }
    }
  }
  const a = add('male'), b = add('female'); partnerships.push([a, b]); grow(a, b, 0)
  partnerships[2].push(true) // one ended partnership, for the dashed look
  return { state: { persons, parentLinks, partnerships }, focusId }
}
