/**
 * HR-oversikten skiller egne ansatte fra eksterne og innleide.
 * Tallene for ansatte skal aldri telle med eksterne.
 */
import assert from 'node:assert/strict';
import { complianceByItem, hrDashboard, splitHrPeople, staffKinMissing } from './dashboard.js';

const today = new Date(2026, 9, 27, 12);

function person(id, first, company = {}, extra = {}) {
  return {
    id,
    personUid: `u-${id}`,
    person: { firstName: first, lastName: 'Test', ...extra },
    company: { status: 'active', personnelKind: 'staff', ...company },
  };
}

const employees = [
  person('s1', 'Ada', { periodFrom: '2023-11-01', title: 'Rådgiver' }, { birthDate: '1990-11-05' }),
  person('s2', 'Bo', { periodFrom: '2026-09-01' }),
  person('s3', 'Cato', { periodFrom: '2026-12-01' }),
  person('s4', 'Dina', { status: 'inactive', periodFrom: '2018-01-01' }),
  person('s5', 'Eva', { status: 'deleted' }),
  person('x1', 'Øyvind', { personnelKind: 'external', periodFrom: '2024-11-04', title: 'Konsulent' }, { birthDate: '1985-11-02' }),
  person('x2', 'Petter', { personnelKind: 'innleid', title: 'Tømrer' }),
  person('x3', 'Sara', { employmentType: 'Innleid via byrå' }),
  person('x4', 'Siv', { personnelKind: 'external', status: 'inactive' }),
];

{
  const { staff, external } = splitHrPeople(employees);
  assert.deepEqual(staff.map((row) => row.id), ['s1', 's2', 's3', 's4']);
  assert.deepEqual(external.map((row) => row.id), ['x1', 'x2', 'x3', 'x4'], 'innleid via ansettelsestype er ekstern');
}

const hr = {
  contracts: [
    { id: 'c1', employeeId: 's1', title: 'Midlertidig', status: 'active', startDate: '2025-01-01', endDate: '2026-12-15' },
    { id: 'c2', employeeId: 'x2', title: 'Oppdragsavtale', status: 'active', startDate: '2025-01-01', endDate: '2026-11-10' },
  ],
  cases: [
    { id: 'k1', employeeId: 's1', title: 'Planlegg jubileum', status: 'open', dueDate: '2026-11-01' },
    { id: 'k2', employeeId: 'x1', title: 'Forleng oppdrag', status: 'open', dueDate: '2026-10-01' },
    { id: 'k3', employeeId: 's2', title: 'Lukket', status: 'closed' },
    { id: 'k4', employeeId: '', title: 'Uten person', status: 'open' },
  ],
  tasks: [
    { id: 't1', employeeId: 's2', title: 'Forfalt', status: 'open', dueDate: '2026-10-01' },
    { id: 't2', employeeId: 'x3', title: 'Adgangskort', status: 'open' },
  ],
  reviews: [
    { id: 'r1', employeeId: 's1', status: 'planned', date: '2026-11-18' },
    { id: 'r2', employeeId: 'x1', status: 'planned', date: '2026-11-19' },
  ],
  applications: [
    { id: 'a1', board: 'received' },
    { id: 'a2', board: 'processing' },
    { id: 'a3', board: 'completed', outcome: 'hired' },
  ],
  compliance: [],
};

{
  const dash = hrDashboard(employees, hr, { status: 'active', today });
  assert.deepEqual(dash.counts, {
    staff: { active: 3, inactive: 1 },
    external: { active: 3, inactive: 1 },
  });
  assert.deepEqual(dash.staff.map((row) => row.id), ['s1', 's2', 's3']);
  assert.equal(dash.newHires, 1, 'Bo startet for under 90 dager siden, Cato har ikke startet');

  const keys = dash.milestones.map((row) => `${row.type}:${row.employeeId}`);
  assert.deepEqual(keys, ['anniversary:s1', 'birthday:s1', 'contract:s1']);
  assert.equal(dash.milestones.some((row) => row.employeeId.startsWith('x')), false, 'eksterne har ikke merkedager blant ansatte');
  assert.equal(dash.milestones[2].label, 'Midlertidig');
  assert.equal(dash.milestones[2].days, 49);

  assert.deepEqual(dash.follow.cases.map((row) => row.id), ['k1', 'k4']);
  assert.deepEqual(dash.follow.tasks.map((row) => row.id), ['t1']);
  assert.deepEqual(dash.follow.reviews.map((row) => row.id), ['r1']);
  assert.equal(dash.overdue, 1, 'bare forfalt for egne ansatte');

  assert.equal(dash.recruitment.queue, 2);
  assert.equal(dash.recruitment.received, 1);

  assert.equal(dash.compliance.people, 3, 'Lovpålagt teller bare egne ansatte');
  assert.ok(dash.compliance.items.length > 0);
  assert.equal(dash.compliance.items.find((row) => row.id === 'aml_written_contract').missing, 2, 'Ada har aktiv avtale');

  assert.deepEqual(dash.recentHires.map((row) => [row.employee.id, row.upcoming]), [
    ['s3', true], ['s2', false], ['s1', false],
  ]);

  assert.equal(dash.external.total, 3);
  assert.equal(dash.external.innleid, 2);
  assert.equal(dash.external.cases, 1);
  assert.equal(dash.external.tasks, 1);
  assert.deepEqual(dash.external.rows.map((row) => row.id), ['x1', 'x3', 'x2'], 'åpne saker først, så nærmeste dato');
  const x1 = dash.external.rows[0];
  assert.equal(x1.kindLabel, 'Ekstern');
  assert.equal(x1.openCases, 1);
  assert.equal(x1.next.type, 'birthday');
  const x2 = dash.external.rows[2];
  assert.equal(x2.kindLabel, 'Innleid');
  assert.equal(x2.next.type, 'contract', 'avtaleslutt for innleid ligger hos eksterne');
  assert.equal(x2.next.days, 14);
}

{
  const dash = hrDashboard(employees, hr, { status: 'inactive', today });
  assert.deepEqual(dash.staff.map((row) => row.id), ['s4']);
  assert.deepEqual(dash.external.rows.map((row) => row.id), ['x4']);
  assert.equal(dash.milestones.some((row) => row.type === 'contract'), false, 'avtalen til en aktiv ansatt vises ikke blant deaktiverte');
  assert.deepEqual(dash.follow.cases.map((row) => row.id), ['k1', 'k4'], 'saker følger personen uansett status');
}

{
  const dash = hrDashboard([], {}, { today });
  assert.equal(dash.staff.length, 0);
  assert.equal(dash.milestones.length, 0);
  assert.equal(dash.compliance.people, 0);
  assert.equal(dash.external.rows.length, 0);
}

{
  const summary = complianceByItem([employees[0]], {
    compliance: [{ catalogId: 'gdpr_privacy_notice', employeeId: 's1', status: 'ok' }],
  });
  assert.equal(summary.people, 1);
  assert.equal(summary.items.some((row) => row.id === 'gdpr_privacy_notice'), false);
  assert.ok(summary.pct > 0 && summary.pct < 100);
}

{
  const missing = [
    { employee: employees[0], task: null },
    { employee: employees[5], task: null },
    { employee: employees[7], task: null },
  ];
  assert.deepEqual(staffKinMissing(missing).map((row) => row.employee.id), ['s1']);
}

console.log('hr dashboard ok');
