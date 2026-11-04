import assert from 'node:assert/strict';
import {
  addMonths,
  calendarDays,
  caseAbsenceDays,
  childCareQuota,
  employerPeriods,
  followUpDeadlines,
  followUpQueue,
  missingSickNotes,
  selfCertMaxDays,
  selfCertStatus,
  sickKind,
  sickLeaveStats,
  sickOccasions,
  validateSickNote,
} from './sickLeave.js';

const emp = { id: 'e1', company: { periodFrom: '2025-01-06', workPercent: '100' } };

function day(date, type = 'egenmelding', extra = {}) {
  return { id: `${type}_${date}`, employeeId: 'e1', date, hours: 7.5, type, ...extra };
}

// Typer og datohjelpere
{
  assert.equal(sickKind('egenmelding'), 'self');
  assert.equal(sickKind('syk_melding'), 'doctor');
  assert.equal(sickKind('sykt_barn'), 'child');
  assert.equal(sickKind('ferie'), '');
  assert.equal(sickKind('egen', [{ id: 'egen', category: 'Sykdom', paid: true }]), 'doctor');
  assert.equal(calendarDays('2026-03-06', '2026-03-09'), 4);
  assert.equal(addMonths('2025-12-31', 2), '2026-02-28');
}

// Fredag og mandag er samme tilfelle, og helgen telles som kalenderdager.
{
  const occ = sickOccasions([day('2026-03-06'), day('2026-03-09')], 'e1');
  assert.equal(occ.length, 1);
  assert.equal(occ[0].calendarDays, 4);
  assert.equal(occ[0].workDays, 2);
  assert.equal(occ[0].selfOnly, true);
  const split = sickOccasions([day('2026-03-03'), day('2026-03-05')], 'e1');
  assert.equal(split.length, 2);
}

// Egenmelding: tre kalenderdager, utvidelse bare etter drøfting.
{
  assert.equal(selfCertMaxDays({}), 3);
  assert.equal(selfCertMaxDays({ extendedSelfCert: true, extendedDays: 8 }), 3);
  assert.equal(selfCertMaxDays({ extendedSelfCert: true, extendedDays: 8, extendedDiscussed: true }), 8);
  assert.equal(selfCertMaxDays({ extendedSelfCert: true, extendedDays: 30, extendedDiscussed: true }), 16);

  const ok = validateSickNote({ kind: 'self', fromDate: '2026-03-02', toDate: '2026-03-04', employee: emp, confirmed: true });
  assert.equal(ok.ok, true);
  const long = validateSickNote({ kind: 'self', fromDate: '2026-03-02', toDate: '2026-03-05', employee: emp, confirmed: true });
  assert.equal(long.ok, false);
  assert.match(long.errors[0], /3 kalenderdager/);
  const unconfirmed = validateSickNote({ kind: 'self', fromDate: '2026-03-02', toDate: '2026-03-02', employee: emp });
  assert.equal(unconfirmed.ok, false);
}

// Fravær uten legeerklæring de siste 16 dagene regnes med (ftrl § 8-24).
{
  const before = [day('2026-03-02'), day('2026-03-03')];
  const res = validateSickNote({ kind: 'self', fromDate: '2026-03-10', toDate: '2026-03-11', employee: emp, absences: before, confirmed: true });
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /16 dagene/);
  const far = validateSickNote({ kind: 'self', fromDate: '2026-03-25', toDate: '2026-03-26', employee: emp, absences: before, confirmed: true });
  assert.equal(far.ok, true);
}

// To måneders ansettelse før egenmelding kan brukes.
{
  const fresh = { id: 'e1', company: { periodFrom: '2026-02-01' } };
  const res = validateSickNote({ kind: 'self', fromDate: '2026-03-02', employee: fresh, confirmed: true });
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /to måneders ansettelse/);
  assert.equal(selfCertStatus({ employee: fresh, at: '2026-04-01' }).eligible, true);
  const unknown = validateSickNote({ kind: 'self', fromDate: '2026-03-02', employee: { id: 'e1' }, confirmed: true });
  assert.equal(unknown.ok, true);
  assert.ok(unknown.warnings.some((w) => /Startdato/.test(w)));
}

// Fratatt rett (ftrl § 8-27) i seks måneder.
{
  const rules = { denied: [{ employeeId: 'e1', from: '2026-01-10', reason: 'Fire fravær' }] };
  const blocked = validateSickNote({ kind: 'self', fromDate: '2026-03-02', employee: emp, confirmed: true, rules });
  assert.equal(blocked.ok, false);
  const after = validateSickNote({ kind: 'self', fromDate: '2026-07-11', employee: emp, confirmed: true, rules });
  assert.equal(after.ok, true);
}

