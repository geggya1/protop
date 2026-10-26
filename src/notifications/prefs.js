/**
 * Varseltyper og standardvalg for push og e-post. Brukes av appen (innstillinger,
 * toast) og av serveren (push og e-post per varsel). Bjellen viser alltid alle varsler,
 * uansett valg her.
 *
 * Lagres i users/{uid}.notificationPrefs = { version: 2, enabled, events: { [type]: { push?, email? } } }.
 * Bare brukerens egne valg lagres. Ellers gjelder standarden her, så nye standarder virker for alle.
 * Eldre innstillinger (uten version) hadde standardverdier skrevet inn uten at brukeren valgte dem,
 * og e-post ble aldri sendt. Fra dem brukes bare «enabled».
 *
 * Hvem som kan få en type, styres av rettighetene (se audience.js):
 * scope 'company' = bare i bedrifter, 'family' = bare i familier,
 * access = krever rettigheten i bedriftens tilgangsmatrise (ressurs og trinn).
 */
export const PREFS_VERSION = 2;

export const NOTIFICATION_GROUPS = [
  { id: 'work', label: 'Jobb og bedrift' },
  { id: 'messages', label: 'Meldinger' },
  { id: 'calendar', label: 'Kalender og påminnelser' },
  { id: 'home', label: 'Hjem og familie' },
  { id: 'social', label: 'Venner og deling' },
];

// push/email: true = på som standard, false = av som standard,
// 'own' = e-posten sendes alltid av funksjonen selv (for eksempel invitasjoner).
// recommended: de viktigste varslene, merket «Anbefalt» på innstillingssiden.
export const NOTIFICATION_TYPES = [
  { id: 'taskReceived', group: 'work', label: 'Oppgave tildelt deg', push: true, email: true, recommended: true },
  {
    id: 'companyJoinRequest', group: 'work', label: 'Noen ber om å bli med i bedriften', push: true, email: true, recommended: true,
    scope: 'company', access: { resource: 'employees', action: 'write' },
  },
  { id: 'join_request_approved', group: 'work', label: 'Forespørselen din om å bli med er godkjent', push: true, email: true, recommended: true },
  { id: 'familyInvite', group: 'work', label: 'Invitasjon til bedrift eller gruppe', push: true, email: 'own', recommended: true },
  { id: 'familyInviteAccepted', group: 'work', label: 'Noen godtok invitasjonen din', push: true, email: false },
  { id: 'familyInviteDeclined', group: 'work', label: 'Noen avslo invitasjonen din', push: true, email: false },
  { id: 'attestPending', group: 'home', label: 'Barnets gjøremål venter på attestering', push: true, email: false, recommended: true, scope: 'family' },
  { id: 'vacationPlan', group: 'work', label: 'Ferieplan', push: true, email: 'own', recommended: true, scope: 'company', audience: 'Alle ansatte' },
  { id: 'companyWallPost', group: 'work', label: 'Nytt innlegg på bedriftsveggen', push: false, email: false, scope: 'company', audience: 'Alle i bedriften' },
  { id: 'messageReceived', group: 'messages', label: 'Ny melding i chat', push: true, email: false, recommended: true },
  { id: 'wallPost', group: 'messages', label: 'Nytt innlegg på veggen', push: false, email: false },
  { id: 'eventCreated', group: 'calendar', label: 'Ny eller endret avtale', push: true, email: false },
  { id: 'choreReceived', group: 'home', label: 'Ny oppgave hjemme', push: true, email: false },
  { id: 'birthdayReminder', group: 'calendar', label: 'Bursdagspåminnelse', push: true, email: false },
  { id: 'boligReminder', group: 'home', label: 'Påminnelse om bolig', push: true, email: false },
  { id: 'locationGeofence', group: 'calendar', label: 'Kommet frem eller dratt (posisjon)', push: true, email: false },
  { id: 'friendInvite', group: 'social', label: 'Venneforespørsel', push: true, email: 'own', recommended: true },
  { id: 'friendInviteAccepted', group: 'social', label: 'Noen godtok venneforespørselen', push: true, email: false },
  { id: 'noteShared', group: 'social', label: 'Notat delt med deg', push: true, email: false },
  { id: 'albumShared', group: 'social', label: 'Album delt med deg', push: true, email: false },
  { id: 'wishShared', group: 'social', label: 'Ønskeliste delt med deg', push: true, email: false },
  { id: 'shoppingShared', group: 'social', label: 'Handleliste delt med deg', push: true, email: false },
  { id: 'wishReserved', group: 'social', label: 'Noen reserverte et ønske', push: true, email: false },
  { id: 'wishPurchased', group: 'social', label: 'Et ønske er kjøpt', push: true, email: false },
  { id: 'gameInvite', group: 'social', label: 'Invitasjon til spill', push: true, email: false },
];

