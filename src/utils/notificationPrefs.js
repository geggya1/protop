export const NOTIF_DEFAULT = {
  enabled: true,
  events: {
    taskReceived: { push: true, sms: false, email: true },
    messageReceived: { push: true, sms: false, email: true },
    choreReceived: { push: true, sms: false, email: true },
    eventCreated: { push: true, sms: false, email: true },
    noteShared: { push: true, sms: false, email: true },
    wishReserved: { push: true, sms: false, email: false },
    attestPending: { push: true, sms: false, email: false },
    familyInvite: { push: true, sms: false, email: true },
    friendInvite: { push: true, sms: false, email: true },
    friendInviteAccepted: { push: true, sms: false, email: false },
    gameInvite: { push: true, sms: false, email: false },
    birthdayReminder: { push: true, sms: false, email: false },
    boligReminder: { push: true, sms: false, email: false },
  },
};

export function mergeNotificationPrefs(saved) {
  const p = saved && typeof saved === 'object' ? saved : {};
  const events = { ...NOTIF_DEFAULT.events, ...(p.events || {}) };
  Object.keys(NOTIF_DEFAULT.events).forEach((key) => {
    events[key] = {
      ...NOTIF_DEFAULT.events[key],
      ...(p.events?.[key] || {}),
    };
  });
  return {
    ...NOTIF_DEFAULT,
    ...p,
    events,
  };
}

export function isMasterNotifEnabled(prefs) {
  return prefs?.enabled !== false;
}

/** Unset channel follows the given default (email/push default on). */
export function isChannelOn(prefs, eventType, channel, fallback = true) {
  if (!isMasterNotifEnabled(prefs)) return false;
  const v = prefs?.events?.[eventType]?.[channel];
  return typeof v === 'boolean' ? v : fallback;
}
