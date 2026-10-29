import assert from 'node:assert/strict';
import {
  moveStaffOrder, orderStaff, profileStaff, shiftStaffOrder, staffCandidates,
} from './companyStaff.js';

const departments = [{ id: 'd1', name: 'Bygg og anlegg' }, { id: 'd2', name: 'Teknisk' }];
const people = [
  {
    id: 'anders',
    person: {
      firstName: 'Anders', lastName: 'Rolandsen', phone: '99376973', email: 'privat@example.no',
      photoUrl: 'https://cdn.example/anders.jpg', educationLevel: 'Siv. ing.',
    },
    company: { status: 'active', personnelKind: 'staff', title: 'Daglig leder', email: 'ar@consult1.no', departmentIds: ['d1'] },
  },
  {
    id: 'linda',
    person: { firstName: 'Linda', lastName: 'Øie', educationLevel: 'Master i prosjektledelse fra NTNU, 2012', photoUrl: 'javascript:alert(1)' },
    company: { status: 'active', personnelKind: 'staff', title: 'Markedsleder', departmentIds: ['d1', 'd2'] },
  },
  { id: 'ext', person: { firstName: 'Eva', lastName: 'Ekstern' }, company: { status: 'active', personnelKind: 'external' } },
  { id: 'inn', person: { firstName: 'Ivar', lastName: 'Innleid' }, company: { status: 'active', personnelKind: 'innleid' } },
  { id: 'perm', person: { firstName: 'Per', lastName: 'Permisjon' }, company: { status: 'leave', personnelKind: 'staff' } },
  { id: 'old', person: { firstName: 'Olga', lastName: 'Sluttet' }, company: { status: 'inactive', personnelKind: 'staff' } },
  { id: 'end', person: { firstName: 'Eli', lastName: 'Slutt' }, company: { status: 'active', personnelKind: 'staff', periodTo: '2001-01-01' } },
  { id: 'trash', person: { firstName: 'Tor' }, company: { status: 'deleted', personnelKind: 'staff' } },
];

const all = staffCandidates(people, departments);
// Bare status Aktiv: permisjon, deaktivert, sluttdato passert og papirkurv er ute.
assert.deepEqual(all.map((row) => row.id).sort(), ['anders', 'ext', 'inn', 'linda']);
const anders = all.find((row) => row.id === 'anders');
assert.deepEqual(anders, {
  id: 'anders',
  name: 'Anders Rolandsen',
  degree: 'Siv. ing.',
  title: 'Daglig leder',
  department: 'Bygg og anlegg',
  email: 'ar@consult1.no',
  phone: '993 76 973',
  photoUrl: 'https://cdn.example/anders.jpg',
  external: false,
});
// Telefon: mobil 3-2-3, fasttelefon 2-2-2-2, +47 tas bort, andre land står som lagret.
const phones = staffCandidates([
  { id: 'm', person: { phone: '+4747278899' }, company: { status: 'active' } },
  { id: 'f', person: { phone: '52055210' }, company: { status: 'active' } },
  { id: 's', person: { phone: '+46701234567' }, company: { status: 'active' } },
]).map((row) => row.phone);
assert.deepEqual(phones, ['472 78 899', '52 05 52 10', '+46701234567']);
const linda = all.find((row) => row.id === 'linda');
assert.equal(linda.degree, '', 'lang utdanningstekst passer ikke etter navnet');
assert.equal(linda.photoUrl, '');
assert.equal(linda.department, 'Bygg og anlegg, Teknisk');
assert.equal(all.find((row) => row.id === 'ext').external, true);
assert.equal(all.find((row) => row.id === 'inn').external, true);

// Eksterne er av som standard.
assert.deepEqual(profileStaff(people, { departments }).map((row) => row.id), ['anders', 'linda']);
assert.deepEqual(
  profileStaff(people, { departments, includeExternal: true }).map((row) => row.id),
  ['anders', 'ext', 'inn', 'linda'],
);

// Lagret rekkefølge først, nye personer etter navn.
assert.deepEqual(orderStaff(all, ['linda', 'gone']).map((row) => row.id), ['linda', 'anders', 'ext', 'inn']);
assert.deepEqual(profileStaff(people, { departments, order: ['linda'] }).map((row) => row.id), ['linda', 'anders']);

// Dra og slipp: fremover havner kortet etter målet, bakover foran.
assert.deepEqual(moveStaffOrder(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd']);
assert.deepEqual(moveStaffOrder(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c']);
assert.deepEqual(moveStaffOrder(['a', 'b'], 'a', 'x'), ['a', 'b']);

// Pilene flytter blant dem som vises; en skjult ekstern blir liggende.
assert.deepEqual(shiftStaffOrder(['a', 'ext', 'b', 'c'], ['a', 'b', 'c'], 'b', -1), ['b', 'a', 'ext', 'c']);
assert.deepEqual(shiftStaffOrder(['a', 'b'], ['a', 'b'], 'a', -1), ['a', 'b']);

console.log('companyStaff.test.mjs ok');
