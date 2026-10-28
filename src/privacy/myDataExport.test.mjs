import assert from 'node:assert/strict';
import {
  EXPORT_FORMAT, buildMyDataExport, exportCount, exportFileName, ownsRow, toPlain,
} from './myDataExport.js';

const ts = (iso) => ({ toDate: () => new Date(iso) });

// Tidsstempler blir ISO-tekst, og tilgangsnøkler følger aldri med.
assert.deepEqual(toPlain({
  at: ts('2026-10-27T08:00:00.000Z'),
  raw: { seconds: 1790000000, nanoseconds: 0 },
  refreshToken: 'hemmelig',
  accessToken: 'hemmelig',
  icsUrl: 'https://kalender/privat',
  nested: { apiKey: 'x', keep: 1 },
  fn: () => 1,
}), {
  at: '2026-10-27T08:00:00.000Z',
  raw: new Date(1790000000 * 1000).toISOString(),
  nested: { keep: 1 },
});

// Timer, fravær og utlegg: bare det som er ført på egen ansattpost, ikke det en leder har registrert for andre.
const who = { uid: 'me', employeeIds: ['emp-me'] };
assert.equal(ownsRow({ employeeId: 'emp-me' }, who, { byEmployee: true }), true);
assert.equal(ownsRow({ employeeId: 'emp-other', createdByUid: 'me' }, who, { byEmployee: true }), false);
assert.equal(ownsRow({ createdBy: 'me' }, who), true);
assert.equal(ownsRow({ assignedTo: ['x', 'me'] }, who), true);
assert.equal(ownsRow({ memberIds: ['me', 'you'] }, who), true);
assert.equal(ownsRow({ createdBy: 'you' }, who), false);

const data = buildMyDataExport({
  uid: 'me',
  account: { email: 'me@firma.no', displayName: 'Meg', providers: ['google.com'] },
  profile: {
    name: 'Meg',
    consents: { version: '3.0.0', termsAt: '2026-10-27T08:00:00.000Z' },
    consentHistory: [{ kind: 'terms', version: '3.0.0', at: ts('2026-10-27T08:00:01.000Z') }],
    fcmToken: 'enhet',
  },
  companies: [{
    id: 'c1',
    name: 'Bygg AS',
    type: 'organization',
    employees: [{ id: 'emp-me', personUid: 'me', person: { firstName: 'Meg' } }],
    notes: [{ id: 'n1', createdBy: 'me' }, { id: 'n2', createdBy: 'you' }],
    tasks: [{ id: 't1', assignedTo: 'me' }],
    events: [{ id: 'e1', memberIds: ['me'] }],
    timeEntries: [
      { id: 'h1', employeeId: 'emp-me', hours: 7.5 },
      { id: 'h2', employeeId: 'emp-other', hours: 8, createdByUid: 'me' },
    ],
    absences: [{ id: 'a1', employeeId: 'emp-me', type: 'ferie' }],
    expenses: [{ id: 'x1', employeeId: 'emp-other' }],
    chats: [
      {
        id: 'family',
        messages: [
          { id: 'm1', senderId: 'me', text: 'Hei alle', createdAt: ts('2026-10-26T10:00:00.000Z') },
          { id: 'm2', senderId: 'you', text: 'Hei' },
        ],
      },
      {
        id: 'dm_me_you',
        title: 'Deg',
        messages: [
          { id: 'm3', senderId: 'you', text: 'Kommer du?', createdAtMs: Date.parse('2026-10-26T11:00:00.000Z') },
          { id: 'm4', senderId: 'me', text: 'Ja', deleted: true },
        ],
      },
    ],
  }],
  personal: { notifications: [{ id: 'v1', title: 'Varsel' }], calendarConnections: [{ id: 'g', type: 'google', refreshToken: 'x' }] },
  now: new Date('2026-10-27T12:00:00.000Z'),
});

assert.equal(data.format, EXPORT_FORMAT);
assert.equal(data.exportedAt, '2026-10-27T12:00:00.000Z');
assert.equal(data.account.email, 'me@firma.no');
assert.equal(data.profile.name, 'Meg');
assert.equal(data.profile.fcmToken, undefined);
assert.equal(data.consents.account.version, '3.0.0');
assert.equal(data.consents.history[0].at, '2026-10-27T08:00:01.000Z');
const company = data.companies[0];
assert.deepEqual(company.notes.map((row) => row.id), ['n1']);
assert.deepEqual(company.hours.map((row) => row.id), ['h1']);
assert.deepEqual(company.absence.map((row) => row.id), ['a1']);
assert.deepEqual(company.expenses, []);
assert.equal(company.myEmployeeRecords[0].id, 'emp-me');
// Fellesrommet: bare egne meldinger. Direktemeldinger: hele tråden, uten slettede.
const [room, dm] = company.chats;
assert.equal(room.sharedRoom, true);
assert.deepEqual(room.messages.map((row) => row.text), ['Hei alle']);
assert.equal(room.messages[0].at, '2026-10-26T10:00:00.000Z');
assert.deepEqual(dm.messages.map((row) => [row.text, row.fromMe]), [['Kommer du?', false]]);
assert.equal(dm.messages[0].at, '2026-10-26T11:00:00.000Z');
assert.equal(data.personal.calendarConnections[0].refreshToken, undefined);
assert.equal(JSON.stringify(data).includes('hemmelig'), false);
assert.equal(exportCount(data), 1 + 1 + 1 + 1 + 1 + 1 + 1 + 2);
assert.equal(exportFileName(new Date('2026-10-27T12:00:00.000Z')), 'protop-mine-data-2026-10-27.json');

// Uten bedrifter og profil blir filen likevel gyldig.
const empty = buildMyDataExport({ uid: 'me' });
assert.deepEqual(empty.companies, []);
assert.deepEqual(empty.friendChats, []);
assert.ok(JSON.parse(JSON.stringify(empty)));

console.log('myDataExport.test.mjs: ok');
