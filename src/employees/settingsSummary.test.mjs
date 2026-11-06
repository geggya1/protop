import assert from 'node:assert/strict';
import { settingsProgress, settingsSummary, weeklyScheduleHours } from './settingsSummary.js';
import { EMPLOYEE_SUB_TABS } from './personTabs.js';

const employee = {
  id: 'e1',
  person: {
    firstName: 'Ada', email: 'ada@example.com', phone: '900 00 000', birthDate: '1990-01-02',
    nationalId: '02019012345', kinName: 'Kari', address1: 'Gata 1', postalCode: '0150', place: 'Oslo',
  },
  company: { title: 'Prosjektleder', workPercent: 80, periodFrom: '2024-01-01', compensationType: 'Fastlønn' },
  extras: {
    childCare: { birthYears: [2016, 2019] },
    timeSettings: { utilizationTarget: 75, hourlyRate: '1200', notifyApproval: false },
    schedules: [{ id: 'p', from: '2025-01-01', days: { mon: { hours: '7:30' }, tue: { hours: 7.5 }, wed: { hours: 7.5 }, thu: { hours: 7.5 }, fri: { hours: 7.5 } } }],
  },
};

const rows = settingsSummary(employee, { reveal: true, todayKey: '2026-11-06' });
// Hver seksjon i menyen (unntatt Oversikt) har linjer på kortet sitt.
for (const section of EMPLOYEE_SUB_TABS.settings.filter((row) => row.id !== 'settingsOverview')) {
  assert.ok(Array.isArray(rows[section.id]) && rows[section.id].length, section.id);
}
const value = (id, label) => rows[id].find((row) => row.label === label)?.value;
assert.equal(value('settingsProfile', 'Stilling'), 'Prosjektleder');
assert.equal(value('settingsPersonal', 'Adresse'), 'Gata 1, 0150 Oslo');
assert.equal(value('settingsKin', 'Pårørende'), 'Kari');
assert.equal(value('settingsKin', 'Barn'), '2 registrert');
assert.equal(value('settingsEmployment', 'Stillingsprosent'), '80 %');
assert.equal(value('settingsWork', 'Tidsplan'), '37,5 t per uke');
assert.equal(value('settingsGeneral', 'Mål faktureringsgrad'), '75 %');
assert.equal(value('settingsGeneral', 'Timepris'), '1200 kr');
assert.equal(value('settingsNotify', 'Varsler'), '1 av 2 på');
assert.equal(weeklyScheduleHours(employee, '2026-11-06'), 37.5);
assert.equal(weeklyScheduleHours({}, '2026-11-06'), null);

// Uten innsyn: personnummer og pårørende vises ikke, bare at de er registrert.
const hidden = settingsSummary(employee, { reveal: false, todayKey: '2026-11-06' });
assert.equal(hidden.settingsKin[0].value, 'Skjermet');
assert.equal(hidden.settingsPersonal.find((row) => row.label === 'Personnummer').value, 'Skjermet');
assert.equal(JSON.stringify(hidden).includes('02019012345'), false);
assert.equal(JSON.stringify(rows).includes('02019012345'), false, 'personnummeret er maskert også med innsyn');

// Mangler: tydelig «Ikke registrert», merket som mangel.
const empty = settingsSummary({ id: 'x', person: {}, company: {} }, { todayKey: '2026-11-06' });
assert.equal(empty.settingsProfile[0].missing, true);
assert.equal(empty.settingsProfile[0].value, 'Ikke registrert');
assert.equal(empty.settingsWork[0].value, 'Følger stillingsprosenten');

// Utfyllingsgraden: de fire seksjonene om personen teller, det som mangler listes med seksjonen sin.
{
  const progress = settingsProgress({
    settingsProfile: [{ label: 'Stilling', missing: false }, { label: 'Telefon', missing: true }],
    settingsPersonal: [{ label: 'Adresse', missing: false }],
    settingsWork: [{ label: 'Tidsplan', missing: true }],
  });
  assert.equal(progress.total, 3);
  assert.equal(progress.filled, 2);
  assert.equal(progress.pct, 67);
  assert.deepEqual(progress.missing, [{ section: 'settingsProfile', label: 'Telefon' }]);
  assert.deepEqual(progress.bySection.settingsWork, { filled: 0, total: 1 });
  assert.equal(settingsProgress({}).pct, 100);
}

console.log('settingsSummary.test.mjs: ok');
