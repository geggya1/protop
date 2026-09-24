/**
 * Channel messaging capability — Sign in required for inbox delivery.
 * iCal = calendar only; OAuth = calendar + automessages into Airbnb/Booking.
 */

import { CHANNELS } from './hospitalityLogic.js';

export const AIRBNB_OAUTH_SCOPES = [
  'listings:read',
  'bookings:read',
  'messages:read',
  'messages:write',
];

export function isChannelBooking(channel) {
  return channel === CHANNELS.airbnb || channel === CHANNELS.booking;
}

/** OAuth Sign-in required to message guests inside Airbnb/Booking.com. */
export function channelMessagingReady(channelMeta = {}) {
  return !!(channelMeta.oauthConnected || channelMeta.oauth || channelMeta.accessToken || channelMeta.messagingReady);
}

/** Calendar sync possible via iCal OR OAuth. */
export function channelCalendarReady(channelMeta = {}) {
  return !!(
    channelMeta.oauthConnected
    || channelMeta.oauth
    || channelMeta.icalUrl
    || channelMeta.connected
    || channelMeta.partnerAccountId
  );
}

/**
 * Decide delivery path for an automessage.
 * Channel bookings prefer partner inbox; email is fallback for manual/direct only
 * (or secondary if channel send fails and guestEmail exists).
 */
export function resolveAutomessageDelivery({
  channel,
  messagingReady = false,
  hasGuestEmail = false,
  hasMailKey = false,
} = {}) {
  if (isChannelBooking(channel)) {
    if (messagingReady) {
      return { prefer: 'channel', channel, allowEmailFallback: hasGuestEmail && hasMailKey };
    }
    return {
      prefer: 'blocked',
      channel,
      reason: 'Sign in med Airbnb/Booking.com kreves for å sende automeldinger inn til kanalen. iCal synker kun kalender.',
      allowEmailFallback: false,
    };
  }
  if (hasGuestEmail && hasMailKey) return { prefer: 'email' };
  return { prefer: 'log_only', reason: 'Mangler e-post for manuell booking' };
}

export function deliveryMethodLabelNb(method) {
  const map = {
    airbnb: 'Airbnb-innboks',
    booking: 'Booking.com-innboks',
    channel: 'Kanal-innboks',
    email: 'E-post',
    log_only: 'Kun logg',
    blocked: 'Blokkert (mangler Sign in)',
    skipped: 'Hoppet over',
  };
  return map[method] || method || 'Ukjent';
}
