import assert from 'node:assert/strict';
import {
  isBlockedOutboundHost,
  assertSafeOutboundUrl,
  assertSafeAppContinueUrl,
  redactEmail,
  isValidEmail,
  hashRateKey,
  memberDocGrantsAccess,
} from './security.js';

assert.equal(isBlockedOutboundHost('127.0.0.1'), true);
assert.equal(isBlockedOutboundHost('10.0.0.5'), true);
assert.equal(isBlockedOutboundHost('192.168.1.1'), true);
assert.equal(isBlockedOutboundHost('169.254.169.254'), true);
assert.equal(isBlockedOutboundHost('metadata.google.internal'), true);
assert.equal(isBlockedOutboundHost('calendar.google.com'), false);
assert.equal(isBlockedOutboundHost('outlook.office365.com'), false);

assert.throws(() => assertSafeOutboundUrl('http://evil.com/x.ics'), /https/);
assert.throws(() => assertSafeOutboundUrl('https://127.0.0.1/x.ics'), /blokkert/);
assert.throws(() => assertSafeOutboundUrl('https://user:pass@example.com/x.ics'), /innlogging/);
const ok = assertSafeOutboundUrl('https://calendar.google.com/calendar/ical/x/basic.ics');
assert.equal(ok.hostname, 'calendar.google.com');

assert.equal(
  assertSafeAppContinueUrl('https://evil.com/phish', 'https://www.protop.no/login'),
  'https://www.protop.no/login',
);
assert.match(
  assertSafeAppContinueUrl('https://www.protop.no/verify-email', 'https://www.protop.no/'),
  /weekplan\.no/,
);

assert.equal(isValidEmail('a@b.co'), true);
assert.equal(isValidEmail('not-an-email'), false);
assert.match(redactEmail('geir@invest-as.no'), /@invest-as\.no$/);
assert.ok(!redactEmail('geir@invest-as.no').includes('geir@'));
assert.equal(hashRateKey(['a', 'b']).length, 40);

assert.equal(memberDocGrantsAccess({ active: true }), true);
assert.equal(memberDocGrantsAccess({ deleted: true }), false);
assert.equal(memberDocGrantsAccess({ active: false }), false);
assert.equal(memberDocGrantsAccess({ active: false, inviteStatus: 'pending' }), true);
assert.equal(memberDocGrantsAccess({ leftAt: {} }), false);

console.log('security.test.mjs: ok');