const BY_ID = new Map(NOTIFICATION_TYPES.map((type) => [type.id, type]));
const OTHER = { group: 'other', label: 'Andre varsler', push: true, email: false };
const CHANNELS = ['push', 'email'];

export function notificationType(id) {
  return BY_ID.get(String(id || '')) || { id: String(id || ''), ...OTHER };
}

/** Rettigheten som kreves i bedriften, eller null når alle kan få typen. */
export function notificationAccess(id) {
  return notificationType(id).access || null;
}

export function notificationScope(id) {
  return notificationType(id).scope || '';
}

export function hasOwnEmail(id) {
  return notificationType(id).email === 'own';
}

/** De viktigste varslene. De er på som standard, og viser «Anbefalt» i innstillingene. */
export function isRecommended(id) {
  return notificationType(id).recommended === true;
}

export function notificationsEnabled(prefs) {
  return prefs?.enabled !== false;
}

function isV2(prefs) {
  return Number(prefs?.version) >= PREFS_VERSION;
}

/** Brukerens eget valg for typen og kanalen, eller undefined (da gjelder standarden). */
export function explicitChoice(prefs, id, channel) {
  if (!isV2(prefs)) return undefined;
  const value = prefs?.events?.[id]?.[channel];
  return typeof value === 'boolean' ? value : undefined;
}

export function defaultChannel(id, channel) {
  return notificationType(id)[channel] === true;
}

/**
 * Skal varselet også gå ut som push eller e-post? Bjellen påvirkes ikke.
 * E-post for typer med egen e-post sendes ikke herfra (ville blitt dobbelt).
 */
export function channelEnabled(prefs, id, channel) {
  if (!notificationsEnabled(prefs)) return false;
  if (channel === 'email' && hasOwnEmail(id)) return false;
  const choice = explicitChoice(prefs, id, channel);
  return choice !== undefined ? choice : defaultChannel(id, channel);
}

export function normalizePrefs(prefs) {
  const events = {};
  if (isV2(prefs)) {
    for (const [id, value] of Object.entries(prefs?.events || {})) {
      const row = {};
      for (const channel of CHANNELS) {
        if (typeof value?.[channel] === 'boolean') row[channel] = value[channel];
      }
      if (Object.keys(row).length) events[id] = row;
    }
  }
  return { version: PREFS_VERSION, enabled: notificationsEnabled(prefs), events };
}

export function withChannel(prefs, id, channel, value) {
  const base = normalizePrefs(prefs);
  return {
    ...base,
    events: { ...base.events, [id]: { ...(base.events[id] || {}), [channel]: !!value } },
  };
}

export function withEnabled(prefs, enabled) {
  return { ...normalizePrefs(prefs), enabled: !!enabled };
}

/** Tilbake til standardvalgene (anbefalt), men behold av/på for alle varsler. */
export function recommendedPrefs(prefs) {
  return { version: PREFS_VERSION, enabled: notificationsEnabled(prefs), events: {} };
}

/** Typene gruppert for innstillingssiden. */
export function groupedNotificationTypes() {
  return NOTIFICATION_GROUPS.map((group) => ({
    ...group,
    types: NOTIFICATION_TYPES.filter((type) => type.group === group.id),
  }));
}
