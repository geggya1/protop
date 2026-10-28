/**
 * Telefonoppslag ved invitasjon bruker bare bekreftede numre (REV-22).
 *   node --test functions/verifiedPhone.test.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { e164Candidates, findVerifiedPhoneUid } from './verifiedPhone.js';

function authWith(accounts, { fail = null } = {}) {
  const asked = [];
  return {
    asked,
    getUserByPhoneNumber: async (phone) => {
      asked.push(phone);
      if (fail) throw fail;
      const hit = accounts[phone];
      if (hit) return { uid: hit, phoneNumber: phone };
      const err = new Error('no user');
      err.code = 'auth/user-not-found';
      throw err;
    },
  };
}

test('bare E.164-numre slås opp, uten duplikater', () => {
  assert.deepEqual(e164Candidates(['99999999', '+4799999999', '4799999999', '+4799999999', '+47 999', 'x']), ['+4799999999']);
  assert.deepEqual(e164Candidates([]), []);
});

test('kontoen med bekreftet nummer (Auth phoneNumber) er treffet', async () => {
  const auth = authWith({ '+4799999999': 'kari' });
  assert.equal(await findVerifiedPhoneUid(['99999999', '+4799999999'], auth), 'kari');
});

test('ingen konto har nummeret bekreftet: ingen treff', async () => {
  const auth = authWith({});
  assert.equal(await findVerifiedPhoneUid(['+4799999999', '+4747999999'], auth), '');
  assert.deepEqual(auth.asked, ['+4799999999', '+4747999999']);
});

test('feil fra Auth gir ingen treff (ikke et nummer fra profilen i stedet)', async () => {
  const down = new Error('connect ECONNREFUSED');
  down.code = 'app/network-error';
  assert.equal(await findVerifiedPhoneUid(['+4799999999'], authWith({ '+4799999999': 'kari' }, { fail: down })), '');
  assert.equal(await findVerifiedPhoneUid(['+4799999999'], null), '');
});
