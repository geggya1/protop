/**
 * DS-07: hva syncMyProfile skriver på medlemskap og ansattkort når personen endrer profilen.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  employeePersonPatch,
  memberProfilePatch,
  previousProfile,
  profileFromUser,
  splitPersonName,
} from './profileSync.js';

const profile = profileFromUser({ displayName: 'Kari Berg', photoURL: 'ny.jpg', phone: '+4790000000', avatarId: 'fox' });
const before = previousProfile({ name: 'Kari Nordmann', photoURL: 'gammel.jpg', phone: '+4791111111' });

test('medlemskapet får navn, bilde og telefon fra profilen', () => {
  assert.deepEqual(memberProfilePatch({ uid: 'u', name: 'Kari Nordmann', photoURL: 'gammel.jpg', active: true }, profile), {
    name: 'Kari Berg', photoURL: 'ny.jpg', avatarId: 'fox', phone: '+4790000000',
  });
  assert.equal(memberProfilePatch({ name: 'Kari Berg', photoURL: 'ny.jpg', avatarId: 'fox', phone: '+4790000000' }, profile), null, 'uendret');
  assert.equal(memberProfilePatch({ name: 'Kari', active: false }, profile), null, 'avsluttet medlemskap');
  assert.equal(memberProfilePatch({ name: 'Kari', leftAt: '2026-01-01' }, profile), null);
  assert.equal(memberProfilePatch({ name: 'Kari', inviteStatus: 'pending' }, profile), null, 'ubesvart invitasjon');
});

test('ansattkortet følger profilen bare der det fulgte den før', () => {
  const following = {
    id: 'e1',
    person: { firstName: 'Kari', lastName: 'Nordmann', photoUrl: 'gammel.jpg', phone: '' },
    company: { status: 'active' },
  };
  assert.deepEqual(employeePersonPatch(following, profile, before), {
    firstName: 'Kari', middleName: '', lastName: 'Berg', photoUrl: 'ny.jpg', phone: '+4790000000',
  });
  // HR har skrevet fullt navn og et annet bilde: det står.
  const hr = {
    id: 'e2',
    person: { firstName: 'Kari Elise', lastName: 'Nordmann', photoUrl: 'cv.jpg', phone: '+4791111111' },
    company: { status: 'active' },
  };
  assert.deepEqual(employeePersonPatch(hr, profile, before), { phone: '+4790000000' });
  // Flere kandidater for «før» (klienten og medlemsdokumentet).
  assert.ok(employeePersonPatch(hr, profile, [before, { name: 'Kari Elise Nordmann' }]).lastName === 'Berg');
  // Avsluttet ansettelse får ikke nye opplysninger.
  assert.equal(employeePersonPatch({ ...following, company: { status: 'inactive' } }, profile, before), null);
  // Allerede likt.
  assert.equal(employeePersonPatch({ id: 'e3', person: { firstName: 'Kari', lastName: 'Berg', photoUrl: 'ny.jpg', phone: '+4790000000' }, company: {} }, profile, before), null);
});

test('navnet deles i fornavn og etternavn', () => {
  assert.deepEqual(splitPersonName('Geir Ove Andersen'), { firstName: 'Geir Ove', middleName: '', lastName: 'Andersen' });
  assert.deepEqual(splitPersonName('Cher'), { firstName: 'Cher', middleName: '', lastName: '' });
});
