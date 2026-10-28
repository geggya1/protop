/**
 * Lenker til venneforespørsler.
 * - /friend-invite/<id> (e-post til en som allerede har ProTop) og ?friendInvite=<id> på andre
 *   stier åpner svaret på forespørselen (Godta/Avslå).
 * - /register?friendInvite=<token>&email=… (invitasjon til en ny e-post) er ikke et svar.
 *   Tokenet hører til registreringen, som lager vennskapet (claimFriendInviteAdmin).
 *   Den lenken må gå til registreringen med parametrene i behold.
 */
import { isAuthEntryPath } from './authEntryPaths.js';

function splitPath(path) {
  const raw = String(path || '');
  const pathOnly = (raw.split('?')[0] || '').split('#')[0];
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1).split('#')[0] : '';
  return { pathOnly, params: new URLSearchParams(query) };
}

/** { requestId, token } for et svar på en venneforespørsel, eller null. */
export function parseFriendInviteFromPath(path) {
  const { pathOnly, params } = splitPath(path);
  const m = pathOnly.match(/\/?friend-invite\/([^/?#]+)/i);
  // Registrering og innlogging eier ?friendInvite= (token for ny bruker).
  if (!m && isAuthEntryPath(pathOnly)) return null;
  let requestId = params.get('friendInvite') || params.get('requestId') || '';
  if (m) {
    try {
      requestId = requestId || decodeURIComponent(m[1]);
    } catch {
      requestId = requestId || m[1];
    }
  }
  if (requestId) return { requestId, token: params.get('token') || '' };
  return null;
}

/** Parametrene registreringen trenger fra /register?friendInvite=…&email=…, eller null. */
export function registerFriendInviteParams(path) {
  const { pathOnly, params } = splitPath(path);
  const head = pathOnly.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (head !== 'register') return null;
  const friendInvite = String(params.get('friendInvite') || '').trim();
  if (!friendInvite) return null;
  const out = { friendInvite };
  const email = String(params.get('email') || '').trim().toLowerCase();
  if (email) out.email = email;
  return out;
}