// Fire fravær på 12 måneder gir vurdering, ikke automatisk stopp.
{
  const rows = ['2025-06-02', '2025-09-01', '2025-12-01', '2026-02-02'].map((d) => day(d));
  const status = selfCertStatus({ employee: emp, absences: rows, at: '2026-03-01' });
  assert.equal(status.occasionsUsed, 4);
  assert.equal(status.revokeReview, true);
  assert.equal(status.frequent, true);
  const res = validateSickNote({ kind: 'self', fromDate: '2026-03-02', employee: emp, absences: rows, confirmed: true });
  assert.equal(res.ok, true);
  assert.ok(res.warnings.some((w) => /nummer 5/.test(w)));
}

// Firmaets eget tak gir varsel.
{
  const rows = ['2026-01-05', '2026-01-06', '2026-01-07'].map((d) => day(d));
  const res = validateSickNote({ kind: 'self', fromDate: '2026-03-02', employee: emp, absences: rows, confirmed: true, rules: { annualCapDays: 3 } });
  assert.equal(res.ok, true);
  assert.ok(res.warnings.some((w) => /tak på 3/.test(w)));
}

// Arbeidsgiverperioden (ftrl § 8-19).
{
  const rows = [];
  for (let d = 2; d <= 20; d += 1) rows.push(day(`2026-03-${String(d).padStart(2, '0')}`, 'syk_melding'));
  const periods = employerPeriods(sickOccasions(rows, 'e1'));
  assert.equal(periods.length, 1);
  assert.equal(periods[0].full, true);
  assert.equal(periods[0].endDate, '2026-03-17');
  assert.equal(periods[0].navFrom, '2026-03-18');

  const two = employerPeriods(sickOccasions([day('2026-03-02', 'syk_melding'), day('2026-03-12', 'syk_melding')], 'e1'));
  assert.equal(two.length, 1);
  assert.equal(two[0].used, 2);
  const apart = employerPeriods(sickOccasions([day('2026-03-02', 'syk_melding'), day('2026-04-02', 'syk_melding')], 'e1'));
  assert.equal(apart.length, 2);
}

// Omsorgsdager (ftrl § 9-6).
{
  assert.equal(childCareQuota({ children: 2 }).total, 10);
  assert.equal(childCareQuota({ children: 3 }).total, 15);
  assert.equal(childCareQuota({ children: 2, alone: true }).total, 20);
  assert.equal(childCareQuota({ children: 3, alone: true }).total, 30);
  assert.equal(childCareQuota({ children: 1, chronic: 1 }).total, 20);
  assert.equal(childCareQuota({ children: 1, chronic: 1, alone: true }).total, 40);
  const rows = ['2026-02-02', '2026-02-03', '2025-12-01'].map((d) => day(d, 'sykt_barn'));
  const quota = childCareQuota({ children: 1 }, { absences: rows, employeeId: 'e1', year: 2026 });
  assert.equal(quota.used, 2);
  assert.equal(quota.remaining, 8);
  assert.equal(childCareQuota({}).unknown, true);
  const res = validateSickNote({ kind: 'child', fromDate: '2026-03-02', toDate: '2026-03-05', employee: emp, confirmed: true });
  assert.equal(res.ok, false);
}

// Dager i saken følger arbeidsplanen og gradering.
{
  const days = caseAbsenceDays({ fromDate: '2026-03-06', toDate: '2026-03-09', percent: 50 }, (iso) => (['2026-03-07', '2026-03-08'].includes(iso) ? 0 : 7.5));
  assert.deepEqual(days, [{ date: '2026-03-06', hours: 3.75 }, { date: '2026-03-09', hours: 3.75 }]);
}

// Sykedager uten skjema gir påminnelse.
{
  const rows = [day('2026-03-02'), day('2026-03-03'), day('2026-03-10', 'sykt_barn'), day('2026-03-20')];
  const cases = [{ id: 'c1', employeeId: 'e1', kind: 'self', fromDate: '2026-03-02', toDate: '2026-03-03', status: 'godkjent' }];
  // Lanseringen er 2027-01-01, så eldre dager krever ikke egenmelding. Testen bruker egen start.
  assert.equal(missingSickNotes(rows, cases, 'e1', { today: '2026-03-15' }).length, 0);
  const missing = missingSickNotes(rows, cases, 'e1', { today: '2026-03-15', startDate: '2026-01-01' });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].kind, 'child');
  assert.equal(missing[0].fromDate, '2026-03-10');
  assert.equal(missingSickNotes(rows, cases, 'e1', { today: '2026-03-15', rules: { requireForm: false } }).length, 0);
  const linked = missingSickNotes([day('2026-03-05', 'egenmelding', { caseId: 'c9' })], [], 'e1', { today: '2026-03-15', startDate: '2026-01-01' });
  assert.equal(linked.length, 0);
}

