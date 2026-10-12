import assert from 'node:assert/strict';
import {
  agreementTokenFromLocation,
  captureAgreementLinkFromLocation,
  consumeAgreementToken,
  normalizeAgreementToken,
  peekAgreementToken,
  resetAgreementLinkMemory,
  withAgreementQuery,
} from './agreementLink.js';

function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const token = 'testtoken1234567890abcdef';

resetAgreementLinkMemory();
assert.equal(normalizeAgreementToken(token), token);
assert.equal(normalizeAgreementToken('kort'), '');
assert.equal(normalizeAgreementToken(`${token}!`), '');
assert.equal(agreementTokenFromLocation(`https://protop.no/?avtale=${token}`), token);
assert.equal(agreementTokenFromLocation('https://protop.no/login'), '');
assert.equal(agreementTokenFromLocation(`https://protop.no/login?email=a@b.no&avtale=${token}#topp`), token);

const store = memoryStorage();
assert.equal(captureAgreementLinkFromLocation(`/?avtale=${token}`, store), token);
resetAgreementLinkMemory();
assert.equal(peekAgreementToken(store), token);
assert.equal(withAgreementQuery('/login', token), `/login?avtale=${encodeURIComponent(token)}`);
assert.equal(withAgreementQuery(`/login?avtale=${token}`, token), `/login?avtale=${token}`);
assert.equal(withAgreementQuery('/hjem?addFriend=ola', token), `/hjem?addFriend=ola&avtale=${encodeURIComponent(token)}`);
assert.equal(consumeAgreementToken(store), token);
resetAgreementLinkMemory();
assert.equal(peekAgreementToken(store), '');
assert.equal(withAgreementQuery('/login'), '/login');

console.log('agreementLink.test.mjs ok');
