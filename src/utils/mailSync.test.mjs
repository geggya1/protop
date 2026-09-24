import assert from 'node:assert/strict';
import {
  friendlyMailError,
  isMailCacheFresh,
  isMailCallableUnavailable,
  mailRefreshPlan,
  mergeMailMessages,
  newestMailReceivedAt,
  pickInboxFolderId,
  shouldUseMailboxSync,
} from './mailSync.js';

assert.equal(isMailCacheFresh(null), false);
assert.equal(isMailCacheFresh({ at: Date.now() }), true);
assert.equal(isMailCacheFresh({ at: Date.now() - 20 * 60 * 1000 }), false);
assert.equal(isMailCacheFresh({ at: Date.now() - 3 * 60 * 1000 }, 5 * 60 * 1000), true);

const merged = mergeMailMessages(
  [{ id: 'a' }, { id: 'b' }],
  [{ id: 'b' }, { id: 'c' }],
  { append: true },
);
assert.deepEqual(merged.map((m) => m.id), ['a', 'b', 'c']);
assert.deepEqual(mergeMailMessages([{ id: 'a' }], [{ id: 'z' }]).map((m) => m.id), ['z']);

const upserted = mergeMailMessages(
  [{ id: 'old', receivedAt: '2026-09-16T08:00:00Z', preview: 'x' }, { id: 'keep', receivedAt: '2026-09-15T08:00:00Z' }],
  [{ id: 'old', receivedAt: '2026-09-16T08:00:00Z', preview: 'y' }, { id: 'new', receivedAt: '2026-09-16T09:00:00Z' }],
  { merge: true },
);
assert.deepEqual(upserted.map((m) => m.id), ['new', 'old', 'keep']);
assert.equal(upserted.find((m) => m.id === 'old').preview, 'y');
assert.equal(newestMailReceivedAt(upserted), '2026-09-16T09:00:00.000Z');

assert.equal(mailRefreshPlan({ foldersFresh: true, messagesFresh: true, hasMessages: true }), 'none');
assert.equal(mailRefreshPlan({ foldersFresh: true, messagesFresh: false, hasMessages: true }), 'incremental');
assert.equal(mailRefreshPlan({ foldersFresh: false, messagesFresh: true, hasMessages: true }), 'folders');
assert.equal(mailRefreshPlan({ foldersFresh: false, messagesFresh: false, hasMessages: false }), 'full');
assert.equal(mailRefreshPlan({ force: true, hasMessages: true, foldersFresh: true, messagesFresh: true }), 'full');

assert.equal(pickInboxFolderId([
  { id: 'x', name: 'Arkiv', wellKnownName: 'archive' },
  { id: 'in', name: 'Innboks', wellKnownName: 'inbox' },
]), 'in');
assert.equal(pickInboxFolderId([{ id: 'only', name: 'Annet' }]), 'only');

assert.equal(shouldUseMailboxSync({ foldersFresh: false, messagesFresh: false, force: false }), true);
assert.equal(shouldUseMailboxSync({ foldersFresh: false, messagesFresh: false, force: true }), false);
assert.equal(shouldUseMailboxSync({ foldersFresh: true, messagesFresh: false, force: false }), false);

assert.equal(isMailCallableUnavailable({ code: 'functions/not-found', message: 'NOT_FOUND' }), true);
assert.equal(isMailCallableUnavailable({ code: 'functions/internal', message: 'internal' }), true);
assert.equal(isMailCallableUnavailable('Failed to fetch'), true);
assert.equal(isMailCallableUnavailable({ message: 'CORS policy: No Access-Control-Allow-Origin' }), true);
assert.equal(isMailCallableUnavailable({ message: 'Mangler e-posttilgang' }), false);

assert.equal(friendlyMailError('internal'), 'Kunne ikke hente e-post akkurat nå. Prøv igjen.');
assert.equal(friendlyMailError({ code: 'functions/not-found', message: 'NOT_FOUND' }), 'Kunne ikke hente e-post akkurat nå. Prøv igjen.');
assert.equal(friendlyMailError('For mange kall. Prøv igjen senere.'), 'For mange kall. Prøv igjen senere.');
assert.equal(friendlyMailError('Mangler e-posttilgang'), 'Mangler e-posttilgang');

console.log('mailSync ok');
