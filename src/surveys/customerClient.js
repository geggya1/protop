/**
 * Klient for callable `customerSurvey` (src/surveys/customerService.js på serveren).
 * Demoen (/kundeundersokelse-demo, bare i utviklingsbygg) bytter backend uten å endre skjermene.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

let backend = null;

/** Demoen setter en lokal backend (src/surveys/demoBackend.js). */
export function setCustomerSurveyBackend(next) {
  backend = next || null;
}

export function isCustomerSurveyDemo() {
  return !!backend;
}

function friendlyError(error) {
  const code = String(error?.code || '').replace(/^functions\//, '');
  const raw = String(error?.message || '');
  let message = raw.replace(/^FirebaseError:\s*/, '') || 'Noe gikk galt.';
  if (code === 'internal' || code === 'unavailable' || code === 'deadline-exceeded' || /Failed to fetch|NetworkError|CORS/i.test(raw)) {
    message = 'Vi fikk ikke kontakt med serveren. Sjekk nettet og prøv igjen om litt.';
  } else if (code === 'resource-exhausted') {
    message = 'For mange forsøk. Vent litt og prøv igjen.';
  }
  const e = new Error(message);
  e.code = code;
  return e;
}

export async function customerSurveyCall(action, data = {}) {
  try {
    if (backend) return await backend(action, data);
    const res = await httpsCallable(functions, 'customerSurvey', { timeout: 300000 })({ ...data, action });
    return res.data || {};
  } catch (error) {
    throw friendlyError(error);
  }
}
