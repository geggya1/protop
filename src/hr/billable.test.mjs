/**
 * Fakturerbar tid måles mot mulig tid: stillingsprosent × arbeidsdager uten helligdager.
 * Fravær, intern tid og tid ført på eget selskap trekker ned.
 */
import assert from 'node:assert/strict';
import {
  billableMonth,
  companyNameKey,
  formatTimer,
  isInternalAbsenceType,
  monthKeyOf,
  monthWindow,
  ownCompanyMatcher,
  shiftMonthKey,
} from './billable.js';

const today = new Date(2026, 9, 27, 12);

function person(id, company = {}) {
  return {
    id,
    person: { firstName: id.toUpperCase(), lastName: 'Test' },
    company: { status: 'active', personnelKind: 'staff', periodFrom: '2020-01-01', ...company },
  };
}

{
  assert.equal(monthKeyOf(today), '2026-10');
  assert.equal(shiftMonthKey('2026-10', -1), '2026-09');
  assert.equal(shiftMonthKey('2026-01', -1), '2025-12');
  assert.equal(shiftMonthKey('2026-12', 1), '2027-01');

  const current = monthWindow('2026-10', today);
  assert.equal(current.current, true);
  assert.equal(current.throughDate, '2026-10-27', 'inneværende måned regnes til og med i dag');
  assert.equal(current.label, 'Oktober 2026');

  const past = monthWindow('2026-09', today);
  assert.equal(past.throughDate, '2026-09-30');
  assert.equal(past.current, false);

  const future = monthWindow('2026-11', today);
  assert.equal(future.future, true);
  assert.equal(future.throughDate, '');
}

{
  assert.equal(companyNameKey('CONSULT1 AS'), 'consult1');
  assert.equal(companyNameKey('Consult1'), 'consult1');
  assert.equal(companyNameKey('Consult1 Sør AS'), 'consult1 sør');

  const own = ownCompanyMatcher({
    name: 'CONSULT1 AS',
    orgnr: '912 345 678',
    projects: [
      { id: 'p-own', orgnr: '912345678', client: 'Hva som helst' },
      { id: 'p-named', client: 'Consult1 AS' },
      { id: 'p-client', orgnr: '998877665', client: 'Kunde AS' },
    ],
  });
  assert.equal(own({ projectId: 'p-own' }), true, 'prosjekt med eget orgnr');
  assert.equal(own({ projectId: 'p-named' }), true, 'prosjekt med eget navn som oppdragsgiver');
  assert.equal(own({ projectId: 'p-client', customerName: 'Kunde AS' }), false);
  assert.equal(own({ projectId: 'x', customerName: 'Consult1' }), true, 'kunde med samme navn');
  assert.equal(own({ projectId: 'x', customerName: 'Consult1 Sør AS' }), false, 'underenhet med annet navn er en kunde');
  assert.equal(ownCompanyMatcher({})({ projectId: 'x', customerName: '' }), false, 'uten selskapsnavn er ingenting eget selskap');
}

{
  assert.equal(isInternalAbsenceType({ id: 'intern_admin', label: 'Interntid - Administrasjon' }), true);
  assert.equal(isInternalAbsenceType({ id: 'egen', label: 'Interntid - Kurs' }), true);
  assert.equal(isInternalAbsenceType({ id: 'ferie', label: 'Ferie' }), false);
}

