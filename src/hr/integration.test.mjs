/**
 * Integrasjonsnivå: meny → tilgang → synlig ansatt-slice snakker sammen.
 */
import assert from 'node:assert/strict';
import {
  companyTabAllowed,
  filterCompanyNav,
  standardGrants,
} from '../access/companyAccess.js';
import { companyNavItems, defaultHrSubView, HR_MENU, hrMenuTitle } from '../navigation/shellModules.js';
import { companyHeroId } from '../modules/companyHero.js';
import {
  employeeVisibleSlice,
  normalizeHrState,
  normalizeMemo,
  normalizeSalary,
  normalizeTask,
  upcomingPeopleEvents,
} from './model.js';
import { productivityByEmployee } from './productivity.js';
import { resolveMineEmployeeId } from '../employees/model.js';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Avtaler, Lønn og Lovpålagt er samlet i Personell. Gamle lenker lander der.
assert.equal(defaultHrSubView('lonn'), 'personell');
assert.equal(defaultHrSubView('nope'), 'oversikt');
assert.equal(hrMenuTitle('rekruttering'), 'Rekruttering');
assert.equal(HR_MENU.length, 10);
assert.equal(HR_MENU[1].id, 'ansatte', 'ansattregisteret er en side i HR');
assert.equal(HR_MENU.some((item) => item.id === 'avtaler'), false);
assert.equal(HR_MENU.some((item) => item.id === 'compliance'), false);
assert.equal(defaultHrSubView('avtaler'), 'personell');
assert.equal(defaultHrSubView('compliance'), 'personell');
assert.equal(hrMenuTitle('personell'), 'Personell');

for (const item of HR_MENU) {
  assert.equal(companyHeroId('hr', item.id), `hr-${item.id}`);
}

{
  const adminNav = filterCompanyNav(companyNavItems(), standardGrants('administrator'));
  const hr = adminNav.find((item) => item.id === 'hr');
  const selskap = adminNav.find((item) => item.id === 'selskap');
  assert.ok(hr);
  assert.equal(hr.children.length, 10);
  assert.equal(hr.action.tab, 'hr');
  assert.equal(selskap.children, undefined);
  assert.ok(adminNav.some((item) => item.id === 'hr'));
  // Ansattregisteret er en side i HR. Egen side står under Bedrift › Ansatt.
  assert.ok(hr.children.some((item) => item.id === 'hr-ansatte'));
  assert.ok(adminNav.some((item) => item.id === 'ansatt-minside'));
  assert.ok(adminNav.some((item) => item.id === 'selskapsinnstillinger'));
}

{
  assert.equal(companyTabAllowed('hr', 'rekruttering', standardGrants('ansatt')), false);
  assert.equal(companyTabAllowed('hr', 'ansatte', standardGrants('ansatt')), true, 'registeret følger Ansatte-tilgangen');
  assert.equal(companyTabAllowed('ansatte', 'min-side', standardGrants('ansatt')), true);
  assert.equal(companyTabAllowed('ansatte', 'min-side', standardGrants('innleie_ekstern')), false);
  assert.equal(companyTabAllowed('hr', 'lonn', standardGrants('leder')), true);
  // Personell åpnes med hvilken som helst av de fire delene, for eksempel bare Lovpålagt.
  const complianceOnly = { ...standardGrants('ansatt'), hrCompliance: 'see' };
  assert.equal(companyTabAllowed('hr', 'personell', complianceOnly), true);
  assert.equal(companyTabAllowed('hr', 'personell', standardGrants('ansatt')), false);
  assert.equal(companyTabAllowed('hr', 'oversikt', standardGrants('avdelingsleder')), true);
  assert.equal(standardGrants('ansatt').hr, 'none');
  assert.equal(standardGrants('tilbud').hr, 'none');
}

{
  // Min side: HR self-service må bruke ansettelses-id, ikke tomt profil-draft.
  assert.equal(resolveMineEmployeeId({
    linked: { id: 'emp-1' },
    mine: null,
    profile: {},
    familyId: 'co',
  }), 'emp-1');
}

{
  const selfSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../screens/hr/EmployeeHrSelfService.jsx'),
    'utf8',
  );
  assert.match(selfSrc, /loadEmployeeHrSlice/);
  assert.doesNotMatch(selfSrc, /loadHrState\(/);
  const mineSrc = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../screens/employees/EmployeesScreen.jsx'),
    'utf8',
  );
  assert.match(mineSrc, /mineHrEmployeeId/);
  assert.match(mineSrc, /resolveMineEmployeeId/);
}

{
  const visibleMemo = normalizeMemo({
    id: 'm1', employeeId: 'e1', title: 'Tips', body: 'Bra jobb', employeeVisible: true,
  });
  const privateMemo = normalizeMemo({
    id: 'm2', employeeId: 'e1', title: 'Intern', body: 'Hemmelig', employeeVisible: false,
  });
  const state = normalizeHrState({
    tasks: [
      normalizeTask({ employeeId: 'e1', title: 'Lever CV', employeeVisible: true }),
      normalizeTask({ employeeId: 'e1', title: 'Hemmelig', employeeVisible: false }),
    ],
    memos: [visibleMemo, privateMemo],
    files: [
      { employeeId: 'e1', name: 'åpen.pdf' },
      { employeeId: 'e1', name: 'lekasje.pdf', memoId: privateMemo.id },
      { employeeId: 'e1', name: 'vedlegg.pdf', memoId: visibleMemo.id },
    ],
    salaries: [
      normalizeSalary({
        employeeId: 'e1', kind: 'actual', effectiveDate: '2024-01-01',
        annualAmount: 650000, employeeVisible: true,
      }),
    ],
  });
  const slice = employeeVisibleSlice(state, 'e1');
  assert.equal(slice.tasks.length, 1);
  assert.equal(slice.tasks[0].title, 'Lever CV');
  assert.equal(slice.memos.length, 1);
  // åpen.pdf uten employeeVisible er HR-intern; lekasje følger privat memo.
  assert.equal(slice.files.length, 1);
  assert.ok(!slice.files.some((f) => f.name === 'lekasje.pdf'));
  assert.ok(!slice.files.some((f) => f.name === 'åpen.pdf'));
  assert.ok(slice.files.some((f) => f.name === 'vedlegg.pdf'));
  assert.equal(slice.salaries[0].annualAmount, 650000);
}

{
  const events = upcomingPeopleEvents([
    {
      id: 'e1',
      person: { firstName: 'Ada', lastName: 'Lovelace', birthDate: '1990-10-16' },
      company: { periodFrom: '2016-10-16', status: 'active' },
    },
  ], { withinDays: 5, today: new Date('2026-10-15T12:00:00Z') });
  assert.ok(events.some((e) => e.type === 'birthday'));
  assert.ok(events.some((e) => e.type === 'anniversary' && e.years === 10));
}

{
  const rows = productivityByEmployee(
    [{ employeeId: 'e1', hours: 40, billableHours: 30 }],
    [{ id: 'e1', person: { firstName: 'Ada' } }],
  );
  assert.equal(rows[0].utilizationPct, 75);
  assert.equal(rows[0].band.id, 'on_target');
}

console.log('hr/integration.test.mjs ok');
