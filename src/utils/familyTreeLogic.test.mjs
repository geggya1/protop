import assert from 'node:assert/strict';
import {
  ageFromBirthday,
  personMetaLine,
  lifeSpanLabel,
  normalizeTreeDate,
  assertValidPersonInput,
  layoutFamilyTree,
  computeGenerations,
  parentEdgeSegments,
  findMatchingTreePerson,
  membersMissingFromTree,
  membersNeedingTreeLink,
  findDuplicatePersonGroups,
  buildMergeRelationPatches,
  pickPreferredDuplicate,
  normalizePersonKey,
  immediateParentIds,
  nuclearParentIds,
  householdParentIdsForChildren,
  buildParentIdSanitizationPatches,
  likelySpousesByName,
  areSiblings,
  indexPeople,
} from './familyTreeLogic.js';

const karsten = {
  displayName: 'Karsten Antonius Andersen',
  birthday: '1928-01-01',
  deathDate: '1997-12-2',
  isExternal: true,
};

assert.equal(normalizeTreeDate('1997-12-2'), '1997-12-02');
assert.equal(normalizeTreeDate('1928'), '1928');
assert.equal(ageFromBirthday(karsten.birthday, karsten.deathDate), 69);
assert.equal(ageFromBirthday('1928', '1997-12-02'), 69);
assert.equal(ageFromBirthday('1928-05-15', '1997-12-02'), 69);
assert.equal(ageFromBirthday('1928-12-31', '1997-12-02'), 68);
assert.equal(ageFromBirthday('1928-01-01', null, new Date(2026, 8, 1)), 98);

const living = ageFromBirthday('1928-01-01', undefined, new Date(2026, 8, 1));
assert.equal(living, 98);

const meta = personMetaLine(karsten);
assert.match(meta, /69 år/);
assert.doesNotMatch(meta, /98 år/);
assert.match(meta, /† 02\.12\.1997/);
assert.match(meta, /Ikke bruker/);
assert.equal(lifeSpanLabel(karsten), '1928–1997');

const saved = assertValidPersonInput(karsten);
assert.equal(saved.birthday, '1928-01-01');
assert.equal(saved.deathDate, '1997-12-02');

assert.throws(
  () => assertValidPersonInput({ displayName: 'X', birthday: '1990-01-01', deathDate: '1980-01-01' }),
  /Dødsdato/,
);

// --- Duplikat / invitasjon-match ---
assert.equal(normalizePersonKey('  Geir   Ove  '), 'geir ove');

const treePeople = [
  {
    id: 'odd1',
    displayName: 'Odd Andersen',
    inviteStatus: 'pending',
    email: 'odd@example.com',
    parentIds: [],
    partnerIds: ['vigdis'],
  },
  {
    id: 'odd2',
    displayName: 'Odd Andersen',
    linkedUid: null,
    parentIds: ['karsten'],
    partnerIds: [],
  },
  {
    id: 'geir1',
    displayName: 'Geir Ove Andersen',
    linkedUid: 'uid-geir',
    photoURL: 'https://x/a.jpg',
    parentIds: ['odd1'],
    partnerIds: [],
  },
  {
    id: 'geir2',
    displayName: 'Geir Ove Andersen',
    linkedUid: 'uid-geir',
    parentIds: ['odd2'],
    partnerIds: [],
  },
  {
    id: 'vigdis',
    displayName: 'Vigdis Hatleskog',
    inviteStatus: 'pending',
    parentIds: [],
    partnerIds: ['odd1'],
  },
];

const members = [
  { id: 'uid-geir', name: 'Geir Ove Andersen', role: 'parent' },
  { id: 'uid-odd', name: 'Odd Andersen', email: 'odd@example.com', role: 'parent' },
];

const oddMatch = findMatchingTreePerson(members[1], treePeople);
assert.equal(oddMatch.id, 'odd1', 'skal matche invitert Odd på e-post');

assert.equal(
  membersMissingFromTree(members, treePeople).length,
  0,
  'ingen medlemmer mangler når navn/e-post matcher',
);

const needing = membersNeedingTreeLink(members, treePeople);
assert.equal(needing.length, 1);
assert.equal(needing[0].person.id, 'odd1');
assert.equal(needing[0].member.id, 'uid-odd');

const groups = findDuplicatePersonGroups(treePeople);
assert.ok(groups.some((g) => {
  const ids = [g.keepId, ...g.dropIds];
  return ids.includes('geir1') && ids.includes('geir2');
}), 'Geir-duplikater skal grupperes');
assert.ok(groups.some((g) => {
  const ids = [g.keepId, ...g.dropIds];
  return ids.includes('odd1') && ids.includes('odd2');
}), 'Odd-duplikater skal grupperes');

