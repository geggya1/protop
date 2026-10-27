import assert from 'node:assert/strict';
import { resolveMailApiKey } from './mailApiKey.js';

delete process.env.PROTOP_MAIL_KEY;
delete process.env.MAIL_API_KEY;

let secret = null;
let calls = 0;
const fakeFetch = async (url) => {
  calls += 1;
  if (String(url).includes('metadata.google.internal')) {
    return { ok: true, json: async () => ({ access_token: 'token' }) };
  }
  if (!secret) return { ok: false, json: async () => ({}) };
  return { ok: true, json: async () => ({ payload: { data: Buffer.from(secret).toString('base64') } }) };
};

// Mangler hemmeligheten, skal neste kall prøve igjen (ikke huske det tomme svaret).
assert.equal(await resolveMailApiKey(fakeFetch), '');
secret = 're_test';
assert.equal(await resolveMailApiKey(fakeFetch), 're_test');

// Funnet nøkkel huskes.
const before = calls;
assert.equal(await resolveMailApiKey(fakeFetch), 're_test');
assert.equal(calls, before);

console.log('mailApiKey.test.mjs: ok');
