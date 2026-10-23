import assert from 'node:assert/strict';
import { LIVE_TENDER_PROXY, tenderProxyUrl } from './tenderProxyUrl.js';

assert.equal(tenderProxyUrl({ hostname: 'protop.no' }), '/api/tender-proxy');
assert.equal(tenderProxyUrl({ hostname: 'www.protop.no' }), '/api/tender-proxy');
assert.equal(tenderProxyUrl({ hostname: 'localhost' }), LIVE_TENDER_PROXY);
assert.equal(tenderProxyUrl({ hostname: '127.0.0.1' }), LIVE_TENDER_PROXY);
// Mobilappen har ingen origin å gå mot.
assert.equal(tenderProxyUrl(null), LIVE_TENDER_PROXY);
// Lokal proxy kan velges lokalt, men aldri på protop.no eller mot en ekstern adresse.
const localProxy = 'http://127.0.0.1:8788/api/tender-proxy';
assert.equal(tenderProxyUrl({ hostname: 'localhost' }, localProxy), localProxy);
assert.equal(tenderProxyUrl({ hostname: 'protop.no' }, localProxy), '/api/tender-proxy');
assert.equal(tenderProxyUrl({ hostname: 'localhost' }, 'https://evil.example/api'), LIVE_TENDER_PROXY);

console.log('tenderProxyUrl.test.mjs ok');
