import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LOOKUP_LIMITS, lookupProfileFields, lookupRateScopes } from './friendLookupLogic.js';

const data = {
  displayName: 'Ulf Utenfor',
  username: 'ulf',
  email: 'ulf@firma.no',
  phone: '+4791234567',
  photoURL: 'https://bilde',
  avatarId: 'a1',
  role: 'child',
};

test('oppslag på e-post/telefon gir bare uid (SOS-04)', () => {
  for (const kind of ['email', 'phone']) {
    assert.deepEqual(lookupProfileFields('u1', data, kind), { uid: 'u1', name: '', username: '' });
  }
});

test('oppslag på brukernavn gir navn og brukernavn, aldri kontaktinfo, bilde eller rolle', () => {
  const out = lookupProfileFields('u1', data, 'username');
  assert.deepEqual(out, { uid: 'u1', name: 'Ulf Utenfor', username: 'ulf' });
  assert.equal(lookupProfileFields('', data, 'username'), null);
  assert.equal(lookupProfileFields('u2', {}, 'username').name, 'Bruker');
});

test('e-post og telefon har en egen, lavere grense per bruker', () => {
  assert.deepEqual(lookupRateScopes('email'), ['any', 'contact']);
  assert.deepEqual(lookupRateScopes('phone'), ['any', 'contact']);
  assert.deepEqual(lookupRateScopes('username'), ['any']);
  assert.ok(LOOKUP_LIMITS.contact.hourlyLimit < LOOKUP_LIMITS.any.hourlyLimit);
  assert.ok(LOOKUP_LIMITS.contact.dailyLimit <= 50);
  assert.ok(LOOKUP_LIMITS.any.dailyLimit > 0);
});

test('lookupFriendProfile bruker grensene og det slanke svaret', () => {
  const src = readFileSync(new URL('./friendLookup.js', import.meta.url), 'utf8');
  assert.match(src, /lookupRateScopes\(kind\)/);
  assert.match(src, /assertRateLimits\(db/);
  assert.match(src, /lookupProfileFields\(uid, data, kind\)/);
  // Grensen sjekkes før noe slås opp.
  assert.ok(src.indexOf('assertRateLimits(db') < src.indexOf("db.collection('users')"));
  assert.doesNotMatch(src, /photoURL|avatarId|usernameLower/);
});

test('SEC-25: telefonoppslaget treffer bare et nummer kontoen har bekreftet med SMS', () => {
  const src = readFileSync(new URL('./friendLookup.js', import.meta.url), 'utf8');
  const phone = src.slice(src.indexOf('if (looksLikePhone) {'), src.indexOf("const u = identifier.toLowerCase()"));
  assert.match(phone, /findVerifiedPhoneUid\(phoneCandidates, adminAuth\)/);
  // users.phone, parents.phone og children.phone skriver brukeren (eller en foresatt) selv.
  assert.doesNotMatch(src, /where\('phone'/);
  // Svaret er bare uid, som før.
  assert.match(phone, /publicFriendProfile\(uid, \{\}\)/);
});

test('appen sier fra når grensen er nådd, i stedet for å invitere personen som ny', () => {
  const src = readFileSync(new URL('../src/utils/friends.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function findExistingUserForFriend'), src.indexOf('export async function inviteExistingFriend'));
  assert.match(fn, /for mange/i);
  assert.match(fn, /throw new Error\(res\.data\.error\)/);
});
