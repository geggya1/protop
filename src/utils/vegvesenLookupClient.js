/**
 * Client: slå opp kjøretøy via Cloud Function (anbefalt) eller lokal API-nøkkel.
 */
import { httpsCallable } from 'firebase/functions';
import Constants from 'expo-constants';
import { functions } from '../../firebase';
import {
  fetchKjoretoyByReg,
  normalizeKjoretoydata,
  normalizeRegNumber,
  isPlausibleRegNumber,
} from './vegvesenApis.js';

function clientApiKey() {
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  return String(
    process.env.EXPO_PUBLIC_VEGVESEN_API_KEY
    || extra.EXPO_PUBLIC_VEGVESEN_API_KEY
    || '',
  ).trim();
}

function friendlyCallableError(e) {
  const raw = String(e?.message || '');
  const code = String(e?.code || '');
  if (/internal/i.test(`${code} ${raw}`)) {
    return 'Klarte ikke slå opp hos Vegvesenet. Prøv igjen om litt.';
  }
  const cleaned = raw
    .replace(/^Firebase:\s*/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
  if (!cleaned || /^(internal|INTERNAL)$/i.test(cleaned)) {
    return 'Klarte ikke slå opp kjøretøy.';
  }
  return cleaned;
}

/**
 * @returns {Promise<object>} normalisert kjøretøy (normalizeKjoretoydata)
 */
export async function lookupVehicleByReg(regOrVin, { signal } = {}) {
  const q = normalizeRegNumber(regOrVin);
  if (!q) {
    const err = new Error('Skriv inn et registreringsnummer først.');
    err.code = 'invalid-argument';
    throw err;
  }
  if (!isPlausibleRegNumber(q) && q.length !== 17) {
    const err = new Error('Ugyldig registreringsnummer. Prøv f.eks. EL12345.');
    err.code = 'invalid-argument';
    throw err;
  }

  try {
    const fn = httpsCallable(functions, 'lookupVehicleByReg', { timeout: 25000 });
    const res = await fn({ kjennemerke: q });
    if (res?.data?.raw) {
      return normalizeKjoretoydata(res.data.raw);
    }
    if (res?.data?.vehicle) {
      return res.data.vehicle;
    }
    const err = new Error(res?.data?.error || 'Fant ikke kjøretøy.');
    err.code = 'not-found';
    throw err;
  } catch (e) {
    if (e?.code === 'invalid-argument' || e?.code === 'not-found') throw e;

    const msg = String(e?.message || e?.code || '');
    const code = String(e?.code || '');
    const canFallback = /not-found|unimplemented|failed-precondition|internal|unavailable|missing-api-key|functions\/not-found|NOT_FOUND/i.test(
      `${code} ${msg}`,
    ) || /API-nøkkel mangler|ikke konfigurert|not configured|avviste API-nøkkelen/i.test(msg);

    // Behold tydelige feil fra callable (f.eks. not-found for ukjent skilt).
    if (code === 'functions/not-found' || /Fant ikke kjøretøy/i.test(msg)) {
      const err = new Error(friendlyCallableError(e));
      err.code = 'not-found';
      throw err;
    }

    if (!canFallback && !/functions\//i.test(code)) {
      const err = new Error(friendlyCallableError(e));
      err.code = code || 'unavailable';
      throw err;
    }

    const key = clientApiKey();
    if (!key) {
      const err = new Error(friendlyCallableError(e));
      err.code = code.includes('not-found') ? 'not-found' : (code || 'unavailable');
      throw err;
    }
    return fetchKjoretoyByReg(q, { apiKey: key, signal });
  }
}
