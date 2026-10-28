/**
 * Arbeidstid og hviletid (arbeidsmiljøloven §§ 10-4, 10-6 og 10-8): varsler fra timelisten.
 */
import assert from 'node:assert/strict';
import {
  AGREED_OVERTIME_LIMITS,
  WORKING_TIME_LIMITS,
  checkWorkingTime,
  overtimeByDay,
  restBreaches,
  workIntervals,
  workingTimeLimits,
} from './workingTimeRules.js';

function addDays(key, n) {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Føringer for en uke fra mandag: hours[i] er timer på dag i (0 = mandag). */
function week(monday, hours, { employeeId = 'e1', clock = null } = {}) {
  return hours.map((h, i) => (h ? {
    employeeId,
    projectId: 'p1',
    date: addDays(monday, i),
    hours: h,
    ...(clock ? { clockIn: clock[0], clockOut: clock[1] } : {}),
  } : null)).filter(Boolean);
}

const rules = (result) => result.warnings.map((row) => row.rule);
const warns = (result) => result.warnings.filter((row) => row.level === 'warn').map((row) => row.rule);

// Grensene, og avtalte grenser etter § 10-6 (5).
assert.equal(WORKING_TIME_LIMITS.dayNormal, 9);
assert.equal(WORKING_TIME_LIMITS.weekNormal, 40);
assert.deepEqual(
  [WORKING_TIME_LIMITS.overtime7d, WORKING_TIME_LIMITS.overtime4w, WORKING_TIME_LIMITS.overtime52w],
  [10, 25, 200],
);
assert.deepEqual([WORKING_TIME_LIMITS.dailyRest, WORKING_TIME_LIMITS.weeklyRest], [11, 35]);
assert.equal(workingTimeLimits(AGREED_OVERTIME_LIMITS).overtime52w, 300);
assert.equal(workingTimeLimits({ overtime7d: -3, dayNormal: 'x' }).overtime7d, 10, 'ugyldig verdi gir lovens grense');

{
  // Vanlig uke 07–15: ingen varsler, og hviletiden er kontrollert.
  const result = checkWorkingTime(week('2026-10-19', [8, 8, 8, 8, 8], { clock: ['07:00', '15:00'] }), { employeeId: 'e1' });
  assert.deepEqual(result.warnings, []);
  assert.equal(result.totals.hours, 40);
  assert.equal(result.totals.overtime, 0);
  assert.equal(result.restChecked, true);
  assert.deepEqual(result.unknownDays, []);
}

{
  // Over 9 t på en dag og over 40 t i uken er overtid, uten å telle samme time to ganger.
  const days = overtimeByDay(week('2026-10-19', [10, 8, 8, 8, 8]));
  assert.deepEqual(days.map((day) => day.overtime), [1, 0, 0, 0, 1]);
  const longDays = overtimeByDay(week('2026-10-19', [10, 10, 10, 10]));
  assert.deepEqual(longDays.map((day) => day.overtime), [1, 1, 1, 1], '40 t på fire dager er overtid per døgn');
  const result = checkWorkingTime(week('2026-10-19', [10, 8, 8, 8, 8]));
  assert.deepEqual(rules(result), ['weekOvertime']);
  assert.equal(result.warnings[0].level, 'info');
  assert.match(result.warnings[0].text, /42:00 t, av dette 2:00 t overtid/);
}

{
  // Mer enn 10 t overtid på sju dager, og mer enn 48 t arbeid.
  const result = checkWorkingTime(week('2026-10-19', [11, 11, 11, 11, 11]));
  assert.equal(result.totals.overtime, 15);
  assert.deepEqual(warns(result).sort(), ['overtime7d', 'weekTotal']);
  const row = result.warnings.find((item) => item.rule === 'overtime7d');
  assert.equal(row.value, 15);
  assert.equal(row.limit, 10);
  assert.equal(row.ref, 'AML § 10-6 (4)');
  assert.match(row.text, /15:00 t overtid på sju dager \(17\.10\.2026–23\.10\.2026\)/);
  // Med avtale etter § 10-6 (5) er 15 t på sju dager innenfor.
  const agreed = checkWorkingTime(week('2026-10-19', [11, 11, 11, 11, 11]), { limits: AGREED_OVERTIME_LIMITS });
  assert.deepEqual(warns(agreed), ['weekTotal']);
}

{
  // Over 13 t på ett døgn.
  const result = checkWorkingTime(week('2026-10-19', [14]));
  assert.ok(warns(result).includes('dayTotal'));
  assert.match(result.warnings.find((row) => row.rule === 'dayTotal').text, /^19\.10\.2026: 14:00 t arbeid/);
}

{
  // 7 t overtid i uken i fire uker gir 28 t: over 25 t på fire uker, men under 10 t per sju dager.
  const entries = [0, 7, 14, 21].flatMap((offset) => week(addDays('2026-09-28', offset), [10.75, 10.75, 10.75, 10.75, 4]));
  const result = checkWorkingTime(entries);
  assert.equal(result.totals.overtime, 28);
  assert.deepEqual(warns(result), ['overtime4w']);
  assert.equal(result.warnings.find((row) => row.rule === 'overtime4w').value, 28);
}

{
  // 4 t overtid i uken i 52 uker gir 208 t: over 200 t på 52 uker.
  const entries = Array.from({ length: 52 }, (_, i) => week(addDays('2025-11-03', i * 7), [9, 9, 9, 9, 8])).flat();
  const result = checkWorkingTime(entries);
  assert.equal(result.totals.overtime, 208);
  assert.deepEqual(warns(result), ['overtime52w']);
  assert.equal(result.totals.overtime52w, 208);
  assert.deepEqual(warns(checkWorkingTime(entries, { limits: AGREED_OVERTIME_LIMITS })), []);
  // Varslene kan avgrenses til perioden som vises.
  assert.deepEqual(rules(checkWorkingTime(entries, { from: '2026-01-01', to: '2026-03-31' })).filter((rule) => rule !== 'weekOvertime'), []);
}

{
  // Døgnhvile: slutt 23.00 og start 07.00 gir 8 t fri.
  const entries = [
    { employeeId: 'e1', date: '2026-10-19', hours: 9, clockIn: '14:00', clockOut: '23:00' },
    { employeeId: 'e1', date: '2026-10-20', hours: 8, clockIn: '07:00', clockOut: '15:00' },
  ];
  const result = checkWorkingTime(entries);
  assert.deepEqual(warns(result), ['dailyRest']);
  const row = result.warnings[0];
  assert.equal(row.value, 8);
  assert.equal(row.ref, 'AML § 10-8 (1)');
  assert.match(row.text, /^19\.10\.2026: lengste sammenhengende fri på 24 timer var 8:00 t\. Kravet er 11 t\./);
}

{
  // Nattskift over midnatt med 16 t fri mellom skiftene er innenfor.
  const entries = week('2026-10-19', [8, 8, 8], { clock: ['22:00', '06:00'] });
  const { intervals } = workIntervals(entries);
  assert.equal(intervals[0].end - intervals[0].start, 480);
  assert.deepEqual(warns(checkWorkingTime(entries)), []);
}

{
  // Lunsjpause deler dagen, men regnes ikke som hvile som bryter noe.
  const entries = [
    { employeeId: 'e1', date: '2026-10-19', hours: 4, clockIn: '07:00', clockOut: '11:00' },
    { employeeId: 'e1', date: '2026-10-19', hours: 3.5, clockIn: '11:30', clockOut: '15:00' },
    { employeeId: 'e1', date: '2026-10-20', hours: 8, clockIn: '07:00', clockOut: '15:00' },
  ];
  assert.deepEqual(checkWorkingTime(entries).warnings, []);
}

{
  // Ukehvile: sju dager på rad gir aldri 35 t sammenhengende fri.
  const entries = week('2026-10-19', [8, 8, 8, 8, 8, 8, 8], { clock: ['07:00', '15:00'] });
  const result = checkWorkingTime(entries);
  assert.ok(warns(result).includes('weeklyRest'));
  const row = result.warnings.find((item) => item.rule === 'weeklyRest');
  assert.equal(row.value, 16);
  assert.equal(row.limit, 35);
  // Seks dager med fri søndag er innenfor.
  assert.ok(!warns(checkWorkingTime(week('2026-10-19', [8, 8, 8, 8, 8, 8], { clock: ['07:00', '15:00'] }))).includes('weeklyRest'));
}

{
  // Uten klokkeslett kan hviletiden ikke kontrolleres. Dager uten klokkeslett hoppes over.
  const plain = checkWorkingTime(week('2026-10-19', [8, 8]));
  assert.equal(plain.restChecked, false);
  assert.deepEqual(plain.unknownDays, ['2026-10-19', '2026-10-20']);
  const mixed = [
    { employeeId: 'e1', date: '2026-10-19', hours: 9, clockIn: '14:00', clockOut: '23:00' },
    { employeeId: 'e1', date: '2026-10-20', hours: 8 },
  ];
  const { intervals, unknownDays } = workIntervals(mixed);
  assert.deepEqual(restBreaches(intervals, { unknownDays }), [], 'ukjent neste dag gir ikke falskt brudd');
}

{
  // Bare den valgte ansatte telles.
  const entries = [...week('2026-10-19', [14], { employeeId: 'e1' }), ...week('2026-10-19', [8], { employeeId: 'e2' })];
  assert.ok(warns(checkWorkingTime(entries, { employeeId: 'e1' })).includes('dayTotal'));
  assert.deepEqual(checkWorkingTime(entries, { employeeId: 'e2' }).warnings, []);
  assert.deepEqual(checkWorkingTime([], { employeeId: 'e1' }).warnings, []);
}

console.log('workingTimeRules.test.mjs: ok');
