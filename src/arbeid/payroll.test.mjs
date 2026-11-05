/**
 * Mertid til utbetaling (uttak fra timebanken ved månedsslutt) og lønnsgrunnlaget til regnskapsfører.
 */
import assert from 'node:assert/strict';
import {
  approveMonthPayouts,
  buildPayrollSummary,
  canRequestPayout,
  cancelOvertimePayout,
  isMonthEnd,
  newlyClosedMonthEnd,
  payoutHours,
  payrollEmployees,
  requestOvertimePayout,
} from './payroll.js';
import {
  buildPayrollMail,
  buildPayrollMailHtml,
  normalizePayrollRun,
  normalizePayrollSettings,
  payrollLinesFor,
} from './payrollMail.js';
import { adjustmentHours, monthTimebank } from './balance.js';
import { setBalanceAdjustment } from './timesheetState.js';

function employee(id, first, timeSettings = {}, company = {}) {
  return {
    id,
    person: { firstName: first, lastName: '' },
    company: { status: 'active', ...company },
    extras: { timeSettings },
  };
}

// Månedsslutt
assert.equal(isMonthEnd('2026-10-31'), true);
assert.equal(isMonthEnd('2026-10-30'), false);
assert.equal(isMonthEnd('2028-02-29'), true);
assert.equal(newlyClosedMonthEnd('2026-10-15', '2026-10-31'), '2026-10-31');
assert.equal(newlyClosedMonthEnd('', '2026-11-03'), '2026-10-31', 'låst forbi månedsslutt uten at oktober var låst');
assert.equal(newlyClosedMonthEnd('2026-10-31', '2026-11-03'), '', 'oktober var allerede låst ut');
assert.equal(newlyClosedMonthEnd('2026-10-31', '2026-10-31'), '');
assert.equal(newlyClosedMonthEnd('2026-11-30', '2026-10-31'), '', 'låsen flyttet bakover');
assert.equal(newlyClosedMonthEnd('2026-12-20', '2027-01-04'), '2026-12-31');

// Innstilling på den ansatte
assert.equal(canRequestPayout(employee('a', 'A')), false);
assert.equal(canRequestPayout(employee('a', 'A', { bankPayout: true })), true);
assert.equal(canRequestPayout(employee('a', 'A', { bankPayout: true }, { compensationType: 'Fastlønn' })), false, 'fastlønn: overtid inngår som standard');
assert.equal(canRequestPayout(employee('a', 'A', { bankPayout: true, overtimeInSalary: false }, { compensationType: 'Fastlønn' })), true, 'fastlønn med krav på overtid');

// Uttak: saldoen går ned, ikke over det som finnes, én rad per måned
{
  const state = { balanceAdjustments: [] };
  const tooMuch = requestOvertimePayout(state, { employeeId: 'e1', month: '2026-10', hours: 12, available: 10 });
  assert.equal(tooMuch.ok, false);
  const first = requestOvertimePayout(state, { employeeId: 'e1', month: '2026-10', hours: 7.5, available: 10, byUid: 'u1' });
  assert.equal(first.ok, true);
  assert.equal(payoutHours(first.state.balanceAdjustments, 'e1', '2026-10'), 7.5);
  assert.equal(adjustmentHours(first.state.balanceAdjustments, 'e1', '2026-10'), -7.5, 'saldoen går ned');
  const changed = requestOvertimePayout(first.state, { employeeId: 'e1', month: '2026-10', hours: 10, available: 10, rate: 'overtime_100' });
  assert.equal(changed.ok, true);
  assert.equal(changed.state.balanceAdjustments.length, 1, 'endrer samme rad');
  assert.equal(changed.state.balanceAdjustments[0].rate, 'overtime_100');
  assert.equal(payoutHours(changed.state.balanceAdjustments, 'e1', '2026-10'), 10);

  // Manuell justering i Timesaldo lever side om side med uttaket
  const manual = setBalanceAdjustment(changed.state, { employeeId: 'e1', month: '2026-10', hours: 2 });
  assert.equal(manual.state.balanceAdjustments.length, 2);
  assert.equal(adjustmentHours(manual.state.balanceAdjustments, 'e1', '2026-10'), -8);
  assert.equal(adjustmentHours(manual.state.balanceAdjustments, 'e1', '2026-10', { kind: 'manual' }), 2);
  assert.equal(adjustmentHours(manual.state.balanceAdjustments, 'e1', '2026-10', { kind: 'payout' }), -10);
  const cleared = setBalanceAdjustment(manual.state, { employeeId: 'e1', month: '2026-10', hours: 0 });
  assert.equal(cleared.state.balanceAdjustments.length, 1, 'å nullstille manuell justering fjerner ikke uttaket');

  // Godkjent i lønn: den ansatte kan ikke endre eller angre
  const approved = approveMonthPayouts(cleared.state, { month: '2026-10', byUid: 'leder' });
  assert.equal(approved.state.balanceAdjustments[0].status, 'approved');
  assert.equal(requestOvertimePayout(approved.state, { employeeId: 'e1', month: '2026-10', hours: 1, available: 10 }).ok, false);
  assert.equal(cancelOvertimePayout(approved.state, { id: approved.state.balanceAdjustments[0].id }).ok, false);
  assert.equal(cancelOvertimePayout(approved.state, { id: approved.state.balanceAdjustments[0].id, force: true }).state.balanceAdjustments.length, 0);
}

