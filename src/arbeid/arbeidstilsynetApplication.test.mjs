/**
 * Ferdig utkast til søknad om utvidet overtid hos Arbeidstilsynet (aml. § 10-6 (6)).
 */
import assert from 'node:assert/strict';
import { checkWorkingTime } from './workingTimeRules.js';
import {
  ARBEIDSTILSYNET_MAX,
  buildArbeidstilsynetApplication,
  suggestedFrame,
  weeklyOvertime,
} from './arbeidstilsynetApplication.js';

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function week(monday, hours) {
  return hours.map((h, i) => (h ? { id: `e1_${addDays(monday, i)}`, employeeId: 'e1', projectId: 'p1', date: addDays(monday, i), hours: h } : null)).filter(Boolean);
}

// Tre uker med 12 t i fem dager: 20 t overtid per uke.
const entries = [
  ...week('2026-10-12', [12, 12, 12, 12, 12]),
  ...week('2026-10-19', [12, 12, 12, 12, 12]),
  ...week('2026-10-26', [12, 12, 12, 12, 12]),
];
const result = checkWorkingTime(entries, { employeeId: 'e1' });

{
  const weekly = weeklyOvertime(entries, { employeeId: 'e1', through: '2026-11-04', weeks: 8 });
  assert.equal(weekly.length, 8);
  assert.equal(weekly[weekly.length - 1].from, '2026-11-02', 'siste uke starter mandag');
  assert.equal(weekly[weekly.length - 2].overtime, 20);
  const frame = suggestedFrame(result, weekly);
  assert.equal(frame.overtime7d, 20);
  assert.ok(frame.overtime26w <= ARBEIDSTILSYNET_MAX.overtime26w);
  assert.ok(frame.overtime26w >= frame.overtime7d);
}

// Rammen går aldri over det Arbeidstilsynet kan gi.
{
  const huge = suggestedFrame({ totals: { overtime7d: 40 } }, [{ overtime: 40 }, { overtime: 40 }]);
  assert.deepEqual(huge, { overtime7d: 25, overtime26w: 200 });
}

{
  const draft = buildArbeidstilsynetApplication({
    company: { navn: 'Bygg AS', organisasjonsnummer: '912345678', forretningsadresse: { adresse: ['Storgata 1'], postnummer: '0155', poststed: 'Oslo' } },
    employee: { id: 'e1', name: 'Kari Nordmann', position: 'Tømrer' },
    result,
    entries,
    applicant: { name: 'Per Leder', email: 'per@bygg.no' },
    today: '2026-11-04',
  });
  assert.match(draft.subject, /§ 10-6 \(6\) – Bygg AS, org\.nr\. 912345678/);
  assert.equal(draft.start, '2026-12-02', 'tidligst fire uker fram');
  assert.equal(draft.sendBy, '2026-11-04');
  assert.deepEqual(draft.sections.map((row) => row.id), ['to', 'company', 'request', 'reason', 'health', 'consultation', 'hours']);
  const byId = Object.fromEntries(draft.sections.map((row) => [row.id, row.text]));
  assert.match(byId.to, /Til: Arbeidstilsynet/);
  assert.match(byId.company, /Storgata 1, 0155 Oslo/);
  assert.match(byId.company, /Per Leder, per@bygg\.no/);
  assert.match(byId.company, /Bundet av tariffavtale: Nei/);
  assert.match(byId.request, /inntil 20 timer i løpet av sju dager/);
  assert.match(byId.request, /Kari Nordmann, Tømrer/);
  assert.match(byId.request, /§ 10-6 \(7\)/);
  assert.match(byId.reason, /ikke bundet av tariffavtale/);
  assert.match(byId.reason, /siste fire uker/);
  assert.match(byId.health, /§ 10-8/);
  assert.match(byId.consultation, /Referat signert av partene er vedlagt/);
  assert.match(byId.hours, /Uke 26\.10\.2026–01\.11\.2026: 60 t arbeid, 20 t overtid/);
  assert.ok(draft.checklist.some((row) => /Referat/.test(row)));
  assert.match(draft.fullText, /^MOTTAKER OG EMNE/);
  assert.match(draft.fullText, /VEDLEGG/);
  assert.match(draft.fullText, /Med vennlig hilsen\nPer Leder\nBygg AS$/);
}

// Med tariffavtale, og uten opplysninger: tydelige felt å fylle inn.
{
  const draft = buildArbeidstilsynetApplication({ company: { workingTime: { tariffBound: true } }, result, entries, today: '2026-11-04' });
  const reason = draft.sections.find((row) => row.id === 'reason').text;
  assert.match(reason, /bundet av tariffavtale\. Behovet går ut over/);
  assert.match(draft.subject, /\[bedriftens navn\]/);
  assert.match(draft.sections.find((row) => row.id === 'company').text, /Bundet av tariffavtale: Ja/);
}

console.log('arbeidstilsynetApplication: ok');
