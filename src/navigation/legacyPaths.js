/**
 * Gamle adresser som fortsatt kan ligge i e-poster og bokmerker.
 * - /register-invited?email=…&familyId=… var en gammel registreringsskjerm for inviterte.
 *   Den krasjet uten parametre og skrev til en samling som ikke finnes. Nå: vanlig registrering.
 * - /note/new åpnet barnas dagsnotat (krever barn og dato). Nå: Notater → nytt notat.
 */

function splitPath(path) {
  const raw = String(path || '');
  const pathOnly = (raw.split('?')[0] || '').split('#')[0];
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : '';
  return { head: pathOnly.replace(/^\/+|\/+$/g, '').toLowerCase(), params: new URLSearchParams(query) };
}

/** Linking-state for /register-invited, eller null. */
export function legacyRegisterInvitedState(path, { signedIn = false } = {}) {
  const { head, params } = splitPath(path);
  if (head !== 'register-invited') return null;
  if (signedIn) return { routes: [{ name: 'Home' }] };
  const out = {};
  const email = String(params.get('email') || '').trim().toLowerCase();
  const familyId = String(params.get('familyId') || '').trim();
  if (email) out.email = email;
  if (familyId) out.familyId = familyId;
  return { routes: [{ name: 'Register', params: out }] };
}

/** Linking-state for /note/new, eller null. */
export function legacyNewNoteState(path) {
  const { head } = splitPath(path);
  if (head !== 'note/new') return null;
  return {
    routes: [{
      name: 'Home',
      params: { openShell: { tab: 'notes', subView: null, intent: 'create' } },
    }],
  };
}
