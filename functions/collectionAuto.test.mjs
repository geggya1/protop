/**
 * Automatisk purring og inkasso: feilsikring mot PowerOffice, rekkefølge og hva som sendes.
 */
import assert from 'node:assert/strict';
import { autoStepFor, osloToday, runCollectionAutomation, runCompanyCollection } from './collectionAuto.js';

assert.equal(osloToday(new Date('2026-11-14T23:30:00Z')), '2026-11-15', 'dagen regnes i norsk tid');

const settings = {
  reminderFee: 38, friendlyReminderDays: 3, reminderDays: 14,
  collectionAutoFriendly: true, collectionAutoReminder: true, collectionAutoNotice: true, collectionAutoDebt: false,
};

function invoiceDoc(id, extra = {}) {
  return {
    id,
    invoiceNumber: '10000', status: 'sent', sentAt: '2026-10-29', invoiceDate: '2026-10-29', dueDate: '2026-11-12',
    amountInclVat: 1000, outstandingAmount: 1000, kid: '123', customerName: 'Kunde AS', customerEmail: 'faktura@kunde.no',
    poweroffice: { env: 'prod', state: 'sent', outgoingInvoiceId: `oi-${id}`, invoiceNo: 10000 },
    ...extra,
  };
}

function fakeDb({ invoices = [], projectSettings = settings, clients = [{ id: 'co', data: { connected: true } }] } = {}) {
  const updates = [];
  const sets = [];
  const docs = invoices.map((row) => ({
    id: row.id,
    data: () => row,
    ref: { update: async (patch) => { updates.push({ id: row.id, patch }); } },
  }));
  const db = {
    updates,
    sets,
    doc(path) {
      return {
        async get() {
          if (path.endsWith('/projects/state')) return { exists: true, data: () => ({ state: { companyInvoiceDefaults: projectSettings } }) };
          if (path.startsWith('families/')) return { exists: true, data: () => ({ name: 'Bedrift', company: { navn: 'CONSULT1 AS', organisasjonsnummer: '916538804', bankAccount: '12345678903' } }) };
          return { exists: false, data: () => ({}) };
        },
      };
    },
    collection(path) {
      return {
        where: () => ({
          get: async () => (path === 'powerOfficeClients'
            ? { docs: clients.map((row) => ({ id: row.id, data: () => row.data, ref: { set: async (data) => { sets.push({ id: row.id, data }); } } })) }
            : { docs }),
        }),
      };
    },
  };
  return db;
}

{
  // Hvilket steg som er neste i dag.
  const day = (today, extra) => autoStepFor({ ...invoiceDoc('a'), ...extra, poweroffice: { ...invoiceDoc('a').poweroffice, ...(extra?.poweroffice || {}) } }, { today, settings });
  assert.equal(day('2026-11-14'), null, 'påminnelsen går 3 dager etter forfall');
  assert.equal(day('2026-11-15').kind, 'friendly');
  assert.equal(day('2026-11-15').fee, 0);
  assert.equal(day('2026-11-15', { poweroffice: { env: 'demo' } }), null, 'aldri fra testklienten');
  assert.equal(day('2026-11-15', { poweroffice: { outgoingInvoiceId: '' } }), null, 'bare når betalingen kommer fra PowerOffice');
  assert.equal(day('2026-11-15', { status: 'paid', outstandingAmount: 0 }), null);
  assert.equal(day('2026-11-15', { collection: { hold: true } }), null, 'på vent');
  const purring = day('2026-11-26', { collection: { steps: [{ id: 's1', kind: 'friendly', at: '2026-11-15T07:30:00Z' }] } });
  assert.equal(purring.kind, 'reminder');
  assert.equal(purring.fee, 38);
  assert.equal(purring.deadline, '2026-12-10');
  // Inkasso er ikke slått på automatisk.
  const noDebt = day('2027-01-20', { collection: { steps: [
    { id: 's1', kind: 'friendly', at: '2026-11-15T07:30:00Z' },
    { id: 's2', kind: 'reminder', at: '2026-11-26T07:30:00Z', deadline: '2026-12-10', fee: 38 },
    { id: 's3', kind: 'notice', at: '2026-12-11T07:30:00Z', deadline: '2026-12-25', fee: 38 },
  ] } });
  assert.equal(noDebt, null);
}