assert.equal(pickPreferredDuplicate([
  treePeople.find((p) => p.id === 'geir1'),
  treePeople.find((p) => p.id === 'geir2'),
]).id, 'geir1', 'behold Geir med foto');

const oddPatches = buildMergeRelationPatches(treePeople, 'odd1', ['odd2']);
assert.ok(
  oddPatches.get('odd1').parentIds.includes('karsten'),
  'odd1 arver forelder fra odd2',
);
assert.ok(
  oddPatches.get('geir2')?.parentIds.includes('odd1'),
  'geir2 sin forelder odd2 skal skrives om til odd1',
);

console.log('familyTreeLogic dedupe tests ok');

// Hatleskog/Andersen: oldeforeldre skal ikke kobles på tvers av begge besteforeldre
const people = [
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: ['enok'], parentIds: [] },
  { id: 'enok', displayName: 'Enok Hatleskog', partnerIds: ['asbjorg'], parentIds: [] },
  { id: 'karsten', displayName: 'Karsten Anton Andersen', partnerIds: [], parentIds: [] },
  { id: 'odd', displayName: 'Odd Andersen', partnerIds: ['vigdis'], parentIds: ['karsten'] },
  { id: 'vigdis', displayName: 'Vigdis Hatleskog', partnerIds: ['odd'], parentIds: ['asbjorg', 'enok'] },
  { id: 'geir', displayName: 'Geir Ove Andersen', partnerIds: [], parentIds: ['odd', 'vigdis'] },
];

const layout = layoutFamilyTree(people, { focusIds: ['geir'], nodeW: 100, gapX: 20, pad: 10 });
const byId = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));

assert.ok(byId.asbjorg && byId.enok && byId.karsten && byId.odd && byId.vigdis);

const hatleskogEdges = layout.edges.filter(
  (e) => e.type === 'parent' && (e.from === 'asbjorg' || e.from === 'enok'),
);
assert.ok(hatleskogEdges.length >= 1);
assert.ok(
  hatleskogEdges.every((e) => e.to === 'vigdis' || e.kind === 'bus' || e.kind === 'drop' || e.kind === 'stem'),
  'Asbjørg/Enok-kanter skal høre til Vigdis-gruppen',
);
assert.ok(
  !layout.edges.some((e) => e.type === 'parent' && e.to === 'odd' && (e.from === 'asbjorg' || e.from === 'enok')),
  'Ingen kant Asbjørg/Enok → Odd',
);

// Par skal ligge side om side (ikke langt fra hverandre pga. ensidig partnerIds)
const oneWayPartners = [
  { id: 'vigdis', displayName: 'Vigdis', partnerIds: ['odd'], parentIds: ['asbjorg'] },
  { id: 'odd', displayName: 'Odd', partnerIds: [], parentIds: ['karsten'] },
  { id: 'asbjorg', displayName: 'Asbjørg', partnerIds: [], parentIds: [] },
  { id: 'karsten', displayName: 'Karsten', partnerIds: [], parentIds: [] },
  { id: 'geir', displayName: 'Geir', partnerIds: [], parentIds: ['odd', 'vigdis'] },
];
const layoutPartners = layoutFamilyTree(oneWayPartners, { focusIds: ['geir'], nodeW: 100, gapX: 20, pad: 10 });
const byPartner = Object.fromEntries(layoutPartners.nodes.map((n) => [n.id, n]));
assert.equal(byPartner.vigdis.y, byPartner.odd.y, 'partnere skal på samme rad');
assert.ok(
  Math.abs(byPartner.vigdis.x - byPartner.odd.x) < 150,
  'partnere skal ligge i samme enhet (ikke langt fra hverandre)',
);

// Stem-kanter skal ikke lage horisontal bak barnet når barnet er under midX
const stem = layoutPartners.edges.find((e) => e.kind === 'stem' && e.to === 'geir');
assert.ok(stem, 'skal ha stem til Geir');
const stemSegs = parentEdgeSegments(stem);
const geirCx = byPartner.geir.x + byPartner.geir.w / 2;
const longHBehindChild = stemSegs.some((s) => (
  s.orient === 'h'
  && Math.abs(s.y - byPartner.geir.y) < 5
  && Math.abs(s.x2 - s.x1) > 80
));
assert.equal(longHBehindChild, false, 'ingen lang H gjennom Geir-kortet');
assert.ok(Math.abs(geirCx - (stem.x2)) < 1);

// Bus mellom Odd/Vigdis-foreldre skal begrenses til foreldre-span
const bus = layoutPartners.edges.find((e) => e.kind === 'bus');
assert.ok(bus);
assert.ok(bus.x2 - bus.x1 < 200, 'bus skal ikke strekke seg langt forbi paret');

console.log('familyTreeLogic.test.mjs ok');

