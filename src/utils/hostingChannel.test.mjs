import assert from 'node:assert/strict';
import {
  isLocalHost,
  isPreviewHost,
  isPublicLiveHost,
  linkingPrefixes,
  resolveAuthDomain,
} from './hostingChannel.js';

assert.equal(isPublicLiveHost('protop.no'), true);
assert.equal(isPublicLiveHost('www.protop.no'), true);
assert.equal(isPublicLiveHost('protop-c189c.web.app'), true);
assert.equal(isPublicLiveHost('localhost'), false);
assert.equal(isPublicLiveHost('protop-c189c--utvikling-abc123.web.app'), false);

assert.equal(isPreviewHost('protop-c189c--utvikling-abc123.web.app'), true);
assert.equal(isPreviewHost('protop-c189c.web.app'), false);

assert.equal(isLocalHost('localhost'), true);
assert.equal(isLocalHost('127.0.0.1'), true);
assert.equal(isLocalHost('protop.no'), false);

assert.equal(resolveAuthDomain('protop.no'), 'protop.no');
assert.equal(resolveAuthDomain('localhost'), 'protop-c189c.firebaseapp.com');
assert.equal(
  resolveAuthDomain('protop-c189c--utvikling-abc123.web.app'),
  'protop-c189c--utvikling-abc123.web.app',
);

const prefixes = linkingPrefixes('https://protop-c189c--utvikling-abc123.web.app');
assert.equal(prefixes[0], 'https://protop-c189c--utvikling-abc123.web.app');
assert.ok(prefixes.includes('https://protop.no'));

console.log('hostingChannel.test.mjs ok');
