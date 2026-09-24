/** Overlay-handled types skip the ephemeral toast (dedicated UI instead). */
export const OVERLAY_EVENT_TYPES = new Set(['familyInvite', 'gameInvite', 'friendInvite', 'birthdayReminder']);

const EVENT_MODULE = {
  messageReceived: 'chat',
  taskReceived: 'stars',
  choreReceived: 'chores',
  eventCreated: 'plan',
  noteShared: 'notes',
  wishReserved: 'wishes',
  wishPurchased: 'wishes',
  wishShared: 'wishes',
  familyInvite: 'members',
  familyInviteAccepted: 'members',
  familyInviteDeclined: 'members',
  gameInvite: 'games',
  locationGeofence: 'location',
  wallPost: 'wall',
  attestPending: 'progress',
  birthdayReminder: 'rememberDates',
  boligReminder: 'boligmappa',
};

const EVENT_LABELS = {
  messageReceived: 'Melding',
  taskReceived: 'Oppgave',
  choreReceived: 'Gjøremål',
  eventCreated: 'Kalender',
  noteShared: 'Notat',
  wishReserved: 'Gaveønske',
  wishPurchased: 'Gaveønske',
  wishShared: 'Gaveønske',
  familyInvite: 'Invitasjon',
  familyInviteAccepted: 'Invitasjon',
  familyInviteDeclined: 'Invitasjon',
  gameInvite: 'Spillinvitasjon',
  locationGeofence: 'Posisjon',
  wallPost: 'Familievegg',
  attestPending: 'Attestering',
  birthdayReminder: 'Bursdag',
  boligReminder: 'Boligen',
};

const EVENT_ICONS = {
  messageReceived: 'chatbubble-ellipses',
  taskReceived: 'star',
  choreReceived: 'checkbox',
  eventCreated: 'calendar',
  noteShared: 'document-text',
  wishReserved: 'gift',
  wishPurchased: 'gift',
  wishShared: 'gift',
  familyInvite: 'people',
  familyInviteAccepted: 'people',
  familyInviteDeclined: 'people',
  gameInvite: 'game-controller',
  locationGeofence: 'location',
  wallPost: 'newspaper',
  attestPending: 'shield-checkmark',
  birthdayReminder: 'gift',
  boligReminder: 'home',
};

/**
 * Build a stable navigation/data payload from an inbox notification doc.
 * Keep friendChat / friendUid so toast + push open friendChats, not family chats.
 */
export function notificationNavPayload(n = {}) {
  return {
    eventType: n.eventType || null,
    chatId: n.chatId || null,
    familyId: n.familyId || null,
    friendChat: n.friendChat === true || n.friendChat === 'true' || n.friendChat === '1' || null,
    friendUid: n.friendUid || null,
    createdBy: n.createdBy || null,
    inviteId: n.inviteId || null,
    gameId: n.gameId || null,
    gameType: n.gameType || null,
    childId: n.childId || null,
    memberId: n.memberId || null,
    todoId: n.todoId || null,
    taskId: n.taskId || null,
    choreId: n.choreId || null,
    eventId: n.eventId || null,
    noteId: n.noteId || null,
    wishId: n.wishId || null,
    wishlistId: n.wishlistId || null,
    dateKey: n.dateKey || null,
    notificationId: n.id || n.notificationId || null,
    title: n.title || null,
  };
}

export function iconForEventType(eventType) {
  return EVENT_ICONS[eventType] || 'notifications';
}

export function labelForEventType(eventType) {
  return EVENT_LABELS[eventType] || 'Varsel';
}

/**
 * Whether a new inbox item should surface as an in-app popup toast.
 * Invites are handled by InviteRespondOverlay instead.
 */
export function shouldShowInAppToast(notification, { prefsChannelOn = true, suppress = false } = {}) {
  if (!notification?.id) return false;
  if (notification.seen === true) return false;
  if (!prefsChannelOn) return false;
  if (suppress) return false;
  if (OVERLAY_EVENT_TYPES.has(notification.eventType)) return false;
  return true;
}

export function buildToastFromNotification(n) {
  if (!n?.id) return null;
  return {
    id: n.id,
    title: String(n.title || labelForEventType(n.eventType) || 'ProTop').trim() || 'ProTop',
    body: String(n.body || '').trim(),
    eventType: n.eventType || null,
    module: EVENT_MODULE[n.eventType] || null,
    icon: iconForEventType(n.eventType),
    data: notificationNavPayload(n),
  };
}

/** Keep newest toasts; drop oldest when over max. */
export function appendToast(queue, toast, max = 3) {
  if (!toast?.id) return queue || [];
  const prev = (queue || []).filter((t) => t.id !== toast.id);
  return [...prev, toast].slice(-Math.max(1, max));
}

export function removeToast(queue, id) {
  return (queue || []).filter((t) => t.id !== id);
}
