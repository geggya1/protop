import assert from 'node:assert/strict';
import {
  ackFor,
  ackStatus,
  addChapter,
  bodyBlocks,
  chaptersFromText,
  draftChanged,
  emptyHandbook,
  moveChapter,
  normalizeHandbook,
  openPlaceholders,
  placeholderParts,
  publishHandbook,
  removeChapter,
  setChapter,
  standardHandbookChapters,
} from './handbook.js';
import { emptyHrState, employeeVisibleSlice, hrStateHasData, normalizeHrState } from './model.js';

/* Standardhåndboken */
const standard = standardHandbookChapters();
assert.ok(standard.length >= 12, 'standardhåndboken har alle hovedkapitlene');
assert.equal(new Set(standard.map((row) => row.id)).size, standard.length);
assert.ok(standard.some((row) => /Likestilling/.test(row.title)), 'likestilling er eget kapittel');
assert.ok(openPlaceholders(standard).length > 10, 'bedriftens egne valg er gule plassholdere');
const text = JSON.stringify(standard);
assert.ok(!/Consult1|Smartplan|Rolandsen|Trones/.test(text), 'ingen navn fra en bestemt bedrift');

/* Visning */
assert.deepEqual(bodyBlocks('## Tittel\nAvsnitt en\nfortsetter\n\n• a\n• b\n\nSlutt'), [
  { kind: 'h', text: 'Tittel' },
  { kind: 'p', text: 'Avsnitt en fortsetter' },
  { kind: 'ul', items: ['a', 'b'] },
  { kind: 'p', text: 'Slutt' },
]);
assert.deepEqual(placeholderParts('Ferie [[5 uker]] i året'), [
  { text: 'Ferie ', mark: false },
  { text: '5 uker', mark: true },
  { text: ' i året', mark: false },
]);

/* Redigering og publisering */
let hb = normalizeHandbook({ chapters: [{ id: 'a', title: 'Arbeidstid', body: 'Fra [[07.00]]' }] });
assert.equal(draftChanged(hb), true);
const blocked = publishHandbook(hb, { by: 'Kari' });
assert.equal(blocked.ok, false);
assert.match(blocked.error, /gule felt/);
hb = setChapter(hb, 'a', { body: 'Fra 07.00' });
let res = publishHandbook(hb, { by: 'Kari', reason: 'Første', now: new Date('2026-10-26T10:00:00Z') });
assert.equal(res.ok, true);
hb = res.handbook;
assert.equal(hb.published.version, 1);
assert.equal(hb.revisions[0].reason, 'Første');
assert.equal(draftChanged(hb), false);
assert.equal(publishHandbook(hb).ok, false, 'ingen endringer gir ingen ny versjon');
const added = addChapter(hb, { title: 'Ferie', after: 'a' });
hb = added.handbook;
assert.equal(hb.chapters[1].title, 'Ferie');
hb = moveChapter(hb, added.chapter.id, -1);
assert.equal(hb.chapters[0].title, 'Ferie');
assert.equal(hb.published.chapters.length, 1, 'publisert versjon endres ikke av utkastet');
res = publishHandbook(hb, { by: 'Kari' });
assert.equal(res.handbook.published.version, 2);
assert.equal(removeChapter(res.handbook, added.chapter.id).chapters.length, 1);

/* Lesebekreftelse */
const employees = [
  { id: 'e1', personUid: 'u1', person: { firstName: 'Ola', lastName: 'Nordmann' } },
  { id: 'e2', person: { firstName: 'Kari', lastName: 'Nordmann' } },
];
const acks = [ackFor({ uid: 'u1', employeeId: 'e1', name: 'Ola' }, 1), ackFor({ employeeId: 'e2', name: 'Kari' }, 2)];
const status = ackStatus(employees, acks, 2);
assert.equal(status[0].current, false, 'Ola har bare lest versjon 1');
assert.equal(status[0].latest.version, 1);
assert.equal(status[1].current, true);
assert.equal(status[1].name, 'Kari Nordmann');

/* Innlesing */
const imported = chaptersFromText(`Innholdsregister
1. ARBEIDSTID ........................ 3
1. Arbeidstid
Normal arbeidstid er 8 timer.
1.1 Fleksitid
Kjernetid kl. 9–15.
Våre verdier er:
1. Ansvar
2. Respekt
2. Ferie
• Fem uker
• Tre i sommer`);
assert.deepEqual(imported.map((row) => row.title), ['Arbeidstid', 'Ferie']);
assert.match(imported[0].body, /## Fleksitid/);
assert.match(imported[0].body, /• 1\. Ansvar/);
assert.match(imported[1].body, /• Fem uker\n• Tre i sommer/);

/* HR-tilstand */
assert.deepEqual(normalizeHrState({}).handbook, emptyHandbook());
assert.equal(hrStateHasData({ handbook: { chapters: [{ title: 'A', body: '' }] } }), true, 'håndbok alene er data som skal lagres');
const slice = employeeVisibleSlice({ ...emptyHrState(), handbook: res.handbook }, 'e1');
assert.equal(slice.handbook.version, 2, 'ansatte ser publisert versjon');
assert.equal(employeeVisibleSlice({ ...emptyHrState(), handbook: { chapters: [{ title: 'Utkast', body: 'x' }] } }, 'e1').handbook, null, 'utkast er ikke synlig for ansatte');

console.log('hr/handbook.test.mjs ok');
