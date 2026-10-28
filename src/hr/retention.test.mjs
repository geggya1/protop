/**
 * L-07: lagringstid for søkere og tidligere ansatte.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  PAYROLL_YEARS, RETENTION_DEFAULTS, addMonths, applicationDeleteOn, companyRetention, daysUntilDay,
  deleteCountdownLabel, formerEmployeeDeleteOn, hrRetentionPlan, retentionToast, withCompanyRetention,
} from './retention.js';
import { moveApplicationBoard, normalizeApplication, normalizeHrState } from './model.js';

const NOW = new Date('2026-10-28T12:00:00');

test('bedriftens lagringstider har standard og grenser', () => {
  assert.deepEqual(companyRetention({}), RETENTION_DEFAULTS);
  assert.deepEqual(companyRetention({ privacy: { retention: { applicantMonths: 3, formerEmployeeYears: 2 } } }), { applicantMonths: 3, formerEmployeeYears: 2 });
  assert.deepEqual(companyRetention({ privacy: { retention: { applicantMonths: 0, formerEmployeeYears: 99 } } }), { applicantMonths: 1, formerEmployeeYears: 10 });
  assert.deepEqual(withCompanyRetention({ privacy: { usageLog: false } }, 'applicantMonths', 12), {
    usageLog: false, retention: { applicantMonths: 12, formerEmployeeYears: 3 },
  });
});

test('datoer: måneder legges til, og dager telles fra i dag', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2026-04-28', 6), '2026-10-28');
  assert.equal(addMonths('2023-10-01', 36), '2026-10-01');
  assert.equal(daysUntilDay('2026-11-07', NOW), 10);
  assert.equal(daysUntilDay('2026-10-28', NOW), 0);
  assert.equal(deleteCountdownLabel('2026-11-07', NOW), 'Slettes om 10 dager');
  assert.equal(deleteCountdownLabel('2026-10-29', NOW), 'Slettes i morgen');
  assert.equal(deleteCountdownLabel('2026-10-01', NOW), 'Slettes i dag');
  assert.equal(deleteCountdownLabel('', NOW), '');
});

test('avslått søknad slettes 6 måneder etter avgjørelsen, eller når samtykket utløper', () => {
  const rejected = { id: 'a', board: 'completed', outcome: 'rejected', closedAt: '2026-04-01', updatedAt: '2026-05-01T00:00:00Z' };
  assert.equal(applicationDeleteOn(rejected), '2026-10-01');
  assert.equal(applicationDeleteOn({ ...rejected, closedAt: '' }), '2026-11-01', 'eldre søknad: sist endret');
  assert.equal(applicationDeleteOn({ ...rejected, consentToKeep: true, retainUntil: '2027-04-01' }), '2027-04-01');
  assert.equal(applicationDeleteOn({ ...rejected, outcome: 'hired' }), '', 'ansatte følger personalmappen');
  assert.equal(applicationDeleteOn({ ...rejected, board: 'processing', outcome: 'pending' }), '', 'ikke avgjort');
});

test('avgjørelsesdatoen settes når utfallet velges, og beholdes til utfallet endres', () => {
  const app = normalizeApplication({ id: 'a', name: 'Ola', board: 'processing' });
  const done = moveApplicationBoard(app, 'completed', 'rejected');
  assert.match(done.closedAt, /^\d{4}-\d{2}-\d{2}$/);
  const again = moveApplicationBoard({ ...done, closedAt: '2026-01-02' }, 'completed', 'rejected');
  assert.equal(again.closedAt, '2026-01-02');
  assert.equal(moveApplicationBoard(done, 'processing', 'pending').closedAt, '');
  // Samtykke uten dato beholdes ikke som dato.
  assert.equal(normalizeApplication({ ...done, consentToKeep: false, retainUntil: '2027-01-01' }).retainUntil, '');
});

test('tidligere ansatt: personalmappen etter 3 år, lønn etter 5 år', () => {
  const ended = { id: 'e1', company: { status: 'inactive', periodTo: '2023-06-30' } };
  assert.deepEqual(formerEmployeeDeleteOn(ended, RETENTION_DEFAULTS, NOW), {
    end: '2023-06-30', personnel: '2026-06-30', payroll: `${2023 + PAYROLL_YEARS}-06-30`,
  });
  assert.equal(formerEmployeeDeleteOn({ company: { status: 'active' } }, RETENTION_DEFAULTS, NOW).end, '');
  assert.equal(formerEmployeeDeleteOn({ company: { status: 'active', periodTo: '2026-10-27' } }, RETENTION_DEFAULTS, NOW).end, '2026-10-27');
  assert.equal(formerEmployeeDeleteOn({ company: { status: 'inactive' } }, RETENTION_DEFAULTS, NOW).end, '', 'uten dato slettes ingenting');
});

test('kjøringen sletter det som har passert fristen, og beholder resten', () => {
  const state = normalizeHrState({
    applications: [
      { id: 'gammel', name: 'Gammel søker', board: 'completed', outcome: 'rejected', closedAt: '2026-01-10' },
      { id: 'ny', name: 'Ny søker', board: 'completed', outcome: 'rejected', closedAt: '2026-09-01' },
      { id: 'aktiv', name: 'Aktiv', board: 'processing' },
    ],
    files: [
      { id: 'f1', name: 'CV', url: 'x', applicationId: 'gammel' },
      { id: 'f2', name: 'Avtale', url: 'y', employeeId: 'sluttet' },
      { id: 'f3', name: 'Avtale', url: 'z', employeeId: 'aktiv' },
    ],
    reviews: [{ id: 'r1', employeeId: 'sluttet' }, { id: 'r2', employeeId: 'aktiv' }],
    salaries: [{ id: 's1', employeeId: 'sluttet', amount: 500000, fromDate: '2022-01-01' }],
  });
  const employees = [
    { id: 'sluttet', person: { firstName: 'Per', lastName: 'Sluttet' }, company: { status: 'inactive', periodTo: '2023-01-31' } },
    { id: 'aktiv', person: { firstName: 'Kari' }, company: { status: 'active' } },
  ];
  const plan = hrRetentionPlan(state, { employees, now: NOW, actor: { uid: 'u1', name: 'HR' } });
  assert.equal(plan.changed, true);
  assert.deepEqual(plan.state.applications.map((row) => row.id), ['ny', 'aktiv']);
  assert.deepEqual(plan.state.files.map((row) => row.id), ['f3'], 'CV og personalmappe slettet');
  assert.deepEqual(plan.state.reviews.map((row) => row.id), ['r2']);
  assert.equal(plan.state.salaries.length, 1, 'lønn beholdes i fem år');
  assert.deepEqual(plan.removed.applications.map((row) => row.id), ['gammel']);
  assert.deepEqual(plan.removed.employees, [{ employeeId: 'sluttet', name: 'Per Sluttet', rows: 2 }]);
  assert.equal(plan.state.retentionRuns.at(-1).byName, 'HR');
  assert.equal(plan.state.retentionRuns.at(-1).applications, 1);
  assert.deepEqual(plan.upcoming.map((row) => row.id), ['ny']);
  assert.equal(retentionToast(plan), 'Lagringstiden er ute: slettet 1 søknad og HR-opplysninger om 1 tidligere ansatt.');
  // Kjøringen lagres i HR-tilstanden, og en ny kjøring gjør ingenting.
  const saved = normalizeHrState(plan.state);
  assert.equal(saved.retentionRuns.length, 1);
  const again = hrRetentionPlan(saved, { employees, now: NOW });
  assert.equal(again.changed, false);
  assert.equal(again.state, saved);
  assert.equal(retentionToast(again), '');
});

test('HR kjører lagringstiden når noen med Admin på HR åpner HR', () => {
  const screen = readFileSync(new URL('../../screens/hr/HrScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /hrRetentionPlan\(/);
  assert.match(screen, /access\.canAdmin\('hr'\)/);
  assert.match(screen, /employeesLoaded/);
  assert.match(screen, /hrLoadMeta\(familyId\) !== 'ok'/, 'ikke etter usikker lasting');
  const settings = readFileSync(new URL('../../components/company/CompanyPrivacySettings.jsx', import.meta.url), 'utf8');
  assert.match(settings, /nativeID="company-retention"/);
  assert.match(settings, /withCompanyRetention\(company, key, value\)/);
  const recruitment = readFileSync(new URL('../../screens/hr/HrRecruitment.jsx', import.meta.url), 'utf8');
  assert.match(recruitment, /deleteCountdownLabel\(applicationDeleteOn\(app, retention\)\)/);
});
