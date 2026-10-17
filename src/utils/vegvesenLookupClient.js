/**
 * Slå opp kjøretøy.
 * Nettleseren treffer /api/kjoretoy på samme origin (Hosting-rewrite).
 * Deretter callable, og til slutt det offentlige rå-API-et som ukeplanen bruker.
 * Direkte kall fra protop.no blokkeres av CORS hos Vegvesenet.
 */
import { httpsCallable } from 'firebase/functions';
import Constants from 'expo-constants';
import { auth, functions } from '../../firebase';
import {
  fetchKjoretoyByReg,
  normalizeKjoretoydata,
  normalizeRegNumber,
  isPlausibleRegNumber,
  vehicleFromProxyPayload,
} from './vegvesenApis.js';

function clientApiKey() {
  const extra = Constants?.expoConfig?.extra || Constants?.manifest?.extra || {};
  return String(
    process.env.EXPO_PUBLIC_VEGVESEN_API_KEY
    || extra.EXPO_PUBLIC_VEGVESEN_API_KEY
    || '',
  ).trim();
}

function friendlyLookupError(e) {
  const raw = String(e?.message || '');
  const code = String(e?.code || '');
  if (/internal|permission-denied|unavailable/i.test(`${code} ${raw}`)) {
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

function isVehicleMiss(error) {
  return /Fant ikke kjøretøy/i.test(String(error?.message || ''));
}

function hostedOrigin() {
  if (typeof window !== 'undefined' && window.location?.origin && /^https?:/.test(window.location.origin)) {
    return window.location.origin;
  }
  return '';
}

async function lookupViaHosting(kjennemerke, signal) {
  const origin = hostedOrigin();
  if (!origin || typeof fetch !== 'function') return null;
  const headers = { Accept: 'application/json' };
  try {
    const token = await auth.currentUser?.getIdToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Uten token svarer endepunktet 401, og vi går videre til rå-API-et.
  }
  let res;
  try {
    res = await fetch(`${origin}/api/kjoretoy?kjennemerke=${encodeURIComponent(kjennemerke)}`, {
      headers,
      signal,
    });
  } catch {
    return null;
  }
  const type = res.headers?.get?.('content-type') || '';
  const body = String(type).toLowerCase().includes('json')
    ? await res.json().catch(() => null)
    : null;
  const parsed = vehicleFromProxyPayload(res.status, type, body);
  if (parsed.action === 'not-found') {
    const err = new Error(parsed.error);
    err.code = 'not-found';
    throw err;
  }
  if (parsed.action === 'hit') return parsed.vehicle;
  return null;
}

async function lookupViaCallable(kjennemerke) {
  const fn = httpsCallable(functions, 'lookupVehicleByReg', { timeout: 25000 });
  const res = await fn({ kjennemerke });
  if (res?.data?.raw) return normalizeKjoretoydata(res.data.raw);
  if (res?.data?.vehicle) return res.data.vehicle;
  const err = new Error(res?.data?.error || 'Fant ikke kjøretøy med det registreringsnummeret.');
  err.code = 'not-found';
  throw err;
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

  const hosted = await lookupViaHosting(q, signal);
  if (hosted) return hosted;

  try {
    return await lookupViaCallable(q);
  } catch (callableError) {
    if (callableError?.code === 'invalid-argument') throw callableError;
    if (isVehicleMiss(callableError)) {
      const err = new Error(friendlyLookupError(callableError));
      err.code = 'not-found';
      throw err;
    }
    try {
      return await fetchKjoretoyByReg(q, { apiKey: clientApiKey(), signal });
    } catch (publicError) {
      if (publicError?.code === 'not-found' || publicError?.code === 'invalid-argument' || publicError?.code === 'resource-exhausted') {
        throw publicError;
      }
      const err = new Error(friendlyLookupError(callableError?.message ? callableError : publicError));
      err.code = 'unavailable';
      throw err;
    }
  }
}
