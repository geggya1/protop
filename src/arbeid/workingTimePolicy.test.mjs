/**
 * Tariffavtale for arbeidstid (§ 10-6 (5) og (9)), varsel til ledelsen og forslag om å søke
 * Arbeidstilsynet om utvidet ramme (§ 10-6 (6)).
 */
import assert from 'node:assert/strict';
import { TARIFF_LIMITS, checkWorkingTime } from './workingTimeRules.js';
import {
  arbeidstilsynetSuggestion,
  companyWorkingTime,
  withWorkingTime,
  workingTimeAlertRecipients,
  workingTimeAlerts,
  workingTimeFocusText,
  workingTimeOptions,
} from './workingTimePolicy.js';

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function week(monday, hours, employeeId = 'e1') {
  return hours.map((h, i) => (h ? { id: `${employeeId}_${addDays(monday, i)}`, employeeId, projectId: 'p1', date: addDays(monday, i), hours: h } : null)).filter(Boolean);
}

const warns = (result) => result.warnings.filter((row) => row.level === 'warn').map((row) => row.rule);

// Innstillingen: standard er av.
assert.deepEqual(companyWorkingTime({}), { tariffBound: false });
assert.deepEqual(companyWorkingTime(null), { tariffBound: false });
assert.deepEqual(companyWorkingTime({ workingTime: { tariffBound: 'ja' } }), { tariffBound: false }, 'bare true slår på');
assert.deepEqual(workingTimeOptions({ workingTime: { tariffBound: true } }), { tariff: true });
const saved = withWorkingTime({ navn: 'AS', workingTime: { tariffBound: false } }, { tariffBound: true });
assert.equal(saved.navn, 'AS');
assert.equal(saved.workingTime.tariffBound, true);
assert.match(workingTimeFocusText({}), /10 t på sju dager/);
assert.match(workingTimeFocusText({ workingTime: { tariffBound: true } }), /20 t på sju dager.*16 t/);

// Tariffgrensene.
assert.deepEqual(TARIFF_LIMITS, { overtime7d: 20, overtime4w: 50, overtime52w: 300, dayTotal: 16 });

// 12 t i fem dager gir 20 t overtid: over 10 uten tariff, akkurat 20 med tariff.
{
  const entries = week('2026-10-19', [12, 12, 12, 12, 12]);
  const plain = checkWorkingTime(entries);
  assert.ok(warns(plain).includes('overtime7d'));
  assert.equal(plain.warnings.find((row) => row.rule === 'overtime7d').ref, 'AML § 10-6 (4)');
  const tariff = checkWorkingTime(entries, { tariff: true });
  assert.ok(!warns(tariff).includes('overtime7d'), '15 t er innenfor 20 t med tariffavtale');
  const consent = tariff.warnings.find((row) => row.rule === 'consent7d');
  assert.ok(consent, 'over grunngrensen gir info om samtykke');
  assert.equal(consent.level, 'info');
  assert.equal(consent.ref, 'AML § 10-6 (7)');
  assert.equal(tariff.tariff, true);
}

// Døgngrensen: 14 t er over 13, men innenfor 16 med tariff (§ 10-6 (9)).
{
  const entries = week('2026-10-19', [14]);
  assert.ok(warns(checkWorkingTime(entries)).includes('dayTotal'));
  assert.ok(!warns(checkWorkingTime(entries, { tariff: true })).includes('dayTotal'));
  const over = checkWorkingTime(week('2026-10-19', [17]), { tariff: true });
  assert.equal(over.warnings.find((row) => row.rule === 'dayTotal').ref, 'AML § 10-6 (9)');
}

// Mottakere: eier, administratorer og ansatte med nivå Øverste leder eller Administrator.
{
  const family = { ownerUid: 'owner', adminUids: ['admin1'] };
  const employees = [
    { id: 'a', personUid: 'boss', company: { accessLevel: 'leder' } },
    { id: 'b', personUid: 'it', company: { accessLevel: 'administrator' } },
    { id: 'c', personUid: 'dept', company: { accessLevel: 'avdelingsleder' } },
    { id: 'd', personUid: 'staff', company: { accessLevel: 'ansatt' } },
    { id: 'e', company: { accessLevel: 'leder' } },
  ];
  const got = workingTimeAlertRecipients({ family, employees, exclude: ['admin1'] }).sort();
  assert.deepEqual(got, ['boss', 'it', 'owner']);
}

// Varsler: bare overskridelser der dagen som ble ført, er med, med fast id.
{
  const entries = week('2026-10-19', [12, 12, 12, 12, 12]);
  const result = checkWorkingTime(entries, { employeeId: 'e1' });
  const alerts = workingTimeAlerts(result, { employeeId: 'e1', employeeName: 'Kari', dates: ['2026-10-23'] });
  assert.ok(alerts.length >= 1);
  const ot = alerts.find((row) => row.rule === 'overtime7d');
  assert.ok(ot);
  assert.match(ot.id, /^wt_e1_overtime7d_\d{4}-\d{2}-\d{2}$/);
  assert.match(ot.title, /Kari/);
  assert.match(ot.body, /Timene er lagret/);
  assert.match(ot.body, /Arbeidstilsynet/);
  assert.match(ot.text, /overtid på sju dager.*AML § 10-6 \(4\)\.$/);
  assert.deepEqual(workingTimeAlerts(result, { employeeId: 'e1', dates: ['2026-09-01'] }), [], 'en annen dag gir ikke varsel');
  assert.deepEqual(workingTimeAlerts(result, { employeeId: 'e1', dates: [] }), []);
  // Info om vanlig overtid sendes ikke.
  const mild = checkWorkingTime(week('2026-10-19', [10]), { employeeId: 'e1' });
  assert.deepEqual(workingTimeAlerts(mild, { employeeId: 'e1', dates: ['2026-10-19'] }), []);
}

// Forslag om Arbeidstilsynet: ved overskridelse, og når fire uker nærmer seg rammen.
{
  assert.equal(arbeidstilsynetSuggestion(checkWorkingTime(week('2026-10-19', [8, 8, 8, 8, 8]))), null);
  const over = arbeidstilsynetSuggestion(checkWorkingTime(week('2026-10-19', [12, 12, 12, 12, 12])));
  assert.equal(over.reason, 'over');
  assert.equal(over.ref, 'AML § 10-6 (6)');
  assert.match(over.text, /fire uker før/);
  assert.match(over.url, /^https:\/\/www\.arbeidstilsynet\.no\//);
  // 8 t overtid per uke i tre uker = 24 t på fire uker: over 80 % av 25, ingen grense brutt.
  const near = checkWorkingTime([
    ...week('2026-10-05', [11, 11, 11, 11]),
    ...week('2026-10-12', [11, 11, 11, 11]),
    ...week('2026-10-19', [11, 11, 11, 11]),
  ]);
  assert.deepEqual(warns(near).filter((rule) => rule.startsWith('overtime')), []);
  assert.equal(arbeidstilsynetSuggestion(near).reason, 'near');
}

console.log('workingTimePolicy: ok');