function assertFiniteGens(people, focusIds, label) {
  const gens = computeGenerations(people, focusIds);
  assert.equal(gens.size, people.length, `${label}: alle personer skal ha generasjon`);
  gens.forEach((g, id) => {
    assert.equal(Number.isFinite(g), true, `${label}: ${id} skal ha endelig generasjon`);
  });
  const layout = layoutFamilyTree(people, { focusIds, nodeW: 100, gapX: 20, pad: 10 });
  assert.equal(Number.isFinite(layout.width), true);
  assert.equal(Number.isFinite(layout.height), true);
  assert.ok(layout.width < 8000, 'layout-bredde skal være begrenset');
  assert.ok(layout.height < 8000, 'layout-høyde skal være begrenset');
  assert.equal(layout.nodes.length, people.length, `${label}: layout skal fullføre`);
  return gens;
}

// Partner + forelder/barn på samme par (to voksne bootstrappet som partnere + senere satt som forelder)
const parentAlsoPartner = [
  { id: 'mom', displayName: 'Mor', partnerIds: ['son'], parentIds: [] },
  { id: 'son', displayName: 'Sønn', partnerIds: ['mom'], parentIds: ['mom'] },
];
const parentPartnerGens = assertFiniteGens(parentAlsoPartner, ['mom'], 'parent+partner');
assert.equal(parentPartnerGens.get('mom'), 0);
assert.equal(parentPartnerGens.get('son'), 1, 'barnet skal ligge én generasjon under, ikke kjempe med partner-align');

// Begge er husstandsfokus (typisk to «foresatte» i appen)
const bothFocus = assertFiniteGens(parentAlsoPartner, ['mom', 'son'], 'parent+partner dual focus');
assert.ok(bothFocus.get('son') > bothFocus.get('mom'), 'forelder skal fortsatt ligge over barnet');

// Syklus A→B→C→A
const cycle = [
  { id: 'a', displayName: 'A', parentIds: ['c'], partnerIds: [] },
  { id: 'b', displayName: 'B', parentIds: ['a'], partnerIds: [] },
  { id: 'c', displayName: 'C', parentIds: ['b'], partnerIds: [] },
];
assertFiniteGens(cycle, ['a'], 'parent cycle');

// Selv-referanse
const selfie = [
  { id: 'x', displayName: 'X', parentIds: ['x'], partnerIds: ['x'] },
];
const selfGens = assertFiniteGens(selfie, ['x'], 'self parent');
assert.equal(selfGens.get('x'), 0);

console.log('familyTreeLogic freeze tests ok');

function timedLayout(people, focusIds, label, round) {
  const t0 = Date.now();
  const layout = layoutFamilyTree(people, { focusIds, nodeW: 100, gapX: 20, pad: 10 });
  const ms = Date.now() - t0;
  assert.ok(ms < 400, `${label} runde ${round} tok ${ms}ms`);
  assert.equal(Number.isFinite(layout.width) && Number.isFinite(layout.height), true);
  assert.ok(layout.nodes.length > 0 || people.length === 0);
  return ms;
}

const hatleskog = [
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: ['enok'], parentIds: [] },
  { id: 'enok', displayName: 'Enok Hatleskog', partnerIds: ['asbjorg'], parentIds: [] },
  { id: 'karsten', displayName: 'Karsten Anton Andersen', partnerIds: [], parentIds: [] },
  { id: 'odd', displayName: 'Odd Andersen', partnerIds: ['vigdis'], parentIds: ['karsten'] },
  { id: 'vigdis', displayName: 'Vigdis Hatleskog', partnerIds: ['odd'], parentIds: ['asbjorg', 'enok'] },
  { id: 'geir', displayName: 'Geir Ove Andersen', partnerIds: [], parentIds: ['odd', 'vigdis'] },
];
for (let round = 1; round <= 3; round += 1) {
  timedLayout(hatleskog, ['geir'], 'hatleskog', round);
  timedLayout(parentAlsoPartner, ['mom', 'son'], 'parent+partner', round);
  timedLayout(cycle, ['a'], 'cycle', round);
}
console.log('familyTreeLogic 3x open tests ok');

// Stor slekt + motstridende relasjoner — skal bli ferdig i millisekunder, tre ganger.
const crowded = [];
for (let i = 0; i < 80; i += 1) {
  crowded.push({
    id: `p${i}`,
    displayName: `Person ${i}`,
    parentIds: i > 0 ? [`p${Math.floor((i - 1) / 2)}`] : [],
    partnerIds: i % 2 === 1 ? [`p${i - 1}`] : (i + 1 < 80 ? [`p${i + 1}`] : []),
  });
}
crowded[0].partnerIds = ['p1'];
crowded[1].parentIds = ['p0'];
crowded[1].partnerIds = ['p0'];
for (let round = 1; round <= 3; round += 1) {
  timedLayout(crowded, ['p0', 'p1'], 'crowded-80', round);
}
console.log('familyTreeLogic crowded 3x ok');

