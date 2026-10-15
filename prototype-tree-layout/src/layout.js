// PROTOTYPE layered layout shared by all variants: generation rows (roots at the bottom),
// x by iterative barycenter relaxation, partners pulled together, overlaps resolved per row.
export function layout({ persons, parentLinks, partnerships }, { gapX = 110, gapY = 140 } = {}) {
  const parents = {}, children = {}, partners = {}
  persons.forEach(p => { parents[p.id] = []; children[p.id] = []; partners[p.id] = [] })
  parentLinks.forEach(([c, p]) => { parents[c].push(p); children[p].push(c) })
  partnerships.forEach(([a, b]) => { partners[a].push(b); partners[b].push(a) })

  const gen = {}
  const g = id => gen[id] ??= parents[id].length ? 1 + Math.max(...parents[id].map(g)) : 0
  persons.forEach(p => g(p.id))
  // partners share a generation: lift the lower one up to the higher
  for (let i = 0; i < 5; i++) partnerships.forEach(([a, b]) => { const m = Math.max(gen[a], gen[b]); gen[a] = gen[b] = m })
  // children must sit below parents' gen + 1
  for (let i = 0; i < 5; i++) parentLinks.forEach(([c, p]) => { if (gen[c] <= gen[p]) gen[c] = gen[p] + 1 })

  const rows = {}
  persons.forEach(p => (rows[gen[p.id]] ??= []).push(p.id))
  const x = {}
  Object.values(rows).forEach(r => r.forEach((id, i) => (x[id] = i * gapX)))
  const nbr = id => [
    ...parents[id].map(p => [x[p], 1]), ...children[id].map(c => [x[c], 1]),
    ...partners[id].map(p => [x[p], 3]),
  ]
  const gens = Object.keys(rows).map(Number).sort((a, b) => a - b)
  for (let it = 0; it < 40; it++) {
    for (const gi of it % 2 ? [...gens].reverse() : gens) {
      const ids = rows[gi]
      ids.forEach(id => {
        const ns = nbr(id); const w = ns.reduce((s, [, k]) => s + k, 0)
        if (w) x[id] = ns.reduce((s, [px, k]) => s + px * k, 0) / w
      })
      ids.sort((a, b) => x[a] - x[b])
      for (let i = 1; i < ids.length; i++) if (x[ids[i]] - x[ids[i - 1]] < gapX) x[ids[i]] = x[ids[i - 1]] + gapX
    }
  }
  const minX = Math.min(...Object.values(x))
  const maxGen = Math.max(...gens)
  const nodes = persons.map(p => ({ ...p, gen: gen[p.id], x: x[p.id] - minX + 60, y: (maxGen - gen[p.id]) * gapY + 60 }))
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const count = id => 1 + children[id].reduce((s, c) => s + count(c), 0) // descendants (branch thickness)
  nodes.forEach(n => (n.weight = count(n.id)))
  return {
    nodes, byId,
    width: Math.max(...nodes.map(n => n.x)) + 120,
    height: maxGen * gapY + 120,
    parentEdges: parentLinks.map(([c, p]) => ({ child: byId[c], parent: byId[p] })),
    partnerEdges: partnerships.map(([a, b, o]) => ({ a: byId[a], b: byId[b], ended: !!o?.ended })),
  }
}

// PROTOTYPE round-crown layout: bends the linear layout into a fan. Oldest generation at the trunk top (origin),
// later generations on rings further out; angle comes from the linear x so relatives stay together.
export function crown(L, { span = 270, r0 = 130, step = 140, gap = 100 } = {}) {
  const xs = L.nodes.map(n => n.x), xmin = Math.min(...xs), xmax = Math.max(...xs), dx = xmax - xmin || 1
  const half = (span / 2) * Math.PI / 180
  const theta = n => -half + ((n.x - xmin) / dx) * 2 * half
  const byGen = {}
  L.nodes.forEach(n => (byGen[n.gen] ??= []).push(n))
  const radius = {}
  let prev = r0 - step
  Object.keys(byGen).map(Number).sort((a, b) => a - b).forEach(g => {
    const row = byGen[g].map(theta).sort((a, b) => a - b)
    let minGap = Infinity
    for (let i = 1; i < row.length; i++) minGap = Math.min(minGap, row[i] - row[i - 1])
    const need = minGap === Infinity ? 0 : gap / minGap
    radius[g] = prev = Math.max(prev + step, need)
  })
  const nodes = L.nodes.map(n => {
    const t = theta(n), r = radius[n.gen]
    return { ...n, theta: t, r, x: r * Math.sin(t), y: -r * Math.cos(t) }
  })
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]))
  const xsN = nodes.map(n => n.x), ysN = nodes.map(n => n.y)
  return {
    nodes, byId,
    bounds: { x0: Math.min(...xsN) - 80, x1: Math.max(...xsN) + 80, y0: Math.min(...ysN) - 80, y1: 340 },
    parentEdges: L.parentEdges.map(e => ({ child: byId[e.child.id], parent: byId[e.parent.id] })),
    partnerEdges: L.partnerEdges.map(e => ({ a: byId[e.a.id], b: byId[e.b.id], ended: e.ended })),
    rootNodes: nodes.filter(n => n.gen === 0),
  }
}
