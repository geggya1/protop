import assert from 'node:assert/strict';
import { DPA_VERSION, LEGAL_VERSION } from '../i18n/langs.js';
import {
  acceptedConsentRecord, consentLogEntry, consentsComplete, emptyConsents, needsLegalUpdate,
} from './consentState.js';

const old = { version: '2.0.0', termsAt: '2026-08-20T10:00:00.000Z', privacyAt: '2026-08-20T10:00:00.000Z' };
const fresh = acceptedConsentRecord('nb', old, new Date('2026-10-27T08:00:00.000Z'));

assert.equal(consentsComplete(old), false);
assert.equal(consentsComplete(fresh), true);
assert.equal(fresh.version, LEGAL_VERSION);
assert.equal(fresh.termsAt, '2026-10-27T08:00:00.000Z');
assert.equal(consentsComplete(emptyConsents()), false);

// Eldre godkjenning ber om ny aksept. Godkjent på enheten eller kontoen holder.
assert.equal(needsLegalUpdate(old, old), true);
assert.equal(needsLegalUpdate(old, fresh), false);
assert.equal(needsLegalUpdate(fresh, null), false);
assert.equal(needsLegalUpdate(undefined, undefined), true);

// Samtykkeloggen: kjent type, versjon fra serveren hvis klienten ikke sender en.
assert.equal(consentLogEntry({ kind: 'terms' }, {}), null);
assert.equal(consentLogEntry({ kind: 'hack' }, { uid: 'u1' }), null);
assert.deepEqual(consentLogEntry({ kind: 'terms', language: 'nb', platform: 'web' }, { uid: 'u1' }), {
  uid: 'u1', kind: 'terms', version: LEGAL_VERSION, current: true, accepted: true, language: 'nb', platform: 'web',
});
const optOut = consentLogEntry({ kind: 'marketing', accepted: false, version: '2.0.0', platform: 'x' }, { uid: 'u1' });
assert.equal(optOut.accepted, false);
assert.equal(optOut.current, false);
assert.equal(optOut.platform, 'unknown');
assert.equal(consentLogEntry({ kind: 'dpa' }, { uid: 'u1' }), null, 'databehandleravtalen gjelder en bedrift');
const dpa = consentLogEntry({ kind: 'dpa', familyId: 'fam/../1' }, { uid: 'u1' });
assert.equal(dpa.familyId, 'fam..1');
assert.equal(dpa.version, DPA_VERSION);

console.log('consentState.test.mjs: ok');