// --- Barn skal knyttes under foreldre, ikke under besteforeldre ---
const multiGenParents = [
  { id: 'odd', displayName: 'Odd Andersen', partnerIds: ['vigdis'], parentIds: [] },
  { id: 'vigdis', displayName: 'Vigdis Hatleskog', partnerIds: ['odd'], parentIds: [] },
  {
    id: 'geir',
    displayName: 'Geir Ove Andersen',
    partnerIds: ['partner'],
    parentIds: ['odd', 'vigdis'],
    linkedRole: 'parent',
  },
  {
    id: 'partner',
    displayName: 'Partner',
    partnerIds: ['geir'],
    parentIds: [],
    linkedRole: 'parent',
  },
  // Feil data: barn listet med både Geir og besteforeldre (som sync av alle «parent» kunne lage)
  {
    id: 'kid1',
    displayName: 'Barn 1',
    parentIds: ['odd', 'vigdis', 'geir', 'partner'],
    partnerIds: [],
    linkedRole: 'child',
  },
  {
    id: 'kid2',
    displayName: 'Barn 2',
    parentIds: ['odd', 'vigdis', 'geir', 'partner'],
    partnerIds: [],
    linkedRole: 'child',
  },
  {
    id: 'kid3',
    displayName: 'Barn 3',
    parentIds: ['odd', 'vigdis', 'geir', 'partner'],
    partnerIds: [],
    linkedRole: 'child',
  },
];

const mapMulti = indexPeople(multiGenParents);
assert.deepEqual(
  immediateParentIds(['odd', 'vigdis', 'geir', 'partner'], mapMulti).sort(),
  ['geir', 'partner'].sort(),
  'immediateParentIds skal droppe besteforeldre',
);
assert.deepEqual(
  householdParentIdsForChildren(['odd', 'vigdis', 'geir', 'partner'], mapMulti).sort(),
  ['geir', 'partner'].sort(),
);

const sanitizePatches = buildParentIdSanitizationPatches(multiGenParents);
assert.ok(sanitizePatches.has('kid1'));
assert.deepEqual(sanitizePatches.get('kid1').parentIds.sort(), ['geir', 'partner'].sort());
assert.equal(sanitizePatches.has('geir'), false, 'Geir sine foreldre skal ikke sanitizes bort');

const layoutKids = layoutFamilyTree(multiGenParents, {
  focusIds: ['geir', 'partner'],
  nodeW: 100,
  gapX: 20,
  pad: 10,
});
const byKidLayout = Object.fromEntries(layoutKids.nodes.map((n) => [n.id, n]));
assert.ok(byKidLayout.kid1.y > byKidLayout.geir.y, 'barn under Geir');
assert.equal(byKidLayout.kid1.y, byKidLayout.kid2.y);

const geirBottom = byKidLayout.geir.y + byKidLayout.geir.h;
const kidParentEdges = layoutKids.edges.filter(
  (e) => e.type === 'parent' && (e.to === 'kid1' || e.to === 'kid2' || e.to === 'kid3'),
);
assert.ok(kidParentEdges.length >= 1, 'skal ha kanter til barna');
assert.ok(
  kidParentEdges.every((e) => e.midY == null || e.midY >= geirBottom - 1),
  'barne-bus skal ligge under Geir, ikke under besteforeldre',
);
assert.ok(
  !layoutKids.edges.some(
    (e) => e.type === 'parent' && (e.from === 'odd' || e.from === 'vigdis')
      && (e.to === 'kid1' || e.to === 'kid2' || e.to === 'kid3'),
  ),
  'ingen kant fra besteforeldre direkte til barna',
);
const dropFromGeir = layoutKids.edges.find(
  (e) => e.type === 'parent' && e.kind === 'drop' && e.from === 'geir' && e.y1 >= geirBottom - 1,
);
assert.ok(dropFromGeir, 'drop fra Geir skal gå nedover fra bunnen av kortet');
assert.ok(dropFromGeir.y2 >= dropFromGeir.y1 - 1, 'drop skal ikke gå oppover til besteforeldre-nivå');

console.log('familyTreeLogic children-under-parents tests ok');

// --- Søsken sine barn skal ha egne streker, ikke én felles bar under begge ---
const siblingBranches = [
  { id: 'hat', displayName: 'Hatleskog', partnerIds: ['ove'], parentIds: [] },
  { id: 'ove', displayName: 'Ove Andersen', partnerIds: ['hat'], parentIds: [] },
  { id: 'monica', displayName: 'Monica Andersen', partnerIds: [], parentIds: ['hat', 'ove'] },
  { id: 'geir', displayName: 'Geir Ove Andersen', partnerIds: [], parentIds: ['hat', 'ove'] },
  { id: 'elias', displayName: 'Elias Andersen', partnerIds: [], parentIds: ['geir'] },
  { id: 'mina', displayName: 'Mina Andersen', partnerIds: [], parentIds: ['geir'] },
  { id: 'frida', displayName: 'Frida Andersen', partnerIds: [], parentIds: ['monica'] },
  { id: 'julie', displayName: 'Julie Andersen', partnerIds: [], parentIds: ['monica'] },
];