{
  // September 2026: 22 arbeidsdager, ingen helligdager. Normaldag 7,5 t.
  const staff = [
    person('a'),
    person('b', { workPercent: '50' }),
    person('c', { periodFrom: '2026-09-15' }),
  ];
  const isOwnCompany = ownCompanyMatcher({ name: 'Consult1 AS' });
  const result = billableMonth({
    staff,
    month: '2026-09',
    today,
    fullDayHours: 7.5,
    isOwnCompany,
    entries: [
      { employeeId: 'a', date: '2026-09-02', hours: 100, billableHours: 100, customerName: 'Kunde AS' },
      { employeeId: 'a', date: '2026-09-03', hours: 20, billableHours: 20, customerName: 'CONSULT1 AS' },
      { employeeId: 'a', date: '2026-09-04', hours: 5, billableHours: 5, timeType: 'internal' },
      { employeeId: 'a', date: '2026-10-01', hours: 50, billableHours: 50 },
      { employeeId: 'b', date: '2026-09-09', hours: 40, billableHours: 30 },
      { employeeId: 'x', date: '2026-09-09', hours: 200, billableHours: 200 },
    ],
    absences: [
      { employeeId: 'a', date: '2026-09-07', hours: 7.5, type: 'ferie' },
      { employeeId: 'a', date: '2026-09-06', hours: 7.5, type: 'ferie' },
      { employeeId: 'a', date: '2026-09-08', hours: 3, type: 'intern_admin' },
      { employeeId: 'b', date: '2026-09-10', hours: 0, percent: 100, type: 'egenmelding' },
    ],
  });

  const byId = Object.fromEntries(result.rows.map((row) => [row.id, row]));
  assert.equal(byId.a.capacity, 165, '100 % × 22 dager × 7,5 t');
  assert.equal(byId.a.absence, 7.5, 'fravær på søndag trekker ikke fra');
  assert.equal(byId.a.billable, 100, 'eget selskap og intern tid er ikke fakturerbart');
  assert.equal(byId.a.nonBillable, 28, '20 t eget selskap + 5 t intern tid + 3 t interntid som fraværstype');
  assert.equal(byId.a.ownCompany, 20);
  assert.equal(byId.a.unlogged, 29.5);
  assert.equal(byId.a.pct, 60.6);

  assert.equal(byId.b.capacity, 82.5, '50 % stilling');
  assert.equal(byId.b.absence, 3.8, 'prosentfravær regnes av avtalt dag');
  assert.equal(byId.b.billable, 30);
  assert.equal(byId.b.nonBillable, 10);

  assert.equal(byId.c.capacity, 90, 'bare dagene etter startdato');
  assert.equal(byId.c.pct, 0);
  assert.equal(byId.x, undefined, 'bare egne ansatte');

  assert.equal(result.capacity, 337.5);
  assert.equal(result.billable, 130);
  assert.equal(result.nonBillable, 38);
  assert.equal(result.ownCompany, 20);
  assert.equal(result.pct, 38.5);
  assert.equal(result.unlogged, 158.2, 'regnestykket går opp med avrundede tall');
  assert.equal(
    Math.round((result.capacity - result.absence - result.nonBillable - result.unlogged + result.over) * 10) / 10,
    result.billable,
  );
  assert.deepEqual(result.rows.map((row) => row.id), ['a', 'b', 'c'], 'høyest andel først');
}

{
  // Overtid: mer ført enn mulig tid gir ingen negative «ikke ført».
  const result = billableMonth({
    staff: [person('a')],
    month: '2026-09',
    today,
    fullDayHours: 7.5,
    entries: [{ employeeId: 'a', date: '2026-09-01', hours: 180, billableHours: 180 }],
  });
  assert.equal(result.unlogged, 0);
  assert.equal(result.over, 15);
  assert.equal(result.pct, 109.1);
}

{
  // Mai 2026: 21 hverdager, 1. mai, Kristi himmelfart og 2. pinsedag faller på hverdager.
  const result = billableMonth({ staff: [person('a')], month: '2026-05', today, fullDayHours: 7.5 });
  assert.equal(result.capacity, 135);
  assert.equal(result.unlogged, 135);
}

{
  // Oktober 2026 til og med tirsdag 27.: 19 arbeidsdager. Selskapet har fri 9. oktober.
  const result = billableMonth({
    staff: [person('a')],
    month: '2026-10',
    today,
    fullDayHours: 7.5,
    redDays: [{ date: '2026-10-09', name: 'Fridag', kind: 'dayoff', portion: 'full' }],
  });
  assert.equal(result.capacity, 135, '18 dager hittil i måneden');
  assert.equal(result.current, true);
}

{
  const fourDays = {
    ...person('a'),
    extras: {
      schedules: [{
        id: 's1',
        from: '2026-01-01',
        days: {
          mon: { hours: 8 }, tue: { hours: 8 }, wed: { hours: 8 }, thu: { hours: 8 }, fri: { hours: 0 }, sat: { hours: 0 }, sun: { hours: 0 },
        },
      }],
    },
  };
  const result = billableMonth({
    staff: [fourDays],
    month: '2026-09',
    today,
    fullDayHours: 7.5,
  });
  assert.equal(result.capacity, 144, 'tidsplanen vinner: 18 dager mandag–torsdag × 8 t');
}

{
  const result = billableMonth({ staff: [person('a')], month: '2026-11', today });
  assert.equal(result.capacity, 0, 'framtidig måned har ingen mulig tid ennå');
  assert.equal(result.pct, null);
  assert.deepEqual(result.rows, []);
}

{
  assert.equal(formatTimer(1240.5), '1 240,5 t');
  assert.equal(formatTimer(130), '130 t');
  assert.equal(formatTimer(0), '0 t');
}
