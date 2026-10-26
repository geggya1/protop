import assert from 'node:assert/strict';
import test from 'node:test';
import {
  channelEnabled,
  groupedNotificationTypes,
  isRecommended,
  NOTIFICATION_TYPES,
  normalizePrefs,
  recommendedPrefs,
  withChannel,
  withEnabled,
} from './prefs.js';

test('standardvalg: anbefalte typer er på, andre av', () => {
  assert.equal(channelEnabled(undefined, 'taskReceived', 'push'), true);
  assert.equal(channelEnabled(undefined, 'taskReceived', 'email'), true);
  assert.equal(channelEnabled(undefined, 'messageReceived', 'push'), true);
  assert.equal(channelEnabled(undefined, 'messageReceived', 'email'), false);
  assert.equal(channelEnabled(undefined, 'companyWallPost', 'push'), false);
  assert.equal(isRecommended('taskReceived'), true);
  assert.equal(isRecommended('companyWallPost'), false);
  // «Anbefalt» bare på de viktigste, og de er alltid på som standard.
  assert.equal(isRecommended('eventCreated'), false);
  for (const type of NOTIFICATION_TYPES.filter((row) => row.recommended)) {
    assert.equal(channelEnabled(undefined, type.id, 'push'), true, type.id);
  }
  // Ukjent type: push på, e-post av.
  assert.equal(channelEnabled({}, 'nyType', 'push'), true);
  assert.equal(channelEnabled({}, 'nyType', 'email'), false);
});

test('typer med egen e-post sender aldri e-post herfra', () => {
  const prefs = withChannel(undefined, 'familyInvite', 'email', true);
  assert.equal(channelEnabled(prefs, 'familyInvite', 'email'), false);
  assert.equal(channelEnabled(prefs, 'familyInvite', 'push'), true);
});

test('eldre lagrede innstillinger: bare av/på brukes, ikke innskrevne e-postvalg', () => {
  const legacy = { enabled: true, events: { messageReceived: { push: true, email: true, sms: false } } };
  assert.equal(channelEnabled(legacy, 'messageReceived', 'email'), false);
  assert.equal(channelEnabled({ enabled: false, events: {} }, 'taskReceived', 'push'), false);
  assert.deepEqual(normalizePrefs(legacy), { version: 2, enabled: true, events: {} });
});

test('brukerens valg lagres for seg og vinner over standarden', () => {
  let prefs = withChannel(undefined, 'messageReceived', 'email', true);
  prefs = withChannel(prefs, 'taskReceived', 'email', false);
  assert.deepEqual(prefs, {
    version: 2,
    enabled: true,
    events: { messageReceived: { email: true }, taskReceived: { email: false } },
  });
  assert.equal(channelEnabled(prefs, 'messageReceived', 'email'), true);
  assert.equal(channelEnabled(prefs, 'taskReceived', 'email'), false);
  // Ikke valgt: standarden gjelder fortsatt.
  assert.equal(channelEnabled(prefs, 'taskReceived', 'push'), true);
});

test('av for alle varsler stopper push og e-post; tilbake til anbefalt beholder av/på', () => {
  const off = withEnabled(withChannel(undefined, 'taskReceived', 'push', true), false);
  assert.equal(channelEnabled(off, 'taskReceived', 'push'), false);
  assert.equal(channelEnabled(off, 'taskReceived', 'email'), false);
  assert.deepEqual(recommendedPrefs(off), { version: 2, enabled: false, events: {} });
});

test('katalogen: unike typer, alle i en gruppe, norske navn', () => {
  const ids = NOTIFICATION_TYPES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  const grouped = groupedNotificationTypes();
  assert.equal(grouped.reduce((n, g) => n + g.types.length, 0), ids.length);
  for (const type of NOTIFICATION_TYPES) assert.ok(type.label.length > 3, type.id);
});