assert.equal(areSiblings('monica', 'geir', siblingBranches), true);
assert.deepEqual(
  nuclearParentIds(['monica', 'geir'], indexPeople(siblingBranches)),
  [],
  'søsken skal ikke være felles kjerne-foreldre',
);

const siblingLayout = layoutFamilyTree(siblingBranches, {
  focusIds: ['geir', 'monica'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
const bySib = Object.fromEntries(siblingLayout.nodes.map((n) => [n.id, n]));

// Geirs barn samlet under Geir, Monicas under Monica — ikke blandet
const geirKids = [bySib.elias, bySib.mina];
const monicaKids = [bySib.frida, bySib.julie];
const geirCenter = bySib.geir.x + bySib.geir.w / 2;
const monicaCenter = bySib.monica.x + bySib.monica.w / 2;
const geirKidsMid = (Math.min(...geirKids.map((k) => k.x)) + Math.max(...geirKids.map((k) => k.x + k.w))) / 2;
const monicaKidsMid = (Math.min(...monicaKids.map((k) => k.x)) + Math.max(...monicaKids.map((k) => k.x + k.w))) / 2;
assert.ok(
  Math.abs(geirKidsMid - geirCenter) < Math.abs(geirKidsMid - monicaCenter),
  'Geirs barn skal ligge nærmere Geir enn Monica',
);
assert.ok(
  Math.abs(monicaKidsMid - monicaCenter) < Math.abs(monicaKidsMid - geirCenter),
  'Monicas barn skal ligge nærmere Monica enn Geir',
);
assert.ok(
  Math.max(...geirKids.map((k) => k.x + k.w)) < Math.min(...monicaKids.map((k) => k.x)) - 8
    || Math.max(...monicaKids.map((k) => k.x + k.w)) < Math.min(...geirKids.map((k) => k.x)) - 8,
  'søskenfamilier skal ikke overlappe i X',
);

const childBars = siblingLayout.edges.filter(
  (e) => String(e.id).startsWith('c-bar-') && (e.id.includes('geir') || e.id.includes('monica')),
);
assert.equal(childBars.length, 2, 'skal ha to separate barne-barer');
const [barA, barB] = [...childBars].sort((a, b) => a.x1 - b.x1);
assert.ok(barA.x2 < barB.x1 - 0.5, 'barne-barer skal ikke møtes/overlappe');
assert.ok(
  !siblingLayout.edges.some((e) => e.id === 'c-bus-geir-monica' || e.id === 'c-bus-monica-geir'),
  'ingen felles bus mellom søsken-foresatte',
);

// Feil sync-data: alle barn listet med begge søsken som foreldre
const mergedSiblingParents = siblingBranches.map((p) => {
  if (!['elias', 'mina', 'frida', 'julie'].includes(p.id)) return p;
  return { ...p, parentIds: ['monica', 'geir'] };
});
const mergedPatches = buildParentIdSanitizationPatches(mergedSiblingParents);
assert.ok(mergedPatches.has('elias'));
assert.deepEqual(mergedPatches.get('elias').parentIds, [], 'sanitizer skal fjerne søsken-foresatte');
assert.deepEqual(
  householdParentIdsForChildren(['monica', 'geir'], indexPeople(siblingBranches)),
  [],
  'husstands-sync skal ikke knytte barn til begge søsken',
);

const mergedLayout = layoutFamilyTree(mergedSiblingParents, {
  focusIds: ['geir', 'monica'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
assert.ok(
  !mergedLayout.edges.some(
    (e) => e.type === 'parent' && (e.from === 'monica' || e.from === 'geir')
      && ['elias', 'mina', 'frida', 'julie'].includes(e.to),
  ),
  'ingen felles foreldre-kant fra begge søsken til barna',
);

console.log('familyTreeLogic sibling-branch separation tests ok');

// --- Tippolderforeldre: 3 foresatte uten partnerpar skal ikke bli én felles strek ---
const tippolde = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: [], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: [], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: [], parentIds: [] },
  {
    id: 'asbjorg',
    displayName: 'Asbjørg Hatleskog',
    partnerIds: [],
    parentIds: ['martine', 'ole', 'ove'],
    birthday: '1931',
  },
  {
    id: 'magna',
    displayName: 'Magna Helene Andersen',
    partnerIds: [],
    parentIds: ['martine', 'ole', 'ove'],
    birthday: '1930',
    deathDate: '2021',
  },
];

assert.deepEqual(
  nuclearParentIds(['martine', 'ole', 'ove'], indexPeople(tippolde)),
  [],
  '3+ foresatte uten partnerpar er ikke én kjernefamilie',
);
const tippoldePatches = buildParentIdSanitizationPatches(tippolde);
assert.deepEqual(tippoldePatches.get('asbjorg')?.parentIds, []);
assert.deepEqual(tippoldePatches.get('magna')?.parentIds, []);

const tippoldeLayout = layoutFamilyTree(tippolde, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
assert.ok(
  !tippoldeLayout.edges.some((e) => e.type === 'parent' && String(e.id).includes('martine-ole-ove')),
  'ingen felles bus/bar over Martine+Ole+Ove',
);
assert.ok(
  !tippoldeLayout.edges.some(
    (e) => e.type === 'parent'
      && (e.from === 'martine' || e.from === 'ole' || e.from === 'ove')
      && (e.to === 'asbjorg' || e.to === 'magna'),
  ),
  'ingen foreldre-kant fra tippolde til begge når parentIds er tvetydige',
);

// Korrekt: Asbjørg under Martine+Ove, Magna under Ole — egne streker
const tippoldeOk = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: ['ove'], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: ['martine'], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: [], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ove'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole'] },
];
const tippoldeOkLayout = layoutFamilyTree(tippoldeOk, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
assert.ok(
  tippoldeOkLayout.edges.some((e) => e.id === 'c-bus-martine-ove' || e.id === 'c-bus-ove-martine'),
  'Martine+Ove skal ha egen bus til Asbjørg',
);
assert.ok(
  tippoldeOkLayout.edges.some((e) => e.to === 'magna' && e.from === 'ole'),
  'Ole skal kobles til Magna',
);
assert.ok(
  !tippoldeOkLayout.edges.some((e) => e.type === 'parent' && e.from === 'ole' && e.to === 'asbjorg'),
  'Ole skal ikke kobles til Asbjørg',
);
assert.ok(
  !tippoldeOkLayout.edges.some(
    (e) => e.type === 'parent' && (e.from === 'martine' || e.from === 'ove') && e.to === 'magna',
  ),
  'Martine/Ove skal ikke kobles til Magna',
);
assert.ok(
  !tippoldeOkLayout.edges.some((e) => String(e.id).startsWith('c-bar-') && e.id.includes('martine') && e.id.includes('ole')),
  'ingen felles barne-bar på tvers av tippolde-linjene',
);

console.log('familyTreeLogic tippolde separation tests ok');

// --- Overlappende tippolde-par (Martine–Ole og Ole–Ove) skal ikke lage én strek ---
const tippoldeOverlap = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: [], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: [], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: [], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ole'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole', 'ove'] },
];
const overlapLayout = layoutFamilyTree(tippoldeOverlap, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
const overlapBuses = overlapLayout.edges.filter((e) => String(e.id).startsWith('c-bus-'));
assert.equal(overlapBuses.length, 0, 'ingen foreldre-bus uten partnerpar');
assert.ok(
  overlapLayout.edges.some((e) => e.type === 'parent' && e.from === 'martine' && e.to === 'asbjorg'),
  'Martine skal fortsatt kobles til Asbjørg',
);
assert.ok(
  overlapLayout.edges.some((e) => e.type === 'parent' && e.from === 'ove' && e.to === 'magna'),
  'Ove skal fortsatt kobles til Magna',
);
// Ingen sammenhengende bus-span over alle tre tippolde
const parentHoriz = overlapLayout.edges.filter((e) => e.type === 'parent' && e.kind === 'bus');
assert.ok(
  parentHoriz.every((e) => Math.abs(e.x2 - e.x1) < 200),
  'ingen lang horisontal over Martine+Ole+Ove',
);
const byOverlap = Object.fromEntries(overlapLayout.nodes.map((n) => [n.id, n]));
assert.equal(byOverlap.martine.y, byOverlap.ole.y);
assert.ok(byOverlap.asbjorg.y > byOverlap.martine.y);

console.log('familyTreeLogic tippolde overlap bus tests ok');

// --- Overlappende tippolde: H-albuer må ikke smelte til én sammenhengende tråd ---
function longestMergedHorizSpan(layout) {
  const segs = [];
  for (const e of layout.edges) {
    if (e.type !== 'parent') continue;
    for (const s of parentEdgeSegments(e)) {
      if (s.orient !== 'h') continue;
      segs.push({
        y: Math.round(Number(s.y) * 10) / 10,
        a: Math.min(s.x1, s.x2),
        b: Math.max(s.x1, s.x2),
      });
    }
  }
  const byY = new Map();
  segs.forEach((s) => {
    if (!byY.has(s.y)) byY.set(s.y, []);
    byY.get(s.y).push([s.a, s.b]);
  });
  let longest = 0;
  for (const ranges of byY.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    let cur = [...ranges[0]];
    for (let i = 1; i < ranges.length; i += 1) {
      const r = ranges[i];
      if (r[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], r[1]);
      else {
        longest = Math.max(longest, cur[1] - cur[0]);
        cur = [...r];
      }
    }
    longest = Math.max(longest, cur[1] - cur[0]);
  }
  return longest;
}

const tippoldeThread = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: [], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: [], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: [], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ole'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole', 'ove'] },
];
const threadLayout = layoutFamilyTree(tippoldeThread, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
const tippoldeSpan = (() => {
  const by = Object.fromEntries(threadLayout.nodes.map((n) => [n.id, n]));
  const xs = ['martine', 'ole', 'ove'].map((id) => by[id].x + by[id].w / 2);
  return Math.max(...xs) - Math.min(...xs);
})();
assert.ok(
  longestMergedHorizSpan(threadLayout) < tippoldeSpan - 20,
  'H-albuer under tippolde skal ikke smelte til én tråd over Martine–Ole–Ove',
);

/** True hvis en sammenslått H-tråd dekker begge personers midtpunkt. */
function horizCoversBoth(layout, idA, idB, { includePartner = false } = {}) {
  const by = Object.fromEntries(layout.nodes.map((n) => [n.id, n]));
  const xa = by[idA].x + by[idA].w / 2;
  const xb = by[idB].x + by[idB].w / 2;
  const lo = Math.min(xa, xb);
  const hi = Math.max(xa, xb);
  const segs = [];
  for (const e of layout.edges) {
    if (includePartner && e.type === 'partner') {
      segs.push({
        y: Math.round(((e.y1 + e.y2) / 2) * 10) / 10,
        a: Math.min(e.x1, e.x2),
        b: Math.max(e.x1, e.x2),
      });
      continue;
    }
    if (e.type !== 'parent') continue;
    for (const s of parentEdgeSegments(e)) {
      if (s.orient !== 'h') continue;
      segs.push({
        y: Math.round(Number(s.y) * 10) / 10,
        a: Math.min(s.x1, s.x2),
        b: Math.max(s.x1, s.x2),
      });
    }
  }
  const byY = new Map();
  segs.forEach((s) => {
    if (!byY.has(s.y)) byY.set(s.y, []);
    byY.get(s.y).push([s.a, s.b]);
  });
  for (const ranges of byY.values()) {
    ranges.sort((a, b) => a[0] - b[0]);
    let cur = [...ranges[0]];
    for (let i = 1; i < ranges.length; i += 1) {
      const r = ranges[i];
      if (r[0] <= cur[1] + 1) cur[1] = Math.max(cur[1], r[1]);
      else {
        if (cur[0] <= lo + 1 && cur[1] >= hi - 1) return true;
        cur = [...r];
      }
    }
    if (cur[0] <= lo + 1 && cur[1] >= hi - 1) return true;
  }
  return false;
}

// Stems med samme midY gjenskapte Martine–Ole / Ole–Ove «bus» uten partnerpar
assert.equal(
  horizCoversBoth(threadLayout, 'martine', 'ole'),
  false,
  'Martine–Ole skal ikke få felles H-albue (falsk par-bus)',
);
assert.equal(
  horizCoversBoth(threadLayout, 'ole', 'ove'),
  false,
  'Ole–Ove skal ikke få felles H-albue (falsk par-bus)',
);

// Samme bug når Ole er partner med begge (dobbel bus + abutende partnerlinjer)
const tippoldeDualPartner = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: ['ole'], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: ['martine', 'ove'], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: ['ole'], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ole'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole', 'ove'] },
];
const dualLayout = layoutFamilyTree(tippoldeDualPartner, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
assert.equal(
  dualLayout.edges.filter((e) => String(e.id).startsWith('c-bus-')).length,
  0,
  'par som deler Ole skal ikke tegne foreldre-bus (unngår sammenhengende tråd)',
);
assert.ok(
  longestMergedHorizSpan(dualLayout) < tippoldeSpan - 20,
  'dobbel-partner tippolde skal heller ikke ha én lang H-tråd',
);
assert.ok(
  dualLayout.edges.some((e) => e.type === 'parent' && e.to === 'asbjorg'),
  'Asbjørg skal fortsatt ha foreldre-kant',
);
assert.ok(
  dualLayout.edges.some((e) => e.type === 'parent' && e.to === 'magna'),
  'Magna skal fortsatt ha foreldre-kant',
);
assert.equal(
  horizCoversBoth(dualLayout, 'martine', 'ole'),
  false,
  'dobbel-partner: ingen falsk Martine–Ole foreldre-bus via stems',
);
assert.equal(
  horizCoversBoth(dualLayout, 'ole', 'ove'),
  false,
  'dobbel-partner: ingen falsk Ole–Ove foreldre-bus via stems',
);
// Partnerlinjer på samme Y limte Martine–Ole–Ove til én strek i skjermbildet
assert.equal(
  horizCoversBoth(dualLayout, 'martine', 'ove', { includePartner: true }),
  false,
  'partnerlinjer for Ole×2 skal ikke smelte til én tråd over Martine–Ole–Ove',
);
const dualPartnerYs = dualLayout.edges
  .filter((e) => e.type === 'partner')
  .map((e) => e.y1);
assert.ok(
  dualPartnerYs.length === 2 && dualPartnerYs[0] !== dualPartnerYs[1],
  'Ole sine to partnerlinjer skal ligge på ulike Y',
);

console.log('familyTreeLogic tippolde continuous-thread tests ok');

// --- Auto-heal tippolde-hub via navn (Ove … / Johnsen + Martine Johnsen) ---
assert.equal(
  likelySpousesByName(
    { displayName: 'Martine Johnsen' },
    { displayName: 'Ove Olsen / Johnsen' },
  ),
  true,
  'Ove / Johnsen + Martine Johnsen er sannsynlig ektepar',
);
assert.equal(
  likelySpousesByName(
    { displayName: 'Ole Olsen' },
    { displayName: 'Ove Olsen / Johnsen' },
  ),
  false,
  'Ole Olsen + Ove Olsen / Johnsen er ikke ektepar via / Johnsen',
);

const tippoldeHubData = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: [], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: [], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: [], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ole'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole', 'ove'] },
];
const hubPatches = buildParentIdSanitizationPatches(tippoldeHubData);
assert.deepEqual(
  hubPatches.get('asbjorg')?.parentIds?.slice().sort(),
  ['martine', 'ove'],
  'Asbjørg skal under Martine+Ove etter tippolde-heal',
);
assert.deepEqual(
  hubPatches.get('magna')?.parentIds,
  ['ole'],
  'Magna skal kun under Ole etter tippolde-heal',
);
assert.ok(
  hubPatches.get('martine')?.partnerIds?.includes('ove'),
  'Martine skal knyttes som partner til Ove',
);
assert.ok(
  hubPatches.get('ove')?.partnerIds?.includes('martine'),
  'Ove skal knyttes som partner til Martine',
);

