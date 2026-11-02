/**
 * Klient for helpdesk-callablen. Alle skjermene går gjennom helpdeskCall,
 * så demoen (/helpdesk-demo) kan bytte backend uten å endre skjermene.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

let backend = null;
const listeners = new Set();

/** Demoen setter en lokal backend (src/helpdesk/demoBackend.js). */
export function setHelpdeskBackend(next) {
  backend = next || null;
}

export function isHelpdeskDemo() {
  return !!backend;
}

/** Skjermene lytter for å laste på nytt når noe er endret (ny sak, svar …). */
export function onHelpdeskChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitChange(action) {
  for (const fn of listeners) {
    try { fn(action); } catch { /* ignore */ }
  }
}

const WRITES = new Set([
  'createTicket', 'myReply', 'mySolve', 'rate', 'agentReply', 'agentUpdate', 'agentFix',
  'agentAi', 'teamInvite', 'teamRemove', 'teamSettings',
]);

function friendlyError(error) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const raw = String(error?.message || '');
  if (code === 'internal' || code === 'unavailable' || code === 'deadline-exceeded' || /Failed to fetch|NetworkError|CORS/i.test(raw)) {
    const e = new Error('Vi fikk ikke kontakt med ProTop. Sjekk nettet og prøv igjen om litt.');
    e.code = code || 'unavailable';
    return e;
  }
  if (code === 'unauthenticated') {
    const e = new Error('Du må være innlogget.');
    e.code = code;
    return e;
  }
  const e = new Error(raw.replace(/^FirebaseError:\s*/, '') || 'Noe gikk galt.');
  e.code = code;
  return e;
}

export async function helpdeskCall(action, data = {}) {
  try {
    let result;
    if (backend) {
      result = await backend(action, data);
    } else {
      const fn = httpsCallable(functions, 'helpdesk', { timeout: 120000 });
      const res = await fn({ action, ...data });
      result = res?.data;
    }
    if (WRITES.has(action)) emitChange(action);
    return result;
  } catch (error) {
    if (backend) throw error instanceof Error ? error : new Error(String(error));
    throw friendlyError(error);
  }
}

/** Øktinfo caches kort, så Privat/Bedrift/Helpdesk-bryteren slipper å spørre hver gang. */
let sessionCache = null;
export async function helpdeskSession({ force = false, uid = '' } = {}) {
  const now = Date.now();
  if (!force && sessionCache && sessionCache.uid === uid && now - sessionCache.at < 5 * 60 * 1000) {
    return sessionCache.value;
  }
  const value = await helpdeskCall('session');
  sessionCache = { uid, at: now, value };
  return value;
}

export function clearHelpdeskSession() {
  sessionCache = null;
}
