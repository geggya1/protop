import assert from 'node:assert/strict';
import { normalizeClassListContacts } from './classListNormalize.js';

const empty = normalizeClassListContacts({});
assert.equal(empty.contacts.length, 0);

const parsed = normalizeClassListContacts({
  className: '7C',
  schoolName: 'Sande skole',
  summary: 'Fant 3',
  confidence: 0.9,
  contacts: [
    { kind: 'student', name: 'Ada Lovelace', phone: '90000001' },
    { kind: 'foresatt', name: 'Mor Lovelace', phone: '90000002', linkedStudentName: 'Ada Lovelace' },
    { kind: 'lærer', name: 'Ola Lærer', roleTitle: 'Kontaktlærer', email: 'ola@skole.no' },
    { kind: 'student', name: '  ' },
    { kind: 'student', name: 'Ada Lovelace', phone: '90000001' },
  ],
});

assert.equal(parsed.className, '7C');
assert.equal(parsed.schoolName, 'Sande skole');
assert.equal(parsed.contacts.length, 3);
assert.equal(parsed.contacts[0].kind, 'student');
assert.equal(parsed.contacts[1].kind, 'guardian');
assert.equal(parsed.contacts[1].linkedStudentName, 'Ada Lovelace');
assert.equal(parsed.contacts[2].kind, 'teacher');
assert.equal(parsed.contacts[2].roleTitle, 'Kontaktlærer');

console.log('classListNormalize ok');