const healedPeople = tippoldeHubData.map((p) => {
  const patch = hubPatches.get(p.id);
  if (!patch) return p;
  return {
    ...p,
    ...(patch.parentIds ? { parentIds: patch.parentIds } : {}),
    ...(patch.partnerIds ? { partnerIds: patch.partnerIds } : {}),
  };
});
const healedLayout = layoutFamilyTree(healedPeople, {
  focusIds: ['asbjorg', 'magna'],
  nodeW: 120,
  gapX: 24,
  pad: 16,
});
assert.ok(
  healedLayout.edges.some((e) => e.id === 'c-bus-martine-ove' || e.id === 'c-bus-ove-martine'),
  'etter heal: Martine+Ove bus til Asbjørg',
);
assert.ok(
  healedLayout.edges.some((e) => e.to === 'magna' && e.from === 'ole'),
  'etter heal: Ole → Magna',
);
assert.ok(
  !healedLayout.edges.some((e) => e.type === 'parent' && e.from === 'ole' && e.to === 'asbjorg'),
  'etter heal: Ole ikke koblet til Asbjørg',
);
assert.ok(
  !healedLayout.edges.some(
    (e) => e.type === 'parent' && (e.from === 'martine' || e.from === 'ove') && e.to === 'magna',
  ),
  'etter heal: Martine/Ove ikke koblet til Magna',
);

// Ikke omkoble når Ole faktisk er partner med begge
const dualPartnerData = [
  { id: 'martine', displayName: 'Martine Johnsen', partnerIds: ['ole'], parentIds: [] },
  { id: 'ole', displayName: 'Ole Olsen', partnerIds: ['martine', 'ove'], parentIds: [] },
  { id: 'ove', displayName: 'Ove Olsen / Johnsen', partnerIds: ['ole'], parentIds: [] },
  { id: 'asbjorg', displayName: 'Asbjørg Hatleskog', partnerIds: [], parentIds: ['martine', 'ole'] },
  { id: 'magna', displayName: 'Magna Helene Andersen', partnerIds: [], parentIds: ['ole', 'ove'] },
];
const dualPatches = buildParentIdSanitizationPatches(dualPartnerData);
assert.equal(
  dualPatches.has('asbjorg'),
  false,
  'ekte dobbel-partner skal ikke auto-heales som tippolde-hub',
);
assert.equal(dualPatches.has('magna'), false);

console.log('familyTreeLogic tippolde hub heal tests ok');
