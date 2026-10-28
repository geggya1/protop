import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FRIEND_INVITE_RECIPIENT_MAX,
  FRIEND_INVITE_REPEAT_MS,
  FRIEND_REMINDER_MS,
  claimFriendInviteDelivery,
  inviteDeliveryDecision,
  inviteRecipientKey,
  reminderDeliveryAllowed,
} from './friendInviteLimits.js';
import { cleanSenderName, loadSenderName, pickSenderName } from './senderName.js';

const NOW = Date.parse('2026-10-28T08:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

test('samme avsender kan ikke purre samme mottaker (30 dager)', () => {
  assert.deepEqual(inviteDeliveryDecision({ now: NOW }), { ok: true, recent: [NOW] });
  assert.deepEqual(inviteDeliveryDecision({ lastFromSender: NOW - DAY, now: NOW }), { ok: false, reason: 'already-invited' });
  assert.equal(inviteDeliveryDecision({ lastFromSender: NOW - FRIEND_INVITE_REPEAT_MS - 1, now: NOW }).ok, true);
});

test('en mottaker får høyst tre invitasjoner på 30 dager fra alle avsendere', () => {
  const recent = [NOW - DAY, NOW - 2 * DAY, NOW - 3 * DAY];
  assert.equal(FRIEND_INVITE_RECIPIENT_MAX, 3);
  assert.deepEqual(inviteDeliveryDecision({ recentToRecipient: recent, now: NOW }), { ok: false, reason: 'recipient-limit' });
  const old = [NOW - 40 * DAY, NOW - DAY];
  assert.deepEqual(inviteDeliveryDecision({ recentToRecipient: old, now: NOW }), { ok: true, recent: [NOW - DAY, NOW] });
});

test('påminnelse til en med konto høyst hver 7. dag', () => {
  assert.equal(reminderDeliveryAllowed(null, NOW), true);
  assert.equal(reminderDeliveryAllowed(NOW - DAY, NOW), false);
  assert.equal(reminderDeliveryAllowed(NOW - FRIEND_REMINDER_MS, NOW), true);
  assert.equal(reminderDeliveryAllowed({ toMillis: () => NOW - 2 * DAY }, NOW), false);
});

test('mottakeren sammenlignes uten store bokstaver og mellomrom', () => {
  assert.equal(inviteRecipientKey(' Kari@Bygg.NO '), 'kari@bygg.no');
  assert.equal(inviteRecipientKey('+47 912 34 567'), '+4791234567');
});

/** Liten Firestore-erstatning for transaksjonen. */
function fakeDb() {
  const store = new Map();
  const ref = (path) => ({ path });
  return {
    store,
    doc: ref,
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: async (r) => ({ exists: store.has(r.path), data: () => store.get(r.path) }),
        set: (r, data) => writes.push([r.path, data]),
      };
      const out = await fn(tx);
      for (const [path, data] of writes) store.set(path, data);
      return out;
    },
  };
}

test('utsendingen reserveres i en transaksjon: andre gang stoppes', async () => {
  const db = fakeDb();
  const first = await claimFriendInviteDelivery(db, { senderUid: 'ola', recipient: 'Kari@Bygg.no', channel: 'email', now: NOW });
  assert.equal(first.ok, true);
  const again = await claimFriendInviteDelivery(db, { senderUid: 'ola', recipient: 'kari@bygg.no', channel: 'email', now: NOW + DAY });
  assert.deepEqual(again, { ok: false, reason: 'already-invited' });
  // SMS telles for seg.
  assert.equal((await claimFriendInviteDelivery(db, { senderUid: 'ola', recipient: '+4791234567', channel: 'sms', now: NOW })).ok, true);
  // Andre avsendere: til sammen tre.
  assert.equal((await claimFriendInviteDelivery(db, { senderUid: 'per', recipient: 'kari@bygg.no', channel: 'email', now: NOW })).ok, true);
  assert.equal((await claimFriendInviteDelivery(db, { senderUid: 'pål', recipient: 'kari@bygg.no', channel: 'email', now: NOW })).ok, true);
  assert.deepEqual(
    await claimFriendInviteDelivery(db, { senderUid: 'espen', recipient: 'kari@bygg.no', channel: 'email', now: NOW }),
    { ok: false, reason: 'recipient-limit' },
  );
});

test('avsendernavnet er et navn, ikke en lenke eller adresse', () => {
  assert.equal(cleanSenderName('  Ola   Nordmann '), 'Ola Nordmann');
  assert.equal(cleanSenderName('Ola\nNordmann'), 'Ola Nordmann');
  for (const bad of ['support@protop.no', 'Gå til www.svindel.no', 'https://evil.example', 'Kunde.com', 'Bruker', 'x', '']) {
    assert.equal(cleanSenderName(bad), '', bad);
  }
  assert.equal(cleanSenderName('A'.repeat(80)).length, 60);
  assert.equal(pickSenderName(['', 'besøk www.x.no', 'Eva Eiersen', 'Annen']), 'Eva Eiersen');
});

test('navnet hentes fra bedriftens medarbeiderpost, så profilen, så innloggingen', async () => {
  const docs = {
    'users/eva': { displayName: 'Eva fra profilen' },
    'parents/eva': { name: 'Eva fra parents' },
  };
  const employees = [{ person: { firstName: 'Eva', lastName: 'Eiersen' }, personUid: 'eva' }];
  const db = {
    doc: (path) => ({ get: async () => ({ exists: path in docs, data: () => docs[path] }) }),
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ docs: employees.map((row) => ({ data: () => row })) }) }) }),
    }),
  };
  assert.equal(await loadSenderName(db, 'eva', { familyId: 'co', tokenName: 'Token' }), 'Eva Eiersen');
  assert.equal(await loadSenderName(db, 'eva', { tokenName: 'Token' }), 'Eva fra profilen');
  assert.equal(await loadSenderName(db, '', { tokenName: 'Token Navn' }), 'Token Navn');
});
