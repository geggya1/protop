import assert from 'node:assert/strict';
import {
  resolveAutomessageDelivery,
  channelMessagingReady,
  isChannelBooking,
  deliveryMethodLabelNb,
} from './hospitalityMessaging.js';

assert.equal(isChannelBooking('airbnb'), true);
assert.equal(isChannelBooking('manual'), false);
assert.equal(channelMessagingReady({ oauthConnected: true }), true);
assert.equal(channelMessagingReady({ icalUrl: 'x' }), false);

const blocked = resolveAutomessageDelivery({
  channel: 'airbnb',
  messagingReady: false,
  hasGuestEmail: true,
  hasMailKey: true,
});
assert.equal(blocked.prefer, 'blocked');
assert.equal(blocked.allowEmailFallback, false);

const channel = resolveAutomessageDelivery({
  channel: 'booking',
  messagingReady: true,
});
assert.equal(channel.prefer, 'channel');

const email = resolveAutomessageDelivery({
  channel: 'manual',
  hasGuestEmail: true,
  hasMailKey: true,
});
assert.equal(email.prefer, 'email');

assert.match(deliveryMethodLabelNb('blocked'), /Sign in/i);
assert.match(deliveryMethodLabelNb('airbnb'), /Airbnb/i);

console.log('hospitalityMessaging.test.mjs: all passed');
