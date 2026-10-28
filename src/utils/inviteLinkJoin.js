/**
 * Invitasjonslenke til en bedrift (UX-30). Den som registrerer seg fra lenken, har sagt ja
 * ved å trykke «Registrer og bli med». Når e-posten er bekreftet, godtas invitasjonen uten
 * eget vindu, og personen lander i bedriften med et kort om timeføring og «Ikke meg? Avslå».
 *
 * Ønsket lagres på users/{uid}.joinInvite (personens eget dokument). Det gir ingen tilgang:
 * serveren (syncMyInvites og respondGroupInvite) godtar bare en invitasjon som gjelder
 * personens bekreftede e-post, akkurat som når personen trykker Godta selv.
 *
 * Rene funksjoner her; Firestore og kall ligger i inviteLinkJoinClient.js.
 */

export const JOIN_INVITE_FIELD = 'joinInvite';

/** Hvor lenge oppstarten venter på at invitasjonen godtas før appen åpnes som vanlig. */
export const JOIN_INVITE_WAIT_MS = 25000;

/** Ønsket som lagres ved registrering. Bare bedriftsinvitasjoner som serveren har vist. */
export function joinInviteRecord({ familyId, email, groupType, groupName, now = new Date() } = {}) {
  const id = String(familyId || '').trim();
  if (!id) return null;
  return {
    familyId: id,
    email: String(email || '').trim().toLowerCase(),
    groupType: String(groupType || ''),
    familyName: String(groupName || ''),
    status: 'pending',
    createdAt: now.toISOString(),
  };
}

function isMemberOf(families, familyId) {
  return (families || []).some((f) => f?.id === familyId && f.deleted !== true && f.hiddenFromApp !== true);
}

/**
 * Skal oppstarten godta invitasjonen nå? Bare når e-posten er bekreftet, ønsket venter, og
 * personen ikke allerede er med i bedriften.
 */
export function shouldAutoJoin({ joinInvite, emailVerified, families } = {}) {
  if (!emailVerified) return false;
  if (!joinInvite || joinInvite.status !== 'pending') return false;
  const familyId = String(joinInvite.familyId || '');
  if (!familyId) return false;
  return !isMemberOf(families, familyId);
}

/** Invitasjonen fra innboksen (svaret fra syncMyInvites) som gjelder bedriften i lenken. */
export function pickJoinInvite(invites, familyId) {
  const id = String(familyId || '');
  if (!id) return null;
  return (invites || []).find((inv) => inv && inv.familyId === id && (inv.inviteId || inv.id)
    && (!inv.status || inv.status === 'pending')) || null;
}

/** Kortet «Slik fører du timer» vises i bedriften personen nettopp ble med i. */
export function joinWelcomeVisible(joinInvite, familyId) {
  return !!(joinInvite && joinInvite.status === 'joined' && familyId && joinInvite.familyId === familyId);
}

/** Hvor lenge invitasjonen fra lenken huskes på enheten (innlogging med Microsoft eller Google). */
export const INVITE_CONTEXT_MS = 30 * 24 * 60 * 60 * 1000;

/** Invitasjonen fra lenken, slik registreringssiden husker den på enheten. */
export function inviteContextRecord({ familyId, email, groupType, groupName, now = new Date() } = {}) {
  const rec = joinInviteRecord({ familyId, email, groupType, groupName, now });
  return rec ? { ...rec, at: rec.createdAt } : null;
}

/**
 * Innlogget uten bekreftet e-post (f.eks. ny Microsoft-konto) etter en invitasjonslenke:
 * serveren gir ikke invitasjonen før e-posten er bekreftet. Kortet sier hva som mangler.
 * Svarer null (ingenting å vise), { kind: 'verify', … } eller { kind: 'wrong-email', … }.
 * Passordbrukere har egen side for bekreftelsen og får ikke kortet.
 */
export function joinVerifyState({
  joinInvite, context, user, families, now = Date.now(),
} = {}) {
  if (!user || user.emailVerified) return null;
  const provider = user.providerData?.[0]?.providerId;
  if (!provider || provider === 'password') return null;
  const fromProfile = joinInvite && joinInvite.status === 'pending' ? joinInvite : null;
  const at = Date.parse(String(context?.at || ''));
  const fromLink = context?.familyId && Number.isFinite(at) && now - at < INVITE_CONTEXT_MS ? context : null;
  const source = fromProfile || fromLink;
  if (!source?.familyId || isMemberOf(families, source.familyId)) return null;
  const email = String(source.email || '').trim().toLowerCase();
  const own = String(user.email || '').trim().toLowerCase();
  const base = { familyId: source.familyId, familyName: source.familyName || '', email };
  if (email && own && email !== own) return { kind: 'wrong-email', ...base };
  return { kind: 'verify', ...base, email: own || email };
}

/** Tre korte steg, samme ordlyd som hjelpesiden for Timeliste (src/help/protopPages.js). */
export const TIMESHEET_TIPS = [
  'Trykk «Legg til prosjekt» for å legge prosjektet som en linje i timelisten.',
  'Trykk ruten for dagen, skriv timene og beskriv arbeidet.',
  'Lås dagen når timene er riktige. Da går de til godkjenning.',
];
