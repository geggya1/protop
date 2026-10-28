/**
 * SEC-17: e-post fra Microsoft regnes som bekreftet bare når Microsofts token sier det.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import {
  DEFAULT_MICROSOFT_CLIENT_ID, MICROSOFT_CONSUMER_TENANT, confirmMicrosoftEmailFor,
  microsoftAudiences, microsoftEmailVerdict, verifyMicrosoftIdToken,
} from './microsoftEmail.js';
import { emailTrusted } from './security.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };
const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
const NOW = Date.parse('2026-10-28T12:00:00Z');
const TENANT = '11111111-2222-3333-4444-555555555555';

function b64(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function token(claims = {}, { kid = 'k1', key = privateKey, alg = 'RS256' } = {}) {
  const tid = claims.tid ?? TENANT;
  const body = {
    aud: DEFAULT_MICROSOFT_CLIENT_ID,
    iss: `https://login.microsoftonline.com/${tid}/v2.0`,
    tid,
    exp: Math.floor(NOW / 1000) + 3600,
    nbf: Math.floor(NOW / 1000) - 60,
    email: 'kari@firma.no',
    ...claims,
  };
  const head = b64({ alg, kid, typ: 'JWT' });
  const payload = b64(body);
  const sig = sign('RSA-SHA256', Buffer.from(`${head}.${payload}`), key).toString('base64url');
  return `${head}.${payload}.${sig}`;
}

const check = (t, extra = {}) => verifyMicrosoftIdToken(t, { keys: [jwk], now: NOW, ...extra });

test('gyldig token fra Microsoft godtas; feil nøkkel, utsteder, mottaker og utløp avvises', () => {
  assert.equal(check(token()).ok, true);
  assert.equal(check(token({}, { key: other.privateKey })).error, 'bad-signature');
  assert.equal(check(token({}, { kid: 'ukjent' })).error, 'unknown-key');
  assert.equal(check(token({}, { alg: 'HS256' })).error, 'bad-alg');
  assert.equal(check(token({ iss: 'https://evil.example/v2.0' })).error, 'bad-issuer');
  assert.equal(check(token({ aud: 'annen-app' })).error, 'bad-audience');
  assert.equal(check(token({ exp: Math.floor(NOW / 1000) - 3600 })).error, 'expired');
  assert.equal(check(token({ nbf: Math.floor(NOW / 1000) + 3600 })).error, 'not-yet-valid');
  assert.equal(check('tull').error, 'bad-token');
  // Endret innhold med gammel signatur.
  const [h, , s] = token().split('.');
  assert.equal(check(`${h}.${b64({ email: 'offer@firma.no' })}.${s}`).error, 'bad-signature');
});

test('appens klient-id kan utvides med miljøvariabler', () => {
  assert.deepEqual(microsoftAudiences({}), [DEFAULT_MICROSOFT_CLIENT_ID]);
  assert.deepEqual(
    microsoftAudiences({ MICROSOFT_CLIENT_ID: 'a', MICROSOFT_SIGNIN_CLIENT_IDS: 'b, c' }),
    [DEFAULT_MICROSOFT_CLIENT_ID, 'a', 'b', 'c'],
  );
});

test('jobbkonto: bare xms_edov eller email_verified gjør e-posten bekreftet (nOAuth)', () => {
  const account = { accountEmail: 'Kari@Firma.no' };
  assert.deepEqual(microsoftEmailVerdict({ tid: TENANT, email: 'kari@firma.no' }, account), {
    verified: false, email: 'kari@firma.no', reason: 'unverified',
  });
  assert.equal(microsoftEmailVerdict({ tid: TENANT, email: 'kari@firma.no', xms_edov: true }, account).verified, true);
  assert.equal(microsoftEmailVerdict({ tid: TENANT, email: 'kari@firma.no', xms_edov: '1' }, account).verified, true);
  assert.equal(microsoftEmailVerdict({ tid: TENANT, email: 'kari@firma.no', email_verified: true }, account).verified, true);
  assert.equal(microsoftEmailVerdict({ tid: TENANT, email: 'kari@firma.no', xms_edov: false }, account).verified, false);
  // preferred_username teller ikke for jobbkontoer.
  assert.equal(microsoftEmailVerdict({ tid: TENANT, preferred_username: 'kari@firma.no' }, account).reason, 'no-email');
});

test('personlig Microsoft-konto er bekreftet, men bare for samme e-post som kontoen', () => {
  const claims = { tid: MICROSOFT_CONSUMER_TENANT, preferred_username: 'ola@outlook.com' };
  assert.equal(microsoftEmailVerdict(claims, { accountEmail: 'ola@outlook.com' }).verified, true);
  assert.equal(microsoftEmailVerdict(claims, { accountEmail: 'annen@outlook.com' }).reason, 'other-email');
  assert.equal(microsoftEmailVerdict(claims, {}).reason, 'other-email');
});

test('Firebase-tokenet: innloggingsmåten alene gir ikke bekreftet e-post', () => {
  for (const provider of ['microsoft.com', 'google.com', 'apple.com', 'password']) {
    assert.equal(emailTrusted({ token: { email: 'a@b.no', email_verified: false, firebase: { sign_in_provider: provider } } }), false, provider);
    assert.equal(emailTrusted({ token: { email: 'a@b.no', email_verified: true, firebase: { sign_in_provider: provider } } }), true, provider);
  }
  assert.equal(emailTrusted({ token: { email_verified: true } }), false);
  assert.equal(emailTrusted(null), false);
});

function fakeAuth(user) {
  const updates = [];
  return {
    updates,
    getUser: async (uid) => (uid === user?.uid ? user : Promise.reject(new Error('not found'))),
    updateUser: async (uid, patch) => { updates.push({ uid, patch }); },
  };
}

const msUser = { uid: 'u1', email: 'kari@firma.no', emailVerified: false, providerData: [{ providerId: 'microsoft.com' }] };
const loadKeys = async () => [jwk];

test('confirmMicrosoftEmail merker kontoen bare når Microsoft har bekreftet e-posten', async () => {
  const auth = fakeAuth(msUser);
  assert.deepEqual(
    await confirmMicrosoftEmailFor('u1', token(), { auth, loadKeys, now: NOW }),
    { ok: true, verified: false, reason: 'unverified' },
  );
  assert.equal(auth.updates.length, 0);
  assert.deepEqual(
    await confirmMicrosoftEmailFor('u1', token({ xms_edov: true }), { auth, loadKeys, now: NOW }),
    { ok: true, verified: true, reason: 'xms_edov' },
  );
  assert.deepEqual(auth.updates, [{ uid: 'u1', patch: { emailVerified: true } }]);
});

test('confirmMicrosoftEmail: annen e-post, falsk token og konto uten Microsoft avvises', async () => {
  const auth = fakeAuth(msUser);
  const other1 = await confirmMicrosoftEmailFor('u1', token({ email: 'offer@firma.no', xms_edov: true }), { auth, loadKeys, now: NOW });
  assert.equal(other1.reason, 'other-email');
  const forged = await confirmMicrosoftEmailFor('u1', token({ xms_edov: true }, { key: other.privateKey }), { auth, loadKeys, now: NOW });
  assert.deepEqual(forged, { ok: false, error: 'bad-signature' });
  assert.equal(auth.updates.length, 0);
  const pw = fakeAuth({ ...msUser, providerData: [{ providerId: 'password' }] });
  assert.deepEqual(await confirmMicrosoftEmailFor('u1', token({ xms_edov: true }), { auth: pw, loadKeys, now: NOW }), { ok: false, error: 'not-microsoft' });
  const done = fakeAuth({ ...msUser, emailVerified: true });
  assert.equal((await confirmMicrosoftEmailFor('u1', 'x', { auth: done, loadKeys, now: NOW })).already, true);
  // Nøkkelen er rotert: hentes på nytt én gang.
  let calls = 0;
  const rotating = async ({ force } = {}) => { calls += 1; return force ? [jwk] : []; };
  const res = await confirmMicrosoftEmailFor('u1', token({ xms_edov: true }), { auth: fakeAuth(msUser), loadKeys: rotating, now: NOW });
  assert.equal(res.verified, true);
  assert.equal(calls, 2);
});
