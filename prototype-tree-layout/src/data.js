// PROTOTYPE sample tree: partners, an ended partnership, half-sibling, two roots.
export const persons = [
  ['hans','Hans'],['greta','Greta'],['otto','Otto'],['ilse','Ilse'],
  ['karl','Karl'],['anna','Anna'],['maria','Maria'],['eva','Eva'],['paul','Paul'],
  ['ben','Ben'],['lea','Lea'],['tom','Tom'],['sofie','Sofie'],['nina','Nina'],['max','Max'],
].map(([id, name]) => ({ id, name }))
// [child, parent]
export const parentLinks = [
  ['karl','hans'],['karl','greta'],['anna','hans'],['anna','greta'],
  ['maria','otto'],['maria','ilse'],
  ['ben','karl'],['ben','maria'],['lea','karl'],['lea','maria'],
  ['tom','karl'],['tom','eva'],
  ['sofie','anna'],['sofie','paul'],
  ['max','ben'],['max','nina'],
]
export const partnerships = [
  ['hans','greta'],['otto','ilse'],['karl','maria'],['karl','eva',{ ended: true }],
  ['anna','paul'],['ben','nina'],
]