{
  // Feiler hentingen fra PowerOffice, sendes ingenting.
  const db = fakeDb({ invoices: [invoiceDoc('a')] });
  const sent = [];
  const result = await runCompanyCollection(db, 'co', {}, {
    now: new Date('2026-11-15T06:30:00Z'),
    send: async (message) => { sent.push(message); },
    sync: async () => { throw new Error('PowerOffice svarte 503'); },
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /feilet: PowerOffice svarte 503/);
  assert.equal(sent.length, 0);
  assert.equal(db.updates.length, 0);
}

{
  // Hentingen virker: påminnelse til kunden, steget lagres. Uten e-post: hendelse én gang.
  const db = fakeDb({ invoices: [invoiceDoc('a'), invoiceDoc('b', { customerEmail: '' }), invoiceDoc('c', { poweroffice: { env: 'demo', state: 'sent', outgoingInvoiceId: 'x' } })] });
  const sent = [];
  let synced = 0;
  const result = await runCompanyCollection(db, 'co', {}, {
    now: new Date('2026-11-15T06:30:00Z'),
    send: async (message) => { sent.push(message); },
    sync: async () => { synced += 1; },
  });
  assert.equal(synced, 1, 'betalingene hentes før noe sendes');
  assert.deepEqual(result, { ok: true, sent: 1, blocked: 1, reason: '' });
  assert.equal(sent[0].to, 'faktura@kunde.no');
  assert.equal(sent[0].subject, 'Påminnelse: faktura 10000 fra CONSULT1 AS');
  assert.equal(sent[0].attachments[0].filename, 'Paminnelse-faktura-10000.pdf');
  const a = db.updates.find((row) => row.id === 'a').patch;
  assert.equal(a['collection.friendlySent'], true);
  const b = db.updates.find((row) => row.id === 'b').patch;
  assert.equal(b['collection.autoBlocked'], 'friendly:mangler-epost');
  assert.equal(db.updates.some((row) => row.id === 'c'), false, 'testklienten røres ikke');
  // Samme blokkering skrives ikke på nytt neste kjøring.
  const again = fakeDb({ invoices: [invoiceDoc('b', { customerEmail: '', collection: { autoBlocked: 'friendly:mangler-epost' } })] });
  await runCompanyCollection(again, 'co', {}, { now: new Date('2026-11-15T12:30:00Z'), send: async () => {}, sync: async () => {} });
  assert.equal(again.updates.length, 0);
}

{
  // Uten automatikk i innstillingene: ingen henting, ingen sending, ingen status.
  const db = fakeDb({ invoices: [invoiceDoc('a')], projectSettings: { reminderFee: 38 } });
  let synced = 0;
  const out = await runCollectionAutomation(db, { now: new Date('2026-11-15T06:30:00Z'), send: async () => {}, sync: async () => { synced += 1; } });
  assert.deepEqual(out, { companies: 1, sent: 0, blocked: 0, failed: 0 });
  assert.equal(synced, 0);
  assert.equal(db.sets.length, 0);
  // Med automatikk og feil ved henting: lagres som hoppet over.
  const failing = fakeDb({ invoices: [invoiceDoc('a')] });
  const res = await runCollectionAutomation(failing, { now: new Date('2026-11-15T06:30:00Z'), send: async () => {}, sync: async () => { throw new Error('nede'); } });
  assert.equal(res.failed, 1);
  assert.equal(failing.sets[0].data.lastCollectionRun.ok, false);
}

console.log('collectionAuto.test.mjs: ok');