// Timebanken: uttaket trekkes fra utgående saldo
{
  const entries = [{ id: 't1', employeeId: 'e1', date: '2026-10-01', hours: 10 }];
  const agreedForDate = (key) => (key === '2026-10-01' ? 7.5 : 0);
  const base = monthTimebank({ year: 2026, monthIndex: 9, employeeId: 'e1', entries, agreedForDate, throughDate: '2026-10-31' });
  assert.equal(base.outgoing, 2.5);
  const taken = requestOvertimePayout({ balanceAdjustments: [] }, { employeeId: 'e1', month: '2026-10', hours: 2, available: base.outgoing });
  const after = monthTimebank({
    year: 2026, monthIndex: 9, employeeId: 'e1', entries, agreedForDate, throughDate: '2026-10-31', adjustments: taken.state.balanceAdjustments,
  });
  assert.equal(after.outgoing, 0.5);
}

// Lønnsgrunnlaget
{
  const employees = [
    employee('anders', 'Anders', {}, { compensationType: 'Fastlønn' }),
    employee('jan', 'Jan Erik', { bankPayout: true }),
    employee('ekstern', 'Ekstern', {}, { employmentType: 'Innleid via byrå' }),
    employee('sluttet', 'Sluttet', {}, { periodTo: '2026-09-30', status: 'former' }),
    employee('ny', 'Ny', {}, { periodFrom: '2026-11-01' }),
  ];
  const listed = payrollEmployees(employees, '2026-10').map((row) => row.id);
  assert.deepEqual(listed, ['anders', 'jan'], 'bare egne ansatte i måneden');

  const state = {
    timeEntries: [
      { id: 'o1', employeeId: 'jan', date: '2026-10-05', hours: 2, timeType: 'overtime_50' },
      { id: 'o2', employeeId: 'jan', date: '2026-10-06', hours: 1.5, timeType: 'overtime_50' },
      { id: 'o3', employeeId: 'jan', date: '2026-11-01', hours: 4, timeType: 'overtime_50' },
      { id: 'o4', employeeId: 'jan', date: '2026-10-07', hours: 3, timeType: 'overtime_100' },
      { id: 'n1', employeeId: 'jan', date: '2026-10-07', hours: 7.5, timeType: 'ordinary' },
    ],
    absences: [
      { id: 'a1', employeeId: 'jan', date: '2026-10-12', hours: 7.5, type: 'egenmelding' },
      { id: 'a2', employeeId: 'jan', date: '2026-10-12', hours: 0.5, type: 'egenmelding' },
      { id: 'a3', employeeId: 'jan', date: '2026-10-13', hours: 7.5, type: 'egenmelding' },
      { id: 'a4', employeeId: 'jan', date: '2026-10-20', hours: 7.5, type: 'sykt_barn' },
      { id: 'a5', employeeId: 'anders', date: '2026-10-20', hours: 7.5, type: 'syk_melding' },
    ],
    mileageTrips: [
      { id: 'k1', employeeId: 'jan', date: '2026-10-02', km: 40, allowance: 140, status: 'submitted', vehicleKind: 'private' },
      { id: 'k2', employeeId: 'jan', date: '2026-10-03', km: 99, allowance: 300, status: 'draft', vehicleKind: 'private' },
      { id: 'k3', employeeId: 'jan', date: '2026-10-04', km: 10, allowance: 35, status: 'approved', vehicleKind: 'private' },
    ],
    balanceAdjustments: [
      { id: 'p1', employeeId: 'jan', month: '2026-10', kind: 'payout', hours: -4, rate: 'overtime_50', status: 'requested' },
      { id: 'm1', employeeId: 'jan', month: '2026-10', hours: -1 },
    ],
  };
  const rows = buildPayrollSummary({
    month: '2026-10',
    employees,
    state,
    recurring: { jan: [{ label: 'Ekstra månedlig skattetrekk', value: '1000,-' }] },
    notes: { jan: 'Husk feriepenger' },
  });
  assert.equal(rows.length, 2);
  const [anders, jan] = rows;
  assert.equal(anders.fixedSalary, true);
  assert.equal(anders.absence.syk_melding, 1);
  assert.equal(jan.overtime50, 7.5, '3,5 ført + 4 fra timebanken');
  assert.equal(jan.bank50, 4);
  assert.equal(jan.overtime100, 3);
  assert.equal(jan.absence.egenmelding, 2, 'dager, ikke føringer');
  assert.equal(jan.absence.sykt_barn, 1);
  assert.equal(jan.km, 50, 'utkast teller ikke');
  assert.equal(jan.mileageAmount, 175);
  assert.equal(jan.payoutPending, true);

  assert.deepEqual(payrollLinesFor(anders), ['Overtid: Fastlønn', 'Sykdom med sykemelding: 1 dag']);
  assert.deepEqual(payrollLinesFor(jan), [
    'Overtid 50 %: 7,5 timer (herav 4 timer fra timebanken)',
    'Overtid 100 %: 3 timer',
    'Sykdom med egenmelding: 2 dager',
    'Sykdom med sykemelding: 0 dager',
    'Sykt barn: 1 dag',
    'Kjøregodtgjørelse: 50 km (175,-)',
    'Ekstra månedlig skattetrekk: 1000,-',
    'Merknad: Husk feriepenger',
  ]);

  const mail = buildPayrollMail({ month: '2026-10', rows, companyName: 'Consult1 AS', senderName: 'Anders' });
  assert.equal(mail.subject, 'Oversikt over overtid og km. mm. for oktober 2026 til utbetaling – Consult1 AS');
  assert.match(mail.text, /^Hei,\n\nHer kommer oversikt over overtid og km\. mm\. for oktober 2026 til utbetaling\./);
  assert.match(mail.text, /Anders:\n {2}• Overtid: Fastlønn/);
  assert.match(mail.text, /Jan Erik:\n {2}• Overtid 50 %: 7,5 timer/);
  const html = buildPayrollMailHtml({ month: '2026-10', rows });
  assert.match(html.html, /<li>Overtid: Fastlønn<\/li>/);
  assert.doesNotMatch(buildPayrollMailHtml({ month: '2026-10', rows: [{ employeeId: 'x', name: '<b>x</b>' }] }).html, /<b>x/);

  // Lagret kjøring tåler rundtur gjennom normalisering
  const run = normalizePayrollRun({ status: 'approved', rows, approvedAt: '2026-11-04T10:00:00.000Z' }, '2026-10');
  assert.equal(run.rows.length, 2);
  assert.deepEqual(payrollLinesFor(run.rows[1]), payrollLinesFor(jan));
  assert.equal(normalizePayrollRun({ status: 'tull' }).status, 'draft');
}

// Innstillinger: ugyldig e-post lagres ikke
assert.equal(normalizePayrollSettings({ accountantEmail: 'Aina.Jespersen@JLR.no' }).accountantEmail, 'aina.jespersen@jlr.no');
assert.equal(normalizePayrollSettings({ accountantEmail: 'ikke en adresse' }).accountantEmail, '');
assert.deepEqual(normalizePayrollSettings({ recurring: { 'a/b': [{ label: 'x' }], ok: [{ label: '' }] } }).recurring, {});

console.log('payroll.test.mjs ok');
