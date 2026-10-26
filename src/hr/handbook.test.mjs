import assert from 'node:assert/strict';
import {
  addChapter,
  bodyBlocks,
  chaptersFromText,
  emptyHandbook,
  moveChapter,
  normalizeHandbook,
  openPlaceholders,
  placeholderParts,
  removeChapter,
  setChapter,
  standardHandbookChapters,
} from './handbook.js';
import { handbookHash, handbookSnapshot } from '../doccontrol/content.js';
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

/* Redigering. Versjon og godkjenning ligger i dokumentstyringen (se src/doccontrol). */
let hb = normalizeHandbook({ chapters: [{ id: 'a', title: 'Arbeidstid', body: 'Fra [[07.00]]' }] });
assert.equal(openPlaceholders(hb.chapters).length, 1, 'gule felt må bekreftes før innsending');
const before = handbookHash(hb);
hb = setChapter(hb, 'a', { body: 'Fra 07.00' });
assert.equal(openPlaceholders(hb.chapters).length, 0);
assert.notEqual(handbookHash(hb), before, 'endret tekst gir ny sjekksum, og dermed ny revisjon');
const added = addChapter(hb, { title: 'Ferie', after: 'a' });
hb = added.handbook;
assert.equal(hb.chapters[1].title, 'Ferie');
hb = moveChapter(hb, added.chapter.id, -1);
assert.equal(hb.chapters[0].title, 'Ferie');
assert.deepEqual(handbookSnapshot(hb).chapters.map((row) => row.title), ['Ferie', 'Arbeidstid']);
assert.equal(removeChapter(hb, added.chapter.id).chapters.length, 1);
assert.equal(normalizeHandbook({ chapters: [], published: { version: 3 } }).published, undefined, 'publisering ligger ikke lenger i HR-tilstanden');

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
assert.equal(employeeVisibleSlice({ ...emptyHrState(), handbook: hb }, 'e1').handbook, undefined, 'utkastet er HR-internt. Ansatte leser godkjent versjon fra dokumentstyringen');

console.log('hr/handbook.test.mjs ok');
