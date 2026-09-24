import assert from 'node:assert/strict';
import {
  buildChannelViews,
  setupProgress,
  channelConnectMode,
  healthFromViews,
} from './hospitalitySetup.js';

assert.equal(channelConnectMode({ oauthConnected: true }), 'oauth');
assert.equal(channelConnectMode({ messagingReady: true }), 'oauth');
assert.equal(channelConnectMode({ icalUrl: 'https://x', calendarOnly: true }), 'ical');
assert.equal(channelConnectMode(null), null);

const views = buildChannelViews(
  [{ type: 'airbnb', connected: true, oauthConnected: true, messagingReady: true }],
  { channels: { airbnb: { configured: true, messagingReady: true, oauth: true, accountName: 'Geir' }, booking: {}, nuki: {} } },
);
assert.equal(views.airbnb.messagingReady, true);
assert.equal(views.airbnb.configured, true);
assert.equal(views.airbnb.accountName, 'Geir');

const icalOnly = buildChannelViews(
  [{ type: 'airbnb', connected: true, icalUrl: 'https://airbnb.com/x.ics', oauthConnected: false }],
  { channels: { airbnb: { configured: true, messagingReady: false, oauth: false }, booking: {}, nuki: {} } },
);
assert.equal(icalOnly.airbnb.mode, 'ical');
assert.equal(icalOnly.airbnb.messagingReady, false);

const prog = setupProgress(views, true);
assert.equal(prog.connected, 1);
assert.equal(prog.total, 3);

const health = healthFromViews({
  airbnb: { connected: true, messagingReady: true },
  booking: { connected: false, messagingReady: false, mode: 'ical' },
  nuki: { connected: true },
});
assert.equal(health.find((h) => h.type === 'booking').connected, false);

console.log('hospitalitySetup.test.mjs: all passed');
