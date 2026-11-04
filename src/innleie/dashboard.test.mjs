import assert from 'node:assert/strict';
import {
  NOTICE_TYPE_ID, absencePickerTypes, absenceTypeById, hiredAbsenceTypes, resolveAbsenceTypes,
} from '../arbeid/absenceCatalog.js';
import { isHiredPersonnel, isOwnActiveEmployee, kindOf } from '../employees/model.js';
import { hrKindBucket } from '../hr/directory.js';
import {
  awayRows, hiredPeople, innleieDashboard, noticesFromAbsences,
} from './dashboard.js';

const staff = { id: 's1', person: { firstName: 'Ada' }, company: { status: 'active', personnelKind: 'staff', accessLevel: 'ansatt' } };
const innleid = { id: 'i1', person: { firstName: 'Ina' }, company: { status: 'active', personnelKind: 'innleid', periodTo: '2026-11-20' } };
const ekstern = { id: 'x1', person: { firstName: 'Rolf' }, company: { status: 'active', personnelKind: 'external' } };
const old = { id: 'i2', person: { firstName: 'Ola' }, company: { status: 'inactive', personnelKind: 'innleid' } };

{
  // Én regel for egen ansatt: tilgangsnivå, så personelltype, så ansettelsesform.
  assert.equal(kindOf(staff), 'staff');
  assert.equal(kindOf(innleid), 'innleid');
  assert.equal(isHiredPersonnel(ekstern), true);
  assert.equal(isOwnActiveEmployee(staff), true);
  assert.equal(isOwnActiveEmployee(innleid), false);
  const byType = { id: 't', company: { personnelKind: 'staff', employmentType: 'Innleid via byrå' } };
  assert.equal(kindOf(byType), 'innleid');
  // Nivået vinner over en gammel personelltype.
  const levelWins = { id: 'l', company: { personnelKind: 'external', accessLevel: 'ansatt' } };
  assert.equal(kindOf(levelWins), 'staff');
  assert.equal(hrKindBucket(levelWins), 'internal', 'HR og resten er enige');
}

{
  // Fraværsbeskjed: skjult for egne ansatte, eneste type for innleide, uten lønn og timebank.
  const notice = absenceTypeById(NOTICE_TYPE_ID, resolveAbsenceTypes({ absenceTypesCustom: true, absenceTypes: [{ id: 'ferie', label: 'Ferie' }] }));
  assert.equal(notice.label, 'Fraværsbeskjed');
  assert.equal(notice.paid, false);
  assert.equal(notice.deductBalance, false);
  assert.equal(notice.category === 'Sykdom', false);
  assert.equal(absencePickerTypes(resolveAbsenceTypes({})).some((row) => row.id === NOTICE_TYPE_ID), false);
  assert.deepEqual(hiredAbsenceTypes().map((row) => row.id), [NOTICE_TYPE_ID]);
}

{
  assert.deepEqual(hiredPeople([staff, innleid, ekstern, old]).map((row) => row.id), ['i1', 'x1']);
  assert.deepEqual(hiredPeople([staff, innleid, ekstern, old], 'inactive').map((row) => row.id), ['i2']);

  // Rader per dag blir perioder. Helgen slår sammen fredag og mandag.
  const notices = noticesFromAbsences([
    { employeeId: 'i1', date: '2026-11-06', hours: 7.5, description: 'Kurs' },
    { employeeId: 'i1', date: '2026-11-09', hours: 7.5 },
    { employeeId: 's1', date: '2026-11-06', hours: 7.5 },
  ], [innleid]);
  assert.deepEqual(notices.map((row) => [row.fromDate, row.toDate, row.note]), [['2026-11-06', '2026-11-09', 'Kurs']]);
  const away = awayRows(notices, [innleid], { today: '2026-11-04', days: 7 });
  assert.equal(away.length, 1);
  assert.equal(away[0].today, false);
  assert.equal(away[0].startsIn, 2);

  const dash = innleieDashboard([staff, innleid, ekstern, old], { compliance: [], hmsCards: [] }, {
    today: '2026-11-06', notices,
  });
  assert.equal(dash.total, 2);
  assert.equal(dash.innleid, 1);
  assert.equal(dash.counts.inactive, 1);
  assert.equal(dash.awayToday.length, 1);
  assert.equal(dash.rows.some((row) => row.id === 's1'), false, 'egne ansatte er ikke med');
  assert.ok(dash.gaps.find((row) => row.id === 'inn_privacy_notice').count === 2);
  assert.deepEqual(dash.endingSoon.map((row) => [row.id, row.endsIn]), [['i1', 14]]);
}

console.log('innleie dashboard ok');
