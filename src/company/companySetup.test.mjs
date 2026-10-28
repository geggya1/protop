import assert from 'node:assert/strict';
import { emptyProjectState, normalizeProjectState } from '../project/engine.js';
import {
  absenceTypeById,
  absenceTypeTitle,
  resolveAbsenceTypes,
} from '../arbeid/absenceCatalog.js';
import { agreedHoursForDate, norwegianHolidays, resolveRedDays } from '../arbeid/holidays.js';
import { deleteRedDay, importHolidayYear, upsertRedDay } from '../arbeid/timesheetState.js';
import { monthTimebank } from '../arbeid/balance.js';
import {
  accountTitle,
  resolveCompanyAccounts,
  resolveStandardAccounts,
} from '../economy/companyChart.js';
import {
  deleteAbsenceType,
  deleteCompanyAccount,
  saveCompanyInvoiceDefaults,
  saveStandardAccounts,
  upsertAbsenceType,
  upsertCompanyAccount,
} from './setupState.js';
import { resolveCompanyInvoiceDefaults } from '../economy/companyInvoiceDefaults.js';
import { resolveProjectInvoiceSettings } from '../project/invoiceSettings.js';

{
  const rows = resolveAbsenceTypes(emptyProjectState());
  const byName = new Map(rows.map((row) => [absenceTypeTitle(row), row]));
  const expectRow = (title, paid, deduct, billable) => {
    const row = byName.get(title);
    assert.ok(row, title);
    assert.equal(row.paid, paid, `${title} betalt`);
    assert.equal(row.deductBalance, deduct, `${title} timebalanse`);
    assert.equal(row.billable, billable, `${title} fakturerbart`);
    assert.equal(row.startMonthLabel, 'januar');
  };
  expectRow('Annet fravær med lønn (Permisjon)', true, false, true);
  expectRow('Annet fravær uten lønn (Permisjon)', false, true, false);
  expectRow('Avspasering (Avspasering)', false, true, false);
  expectRow('Ferie (Ferie)', false, false, true);
  expectRow('Foreldrepermisjon (Permisjon)', true, false, true);
  expectRow('Interntid - Administrasjon (Ikke til timebank) (Annet fravær)', false, true, false);
  expectRow('Permittert (Annet fravær)', false, false, false);
  expectRow('Reisetid (Ikke til lønn) (Annet fravær)', false, true, false);
  expectRow('Interntid - Internprosjekt (Ikke til timebank) (Annet fravær)', false, true, false);
  // Standardtypene har ingen kundenavn (DRIFT-UX).
  assert.ok(!rows.some((row) => /Frøya|Smartplan/.test(row.label)));
  // Et selskap med egne typer beholder navnene sine.
  const own = resolveAbsenceTypes({
    ...emptyProjectState(),
    absenceTypesCustom: true,
    absenceTypes: [{ id: 'reise_uten_lonn', label: 'Reisetid - Frøya (Ikke til lønn)', category: 'Annet fravær', deductBalance: true }],
  });
  assert.equal(own[0].label, 'Reisetid - Frøya (Ikke til lønn)');
  expectRow('Sykdom med egenmelding (Sykdom)', true, false, true);
  expectRow('Sykefravær uten lønn (Sykdom)', false, true, false);
  expectRow('Sykt barn (Sykdom)', true, false, true);
  assert.equal(rows.length, 17);
  assert.equal(absenceTypeById('ferie').salary, false);
  assert.equal(absenceTypeById('avspasering').flex, true);
  assert.equal(absenceTypeById('permittert').flex, false);
}

{
  let state = emptyProjectState();
  state = upsertAbsenceType(state, {
    label: 'Kurs',
    category: 'Annet fravær',
    paid: true,
    deductBalance: false,
    billable: false,
    startMonth: 8,
  }).state;
  assert.equal(state.absenceTypesCustom, true);
  const added = resolveAbsenceTypes(state).find((row) => row.label === 'Kurs');
  assert.equal(added.startMonth, 8);
  assert.equal(added.billable, false);
  state = upsertAbsenceType(state, { ...added, paid: false }).state;
  assert.equal(resolveAbsenceTypes(state).find((row) => row.id === added.id).paid, false);
  state = deleteAbsenceType(state, added.id).state;
  assert.equal(resolveAbsenceTypes(state).some((row) => row.id === added.id), false);
  assert.equal(resolveAbsenceTypes(state).some((row) => row.id === 'ferie'), true);
  const normalized = normalizeProjectState(state);
  assert.equal(normalized.absenceTypesCustom, true);
}

