import assert from 'node:assert/strict';
import { companyChatContacts, companyChatLabel, STAFF_CHAT_ID } from './companyChat.js';

const U = (name) => `${name}`.padEnd(28, 'x');

const emp = (id, extra = {}) => ({
  id,
  person: { firstName: extra.first || id, lastName: extra.last || 'Hansen', email: extra.email || '' },
  personUid: extra.uid || '',
  company: {
    status: extra.status || 'active',
    personnelKind: extra.kind || 'staff',
    accessLevels: extra.levels || ['ansatt'],
    accessLevel: (extra.levels || ['ansatt']).slice(-1)[0],
    title: extra.title || '',
  },
});

const parent = (uid, extra = {}) => ({
  id: uid,
  uid,
  name: extra.name || uid.replace(/x+$/, ''),
  email: extra.email || '',
  active: extra.active,
  placeholder: extra.placeholder,
  inviteStatus: extra.inviteStatus,
  photoURL: extra.photoURL || null,
});

const employees = [
  emp('kari', { uid: U('kari'), title: 'Rådgiver' }),
  emp('ola', { uid: U('ola') }),
  emp('per', { uid: U('per'), status: 'inactive' }),
  emp('slettet', { uid: U('slettet'), status: 'deleted' }),
  emp('perm', { uid: U('perm'), status: 'leave' }),
  emp('regn', { uid: U('regn'), levels: ['regnskap_ekstern'] }),
  emp('inn', { uid: U('inn'), levels: ['innleie_ekstern'] }),
  emp('ny', {}),
  emp('nyekstern', { levels: ['regnskap_ekstern'] }),
  emp('epost', { email: 'eva@firma.no' }),
  emp('gikk', { uid: U('gikk') }),
];

const parents = [
  parent(U('eier'), { name: 'Eier Eiersen' }),
  parent(U('kari'), { photoURL: 'https://bilde/kari.jpg' }),
  parent(U('ola')),
  parent(U('eva'), { email: 'Eva@firma.no' }),
  parent(U('venter'), { placeholder: true, inviteStatus: 'pending' }),
  parent(U('gikk'), { active: false }),
];

const all = companyChatContacts({ employees, parents, uid: U('kari') });

assert.equal(STAFF_CHAT_ID.startsWith('g_'), true, 'fellestråden varsler bare memberIds');

// Fellestråden: aktive faste ansatte med innlogging, også permisjon og eier uten ansattkort.
// Ikke deaktiverte, slettede, eksterne, innleide, ventende invitasjoner eller de som har gått ut.
assert.deepEqual(
  all.staffChatIds,
  [U('eier'), U('eva'), U('kari'), U('ola'), U('perm')].sort(),
);
assert.equal(all.inStaffChat, true);

// Listen over ansatte viser ikke meg selv, og bruker navnet på ansattkortet.
assert.deepEqual(all.staff.map((p) => p.name), ['Eier Eiersen', 'epost Hansen', 'ola Hansen', 'perm Hansen']);
assert.equal(all.staff.find((p) => p.uid === U('eva')).kind, 'staff');

// Eksterne og innleide kan få meldinger én og én, men står for seg.
assert.deepEqual(all.external.map((p) => p.uid).sort(), [U('inn'), U('regn')].sort());
assert.deepEqual(all.external.map((p) => p.kind).sort(), ['external', 'innleid']);

// Faste ansatte uten innlogging telles, så siden kan si hvorfor de ikke vises.
assert.equal(all.withoutLogin, 1);

// Bildet fra kontoen brukes, og tittelen fra ansattkortet.
const ola = companyChatContacts({ employees, parents, uid: U('ola') });
const kari = ola.staff.find((p) => p.uid === U('kari'));
assert.equal(kari.photoURL, 'https://bilde/kari.jpg');
assert.equal(kari.title, 'Rådgiver');

// En ekstern ser ikke fellestråden, men kan skrive til de ansatte. Andre eksterne vises ikke.
const ext = companyChatContacts({ employees, parents, uid: U('regn') });
assert.equal(ext.inStaffChat, false);
assert.ok(ext.staff.some((p) => p.uid === U('kari')));
assert.deepEqual(ext.external, []);
assert.equal(ext.withoutLogin, 0);

// Samme person med to kort: det aktive faste kortet vinner.
const twice = companyChatContacts({
  employees: [
    emp('a1', { uid: U('to'), levels: ['regnskap_ekstern'] }),
    emp('a2', { uid: U('to') }),
  ],
  parents: [parent(U('to')), parent(U('meg'))],
  uid: U('meg'),
});
assert.deepEqual(twice.staffChatIds, [U('meg'), U('to')].sort());
assert.equal(twice.inStaffChat, true);
assert.equal(twice.external.length, 0);

// Undertekst: stillingen, ellers personellgruppen.
const tk = (key) => key;
assert.equal(companyChatLabel({ title: 'Rådgiver', kind: 'staff' }, tk), 'Rådgiver');
assert.equal(companyChatLabel({ kind: 'staff' }, tk), 'chat.staffLabel');
assert.equal(companyChatLabel({ kind: 'external' }, tk), 'chat.externalLabel');
assert.equal(companyChatLabel({ kind: 'innleid' }, tk), 'chat.hiredLabel');

// Uten noe å vise.
const empty = companyChatContacts();
assert.deepEqual(empty, { staffChatIds: [], inStaffChat: false, staff: [], external: [], withoutLogin: 0 });

console.log('companyChat.test.mjs: ok');
