import assert from 'node:assert/strict';
import {
  senderInitials,
  normalizeMailAddress,
  pickPreferredMicrosoftConnection,
  uniqueMicrosoftConnections,
  duplicateMicrosoftConnectionIds,
} from './mailUi.js';

assert.equal(senderInitials('Anders Rolandsen', 'a@x.no'), 'AR');
assert.equal(senderInitials('', 'marie@consult1.no'), 'MA');
assert.equal(senderInitials(null, null), '?');

assert.equal(normalizeMailAddress(' GOA@Consult1.no '), 'goa@consult1.no');

const older = { id: 'a', type: 'microsoft', email: 'goa@consult1.no', mailAccess: true, expiresAt: 1 };
const newer = { id: 'b', type: 'microsoft', email: 'GOA@consult1.no', mailAccess: true, expiresAt: 9 };
const noMail = { id: 'c', type: 'microsoft', email: 'goa@consult1.no', mailAccess: false, expiresAt: 99 };
assert.equal(pickPreferredMicrosoftConnection(older, noMail).id, 'a');
assert.equal(pickPreferredMicrosoftConnection(older, newer).id, 'b');

const list = [older, newer, noMail, { id: 'd', type: 'microsoft', email: 'goa@invest-as.no', mailAccess: true }];
const unique = uniqueMicrosoftConnections(list);
assert.equal(unique.length, 2);
assert.ok(unique.some((c) => c.id === 'b'));
assert.ok(unique.some((c) => c.id === 'd'));
assert.deepEqual(duplicateMicrosoftConnectionIds(list).sort(), ['a', 'c']);

const noEmail = [
  { id: 'x', type: 'microsoft', email: '' },
  { id: 'y', type: 'microsoft', email: '' },
];
assert.equal(uniqueMicrosoftConnections(noEmail).length, 2);

console.log('mailUi tests ok');
