import assert from 'node:assert/strict';
import {
  canManageKlassen,
  classDisplayTitle,
  filterKlassenForChild,
  klassenChatId,
  normalizePlace,
  sortContacts,
  CONTACT_KINDS,
} from './klassenLogic.js';

assert.equal(canManageKlassen({ isParent: true, isChild: false }), true);
assert.equal(canManageKlassen({ isParent: false, isAdmin: true, isChild: false }), true);
assert.equal(canManageKlassen({ isParent: true, isChild: true }), false);
assert.equal(canManageKlassen({ isChild: true }), false);

assert.equal(klassenChatId('abc'), 'klassen_abc');
assert.equal(classDisplayTitle({ name: '7C', schoolName: 'Sande skole' }), '7C · Sande skole');
assert.equal(classDisplayTitle({ name: '7C' }), '7C');
assert.equal(classDisplayTitle({}), 'Klasse');

assert.deepEqual(normalizePlace({ label: 'Sande skole', lat: 59.5, lng: 10.2, placeId: 'x' }), {
  label: 'Sande skole',
  lat: 59.5,
  lng: 10.2,
  placeId: 'x',
});
assert.equal(normalizePlace(null), null);
assert.equal(normalizePlace({ label: '  ' }), null);

const list = [
  { id: '1', name: '7A', childIds: ['c1'] },
  { id: '2', name: '7C', childIds: ['c2'] },
  { id: '3', name: 'Alle', childIds: [] },
];
assert.deepEqual(filterKlassenForChild(list, 'c2').map((k) => k.id), ['2', '3']);
assert.equal(filterKlassenForChild(list, null).length, 3);

const sorted = sortContacts([
  { kind: CONTACT_KINDS.teacher, name: 'Anne' },
  { kind: CONTACT_KINDS.student, name: 'Per' },
  { kind: CONTACT_KINDS.guardian, name: 'Kari' },
  { kind: CONTACT_KINDS.student, name: 'Ada' },
]);
assert.deepEqual(sorted.map((c) => c.name), ['Ada', 'Per', 'Kari', 'Anne']);

console.log('klassen.test.mjs ok');