// Egenmelding kreves bare fra lanseringen 01.01.2027, ikke for fravær før det.
{
  const rows = [day('2026-12-30'), day('2026-12-31'), day('2027-01-04'), day('2027-01-05'), day('2026-11-02')];
  const missing = missingSickNotes(rows, [], 'e1', { today: '2027-01-10' });
  assert.equal(missing.length, 1);
  assert.equal(missing[0].fromDate, '2027-01-04');
  assert.equal(missing[0].toDate, '2027-01-05');
  assert.equal(missing[0].days, 2);
  assert.equal(missingSickNotes([day('2026-12-31')], [], 'e1', { today: '2027-02-01' }).length, 0);
}

// Oppfølgingsfrister (aml § 4-6).
{
  const sick = { id: 'c2', employeeId: 'e1', kind: 'doctor', fromDate: '2026-01-05', toDate: '2026-03-31', percent: 100 };
  const items = followUpDeadlines(sick, { today: '2026-02-10' });
  const byId = Object.fromEntries(items.map((row) => [row.id, row]));
  assert.equal(byId.plan.due, '2026-02-02');
  assert.equal(byId.plan.state, 'overdue');
  assert.equal(byId.dialog.due, '2026-02-23');
  assert.equal(byId.nav.due, '2026-01-21');
  const partial = followUpDeadlines({ ...sick, percent: 50 }, { today: '2026-02-10' });
  assert.ok(!partial.some((row) => row.id === 'dialog'));
  const done = followUpDeadlines({ ...sick, followUp: { planSentAt: '2026-01-30' } }, { today: '2026-02-10' });
  assert.equal(done.find((row) => row.id === 'plan').state, 'done');
  assert.equal(followUpDeadlines({ ...sick, kind: 'self', toDate: '2026-01-07' }, { today: '2026-02-10' }).length, 0);
  const queue = followUpQueue([sick], { today: '2026-02-10' });
  assert.equal(queue.length, 1);
  assert.equal(queue[0].next.state, 'overdue');
}

// Statistikk: tapte timer delt på avtalte timer.
{
  const rows = [day('2026-03-02'), day('2026-03-03', 'syk_melding'), day('2026-03-04', 'sykt_barn')];
  const stats = sickLeaveStats({
    absences: rows,
    employees: [emp],
    fromDate: '2026-03-02',
    toDate: '2026-03-06',
    plannedHours: () => 7.5,
  });
  assert.equal(stats.planned, 37.5);
  assert.equal(stats.hours.self, 7.5);
  assert.equal(stats.percent, 40);
  assert.equal(stats.childPercent, 20);
  assert.equal(stats.months.length, 1);
}

// Egenmelding føres dag for dag: dagene rett før, etter og over helg er samme tilfelle.
{
  const seq = [day('2026-11-09'), day('2026-11-10'), day('2026-11-11')];
  const fourth = validateSickNote({ kind: 'self', fromDate: '2026-11-12', toDate: '2026-11-12', employee: emp, absences: seq, confirmed: true });
  assert.equal(fourth.ok, false);
  assert.equal(fourth.limitExceeded, true);
  assert.match(fourth.errors[0], /^Beklager, egenmelding kan bare brukes i 3 kalenderdager/);
  assert.match(fourth.errors[0], /Fra og med 12\.11\.2026 må fraværet dokumenteres med sykmelding/);
  const earlier = validateSickNote({ kind: 'self', fromDate: '2026-11-08', toDate: '2026-11-08', employee: emp, absences: seq, confirmed: true });
  assert.equal(earlier.ok, false);
  const weekend = validateSickNote({ kind: 'self', fromDate: '2026-11-16', toDate: '2026-11-16', employee: emp, absences: [day('2026-11-12'), day('2026-11-13')], confirmed: true });
  assert.equal(weekend.ok, false);
  assert.match(weekend.errors[0], /5 kalenderdager sammenhengende, helg medregnet/);
  // Grensen vises selv om erklæringen ikke er krysset av ennå.
  const early = validateSickNote({ kind: 'self', fromDate: '2026-11-12', toDate: '2026-11-12', employee: emp, absences: seq });
  assert.equal(early.limitExceeded, true);
  // Sykmelding rett før teller ikke som egenmeldingsdager.
  const afterDoctor = validateSickNote({ kind: 'self', fromDate: '2026-11-11', toDate: '2026-11-11', employee: emp, absences: [{ ...day('2026-11-09'), type: 'syk_melding' }, { ...day('2026-11-10'), type: 'syk_melding' }], confirmed: true });
  assert.equal(afterDoctor.ok, true);
  // Sykt barn: tre kalenderdager per tilfelle, også når dagene føres hver for seg.
  const kids = ['2026-11-09', '2026-11-10', '2026-11-11'].map((d) => ({ ...day(d), type: 'sykt_barn' }));
  const kid4 = validateSickNote({ kind: 'child', fromDate: '2026-11-12', toDate: '2026-11-12', employee: emp, absences: kids, confirmed: true });
  assert.equal(kid4.ok, false);
  assert.match(kid4.errors[0], /sykt barn kan bare brukes i 3 kalenderdager/);
}

console.log('sickLeave ok');
