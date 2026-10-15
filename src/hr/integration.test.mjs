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

assert.equal(defaultHrSubView('lonn'), 'lonn');
assert.equal(defaultHrSubView('nope'), 'oversikt');
assert.equal(hrMenuTitle('rekruttering'), 'Rekruttering');
assert.equal(HR_MENU.length, 8);
assert.ok(HR_MENU.some((item) => item.id === 'avtaler'));
assert.ok(HR_MENU.some((item) => item.id === 'compliance'));
assert.equal(defaultHrSubView('avtaler'), 'avtaler');
assert.equal(defaultHrSubView('compliance'), 'compliance');
assert.equal(hrMenuTitle('avtaler'), 'Avtaler');
assert.equal(hrMenuTitle('compliance'), 'Lov & ISO');

for (const item of HR_MENU) {
  assert.equal(companyHeroId('hr', item.id), `hr-${item.id}`);
}

{
  const adminNav = filterCompanyNav(companyNavItems(), standardGrants('administrator'))
    .find((item) => item.id === 'selskap');
  const hr = adminNav.children.find((child) => child.id === 'hr');
  assert.ok(hr);
  assert.equal(hr.children.length, 8);
  assert.equal(hr.action.tab, 'hr');
}

{
  assert.equal(companyTabAllowed('hr', 'rekruttering', standardGrants('ansatt')), false);
  assert.equal(companyTabAllowed('hr', 'lonn', standardGrants('leder')), true);
  assert.equal(companyTabAllowed('hr', 'oversikt', standardGrants('avdelingsleder')), true);
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
  assert.equal(slice.files.length, 2);
  assert.ok(!slice.files.some((f) => f.name === 'lekasje.pdf'));
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
