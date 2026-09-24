/**
 * Derived setup state — Sign in (OAuth) = messaging; iCal = calendar only.
 */
import { connectionHealth } from './hospitalityLogic.js';
import { channelMessagingReady } from './hospitalityMessaging.js';

export function channelConnectMode(channel, oauthHints = {}) {
  if (!channel && !oauthHints.oauth) return null;
  if (channel?.oauthConnected || channel?.messagingReady || oauthHints.oauth || oauthHints.messagingReady) {
    return 'oauth';
  }
  if (channel?.icalUrl || channel?.calendarOnly) return 'ical';
  if (channel?.connected || channel?.partnerAccountId) return 'oauth';
  return null;
}

export function buildChannelViews(channels = [], setup = null) {
  const byType = Object.fromEntries((channels || []).map((c) => [c.type || c.id, c]));
  const server = setup?.channels || {};

  const airbnbCh = byType.airbnb;
  const bookingCh = byType.booking;
  const airbnbMode = channelConnectMode(airbnbCh, {
    oauth: server.airbnb?.oauth,
    messagingReady: server.airbnb?.messagingReady,
  });
  const bookingMode = channelConnectMode(bookingCh, {
    oauth: server.booking?.oauth,
    messagingReady: server.booking?.messagingReady,
  });

  const airbnbMessaging = channelMessagingReady({
    oauthConnected: airbnbMode === 'oauth',
    oauth: server.airbnb?.oauth,
    messagingReady: server.airbnb?.messagingReady || airbnbCh?.messagingReady,
  });
  const bookingMessaging = channelMessagingReady({
    oauthConnected: bookingMode === 'oauth',
    oauth: server.booking?.oauth,
    messagingReady: server.booking?.messagingReady || bookingCh?.messagingReady,
  });

  return {
    airbnb: {
      // "connected" for UI = Sign in ready for messaging
      connected: !!(airbnbMessaging || server.airbnb?.connected),
      calendarConnected: !!(airbnbCh?.icalUrl || airbnbCh?.connected || airbnbMessaging || server.airbnb?.calendarConnected),
      messagingReady: airbnbMessaging,
      configured: !!server.airbnb?.configured,
      accountName: server.airbnb?.accountName || null,
      mode: airbnbMode,
      lastSyncAt: airbnbCh?.lastSyncAt || server.airbnb?.lastSyncAt || null,
      lastError: airbnbCh?.lastError || null,
    },
    booking: {
      connected: !!(bookingMessaging || server.booking?.connected),
      calendarConnected: !!(bookingCh?.icalUrl || bookingCh?.connected || bookingMessaging || server.booking?.calendarConnected),
      messagingReady: bookingMessaging,
      configured: !!server.booking?.configured,
      propertyId: server.booking?.propertyId || bookingCh?.partnerAccountId || null,
      mode: bookingMode,
      lastSyncAt: bookingCh?.lastSyncAt || server.booking?.lastSyncAt || null,
      lastError: bookingCh?.lastError || null,
    },
    nuki: {
      connected: !!setup?.nuki?.connected,
    },
  };
}

/** Progress counts Sign-in (messaging), not iCal-only. */
export function setupProgress(views, hasProperty = false) {
  const core = ['airbnb', 'booking', 'nuki'];
  const connected = core.filter((k) => {
    if (k === 'nuki') return views?.[k]?.connected;
    return views?.[k]?.messagingReady || views?.[k]?.connected;
  }).length;
  const total = core.length;
  const pct = Math.round((connected / total) * 100);
  return { connected, total, pct, complete: connected === total && hasProperty };
}

export function healthFromViews(views) {
  return connectionHealth([
    {
      type: 'airbnb',
      connected: views.airbnb?.messagingReady || views.airbnb?.connected,
      oauthConnected: views.airbnb?.messagingReady,
      messagingReady: views.airbnb?.messagingReady,
      calendarOnly: views.airbnb?.mode === 'ical' && !views.airbnb?.messagingReady,
    },
    {
      type: 'booking',
      connected: views.booking?.messagingReady || views.booking?.connected,
      oauthConnected: views.booking?.messagingReady,
      messagingReady: views.booking?.messagingReady,
      calendarOnly: views.booking?.mode === 'ical' && !views.booking?.messagingReady,
    },
    { type: 'nuki', connected: views.nuki?.connected, apiTokenSet: views.nuki?.connected },
  ]);
}
