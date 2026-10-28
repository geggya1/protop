import assert from 'node:assert/strict';
import {
  addChapter,
  applyHandbookFix,
  bodyBlocks,
  handbookLegalIssues,
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

/* Lovkravene i standardhåndboken (L-15) */
{
  // Overtidstillegget avhenger ikke av at kunden betaler (AML § 10-6 (11)).
  assert.ok(!/normalt når oppdragsgiver betaler/.test(text));
  const work = standard.find((row) => row.title === 'Arbeidsforhold og arbeidstid');
  assert.match(work.body, /minst 40 % av timelønnen/);
  assert.match(work.body, /leder har godtatt eller kjent til/);
  // Vernet mot gjengjeldelse gjelder all forsvarlig varsling.
  assert.ok(!/varsler i god tro aksepteres ikke/.test(text));
  assert.match(text, /Gjengjeldelse mot den som varsler, er forbudt \(arbeidsmiljøloven § 2 A-4\)/);
  // Egne kapitler for varsling, personvern, kontrolltiltak og HMS-kort, sist så id-ene over står fast.
  const titles = standard.map((row) => row.title);
  assert.deepEqual(titles.slice(-4), ['Varsling av kritikkverdige forhold', 'Personvern for ansatte', 'Kontrolltiltak', 'HMS-kort og adgang til byggeplass']);
  assert.equal(standard.find((row) => row.title === 'Ferie').id, 'std_10');
  const varsling = standard.find((row) => /Varsling/.test(row.title)).body;
  for (const part of ['§ 2 A-1', '§ 2 A-2', '§ 2 A-3', 'innleide', 'Arbeidstilsynet', 'anonym', 'tilbakemelding']) {
    assert.ok(varsling.includes(part), part);
  }
  const privacy = standard.find((row) => row.title === 'Personvern for ansatte').body;
  assert.match(privacy, /artikkel 13/);
  assert.match(privacy, /Datatilsynet/);
  const control = standard.find((row) => row.title === 'Kontrolltiltak').body;
  assert.match(control, /§ 9-1/);
  assert.match(control, /§ 9-2/);
  assert.match(control, /innsyn i e-postkasse/);
  assert.deepEqual(handbookLegalIssues({ chapters: standard }), [], 'standardhåndboken består lovsjekken');
}

/* Lovsjekk av en håndbok som er i bruk */
{
  const old = normalizeHandbook({
    chapters: [
      { id: 'a', title: 'Arbeidstid', body: '## Overtid og mertid\nOvertid kompenseres når den er pålagt skriftlig av nærmeste leder på forhånd, normalt når oppdragsgiver betaler for det. Det betales [[50 %]] tillegg.' },
      { id: 'b', title: 'Likestilling', body: 'Henvendelser behandles forsvarlig. Gjengjeldelse mot den som varsler i god tro aksepteres ikke. Slutt.' },
    ],
  });
  const issues = handbookLegalIssues(old);
  assert.deepEqual(issues.map((row) => row.id), ['overtimeCustomer', 'goodFaith', 'varsling', 'personvern', 'kontrolltiltak', 'hmsKort']);
  assert.equal(issues[0].chapterId, 'a');
  assert.match(issues[0].text, /§ 10-6 \(11\)/);
  let fixed = old;
  for (const issue of issues) fixed = applyHandbookFix(fixed, issue.id, { now: new Date('2026-10-27T10:00:00Z') });
  assert.deepEqual(handbookLegalIssues(fixed), []);
  assert.equal(fixed.changedAt, '2026-10-27T10:00:00.000Z');
  assert.match(fixed.chapters[0].body, /^## Overtid og mertid\nOvertid er arbeid utover lovens grenser/);
  assert.match(fixed.chapters[0].body, /Det betales \[\[50 %\]\] tillegg\.$/, 'resten av teksten står');
  assert.equal(fixed.chapters[1].body, 'Henvendelser behandles forsvarlig. Gjengjeldelse mot den som varsler, er forbudt (arbeidsmiljøloven § 2 A-4). Slutt.');
  assert.equal(fixed.chapters.length, 6);
  assert.deepEqual(applyHandbookFix(old, 'ukjent'), old, 'ukjent funn endrer ingenting');
}

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
