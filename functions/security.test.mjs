import assert from 'node:assert/strict';
import {
  isBlockedOutboundHost,
  assertSafeOutboundUrl,
  assertSafeAppContinueUrl,
  redactEmail,
  isValidEmail,
  hashRateKey,
  isFamilyOwnerOrAdmin,
  listedOnFamily,
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
  /protop\.no/,
);
assert.match(
  assertSafeAppContinueUrl(
    'https://protop-c189c--utvikling-abc.web.app/hjem',
    'https://www.protop.no/',
  ),
  /protop-c189c--utvikling-abc\.web\.app/,
);

assert.equal(isValidEmail('a@b.co'), true);
assert.equal(isValidEmail('not-an-email'), false);
assert.match(redactEmail('geir@invest-as.no'), /@invest-as\.no$/);
assert.ok(!redactEmail('geir@invest-as.no').includes('geir@'));
assert.equal(hashRateKey(['a', 'b']).length, 40);

assert.equal(memberDocGrantsAccess({ active: true }), true);
assert.equal(memberDocGrantsAccess({ deleted: true }), false);
assert.equal(memberDocGrantsAccess({ active: false }), false);
assert.equal(memberDocGrantsAccess({ active: false, inviteStatus: 'pending' }), false);
assert.equal(memberDocGrantsAccess({ placeholder: true, inviteStatus: 'pending', active: false }), false);
assert.equal(memberDocGrantsAccess({ active: true, inviteStatus: 'accepted', placeholder: false }), true);
assert.equal(memberDocGrantsAccess({ leftAt: {} }), false);

// Bare feltene reglene beskytter gir eier/admin. createdBy og adminUid kan medlemmer skrive.
const fam = { ownerUid: 'own', adminUids: ['adm'], createdBy: 'bob', adminUid: 'bob', members: ['own', 'adm', 'bob'] };
assert.equal(isFamilyOwnerOrAdmin(fam, 'own'), true);
assert.equal(isFamilyOwnerOrAdmin(fam, 'adm'), true);
assert.equal(isFamilyOwnerOrAdmin(fam, 'bob'), false);
assert.equal(isFamilyOwnerOrAdmin({ ownerId: 'gml' }, 'gml'), true);
assert.equal(listedOnFamily(fam, 'bob'), true);
assert.equal(listedOnFamily({ activeUsers: ['x'] }, 'x'), true);
assert.equal(listedOnFamily({ memberIds: { x: true } }, 'x'), true);
assert.equal(listedOnFamily(fam, 'mal'), false);

console.log('security.test.mjs: ok');
