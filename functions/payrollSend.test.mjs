/**
 * Lønnsgrunnlaget til regnskapsfører: sendes bare når det er godkjent, til adressen i innstillingene.
 */
import assert from 'node:assert/strict';
import { sendPayrollRun } from './payrollSend.js';

function fakeDb(docs) {
  const writes = [];
  return {
    writes,
    doc(path) {
      return {
        async get() {
          const data = docs[path];
          return { exists: !!data, data: () => data };
        },
        async set(patch, opts) {
          writes.push({ path, patch, opts });
          docs[path] = { ...(docs[path] || {}), ...patch };
        },
      };
    },
  };
}

const rows = [
  { employeeId: 'a', name: 'Anders', fixedSalary: true },
  { employeeId: 'j', name: 'Jan Erik', overtime50: 3.5, bank50: 2, absence: { egenmelding: 1 } },
];
const base = 'families/co/hr/payroll';
const deps = {
  authUser: async () => ({ email: 'leder@firma.no', name: 'Leder' }),
  mailKey: 'xkeysib-test-key-123',
  now: () => new Date('2026-11-04T12:00:00Z'),
};

async function rejects(promise, pattern) {
  await assert.rejects(promise, (err) => pattern.test(err.message));
}

// Uten regnskapsfører
await rejects(sendPayrollRun(fakeDb({}), { familyId: 'co', month: '2026-10', uid: 'u', deps }), /regnskapsfører/);

// Ikke godkjent
await rejects(sendPayrollRun(fakeDb({
  [base]: { accountantEmail: 'aina@jlr.no' },
  [`${base}/runs/2026-10`]: { status: 'draft', rows },
}), { familyId: 'co', month: '2026-10', uid: 'u', deps }), /godkjennes/);

// Godkjent: sendes, kopi til den som sendte, kjøringen merkes sendt
{
  const sent = [];
  const db = fakeDb({
    [base]: { accountantEmail: 'aina@jlr.no', accountantName: 'Aina', ccEmail: 'lonn@firma.no' },
    [`${base}/runs/2026-10`]: { status: 'approved', approvedAt: '2026-11-04T10:00:00Z', approvedByName: 'Leder', rows },
    'families/co': { company: { firma: 'Consult1 AS' } },
  });
  const result = await sendPayrollRun(db, {
    familyId: 'co', month: '2026-10', uid: 'u', deps: { ...deps, sendMail: async (key, msg) => { sent.push(msg); } },
  });
  assert.equal(result.ok, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'aina@jlr.no');
  assert.deepEqual(sent[0].cc, ['lonn@firma.no', 'leder@firma.no']);
  assert.equal(sent[0].replyTo, 'leder@firma.no');
  assert.match(sent[0].subject, /oktober 2026/);
  assert.match(sent[0].text, /Anders:\n {2}• Overtid: Fastlønn/);
  assert.match(sent[0].text, /herav 2 timer fra timebanken/);
  const run = db.writes.at(-1);
  assert.equal(run.path, `${base}/runs/2026-10`);
  assert.equal(run.patch.status, 'sent');
  assert.equal(run.patch.sentAt, '2026-11-04T12:00:00.000Z');
}

// Feil fra e-posttjenesten lagres og meldes
{
  const db = fakeDb({
    [base]: { accountantEmail: 'aina@jlr.no' },
    [`${base}/runs/2026-10`]: { status: 'approved', approvedAt: '2026-11-04T10:00:00Z', rows },
  });
  await rejects(sendPayrollRun(db, {
    familyId: 'co', month: '2026-10', uid: 'u', deps: { ...deps, sendMail: async () => { throw new Error('boom'); } },
  }), /Kunne ikke sende/);
  assert.ok(db.writes.at(-1).patch.sendError);
}

console.log('payrollSend.test.mjs ok');
