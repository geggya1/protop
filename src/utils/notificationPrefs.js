import { channelEnabled, notificationsEnabled } from '../notifications/prefs';

// Felles varselvalg ligger i src/notifications/prefs.js (samme standarder som serveren).
export function isMasterNotifEnabled(prefs) {
  return notificationsEnabled(prefs);
}

/** Push eller e-post for typen, etter brukerens valg eller standarden. */
export function isChannelOn(prefs, eventType, channel) {
  return channelEnabled(prefs, eventType, channel);
}