{
  const accounts = resolveCompanyAccounts(emptyProjectState());
  assert.equal(accounts.length, 18);
  assert.equal(accountTitle(accounts[0]), '3000 - Salg - 25% (S) - Honorar avgiftspliktig');
  assert.equal(accounts.find((row) => row.code === '3100').turnoverClass, '2');
  assert.equal(accounts.find((row) => row.code === '3100').vatCode, '4');
  assert.equal(accounts.find((row) => row.code === '3600').turnoverClass, '');
  assert.equal(accounts.find((row) => row.code === '7141').kind, 'purchase');
  assert.match(accounts.find((row) => row.code === '7799').note, /Reise & Utlegg/);
  const standard = resolveStandardAccounts(emptyProjectState());
  assert.equal(standard.domestic.hours, '3000');
  assert.equal(standard.domestic.expenses, '3001');
  assert.equal(standard.domestic.deduction, '');
  assert.equal(standard.foreign.expenses, '3101');
  assert.equal(standard.rounding, '7771');
  let state = emptyProjectState();
  state = upsertCompanyAccount(state, {
    code: '3050',
    kind: 'sale',
    vatRate: 25,
    vatLetter: 'S',
    name: 'Annen inntekt',
    turnoverClass: '1',
    vatCode: '3',
  }).state;
  assert.equal(resolveCompanyAccounts(state).some((row) => row.code === '3050'), true);
  state = deleteCompanyAccount(state, '3000').state;
  assert.equal(resolveCompanyAccounts(state).some((row) => row.code === '3000'), false);
  state = saveStandardAccounts(state, { domestic: { hours: '3050' }, rounding: '7771' }).state;
  assert.equal(resolveStandardAccounts(state).domestic.hours, '3050');
  assert.equal(resolveStandardAccounts(state).domestic.fees, '3000');
  state = saveCompanyInvoiceDefaults(state, { creditDays: 35, markupExpenseHourly: 12 }).state;
  assert.equal(resolveCompanyInvoiceDefaults(state).creditDays, 35);
  const inherited = resolveProjectInvoiceSettings(state, { id: 'p1', invoiceSettings: {} });
  assert.equal(inherited.effective.creditDays, 35);
  assert.equal(inherited.inheritsAll, true);
}

{
  const names = new Map(norwegianHolidays(2026).map((row) => [row.name, row.date]));
  assert.equal(names.get('1. Nyttårsdag'), '2026-01-01');
  assert.equal(names.get('Skjærtorsdag'), '2026-04-02');
  assert.equal(names.get('Langfredag'), '2026-04-03');
  assert.equal(names.get('1. påskedag'), '2026-04-05');
  assert.equal(names.get('2. påskedag'), '2026-04-06');
  assert.equal(names.get('Offentlig høytidsdag'), '2026-05-01');
  assert.equal(names.get('Kristi Himmelfartsdag'), '2026-05-14');
  assert.equal(names.get('Grunnlovsdag'), '2026-05-17');
  assert.equal(names.get('1. pinsedag'), '2026-05-24');
  assert.equal(names.get('2. pinsedag'), '2026-05-25');
  assert.equal(names.get('1. juledag'), '2026-12-25');
  assert.equal(names.get('2. juledag'), '2026-12-26');

  let state = emptyProjectState();
  const days = resolveRedDays(state, [2026]);
  const on = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const mayFirst = agreedHoursForDate(on('2026-05-01'), {
    fullDayHours: 8,
    redDays: days,
    scheduleHours: 8,
  });
  assert.equal(mayFirst.hours, 0);
  assert.equal(mayFirst.red, true);
  const ordinary = agreedHoursForDate(on('2026-05-04'), {
    fullDayHours: 8,
    redDays: days,
    scheduleHours: 8,
  });
  assert.equal(ordinary.hours, 8);
  assert.equal(ordinary.red, false);

  const mayDays = ['2026-05-01', '2026-05-04', '2026-05-14', '2026-05-17'];
  const agreedSum = mayDays.reduce((sum, key) => sum + agreedHoursForDate(on(key), {
    fullDayHours: 8,
    redDays: days,
    scheduleHours: key === '2026-05-17' ? 0 : 8,
  }).hours, 0);
  assert.equal(agreedSum, 8);

  state = deleteRedDay(state, 'holiday_2026-05-01').state;
  const afterDelete = resolveRedDays(state, [2026]);
  assert.equal(afterDelete.some((row) => row.date === '2026-05-01'), false);
  assert.equal(agreedHoursForDate(on('2026-05-01'), {
    fullDayHours: 8,
    redDays: afterDelete,
    scheduleHours: 8,
  }).hours, 8);

  state = importHolidayYear(state, 2026).state;
  assert.equal(resolveRedDays(state, [2026]).some((row) => row.date === '2026-05-01'), true);

  state = upsertRedDay(state, { date: '2026-12-24', name: 'Julaften', portion: 'half' }).state;
  const eve = agreedHoursForDate(on('2026-12-24'), {
    fullDayHours: 8,
    redDays: resolveRedDays(state, [2026]),
    scheduleHours: 8,
  });
  assert.equal(eve.hours, 4);
  assert.equal(eve.red, true);
  state = deleteRedDay(state, state.redDays.find((row) => row.date === '2026-12-24').id).state;
  assert.equal(resolveRedDays(state, [2026]).some((row) => row.date === '2026-12-24'), false);
}

{
  const bank = monthTimebank({
    year: 2026,
    monthIndex: 4,
    employeeId: 'e1',
    entries: [],
    absences: [
      { id: 'a', employeeId: 'e1', date: '2026-05-04', hours: 8, type: 'avspasering' },
      { id: 'b', employeeId: 'e1', date: '2026-05-05', hours: 8, type: 'ferie' },
    ],
    agreedForDate: () => 8,
    types: resolveAbsenceTypes(emptyProjectState()),
  });
  assert.equal(bank.byDate.get('2026-05-04'), -8);
  assert.equal(bank.byDate.get('2026-05-05'), 0);
}

console.log('companySetup.test.mjs: ok');
