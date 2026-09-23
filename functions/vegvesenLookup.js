/**
 * Statens vegvesen kjøretøyoppslag.
 *
 * Bruker samme offentlige rå-API som vegvesen.no («Sjekk kjøretøyopplysninger»).
 * Ingen API-nøkkel kreves. Valgfri VEGVESEN_API_KEY brukes bare som fallback
 * mot enkeltoppslag-API hvis offentlig endepunkt feiler teknisk.
 *
 * Returnerer rå SVV-objekt (uten eierskap). Klienten normaliserer til skjema-felter.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertRateLimit, hashRateKey } from './security.js';

// Slim deploy entry (vegvesenIndex.js) must init Admin — rate limit uses Firestore.
if (!getApps().length) initializeApp();

const VEGVESEN_PUBLIC_RAW_BASE =
  'https://kjoretoyoppslag.atlas.vegvesen.no/ws/no/vegvesen/kjoretoy/kjoretoyoppslag/v3/oppslag/raw';

const VEGVESEN_KJORETOYDATA_URL =
  'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';

function normalizeRegNumber(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÆØÅ]/gi, '');
}

function stripOwner(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  const { eierskap, ...rest } = raw;
  return rest;
}

function extractRaw(payload) {
  if (Array.isArray(payload?.kjoretoydataListe) && payload.kjoretoydataListe[0]) {
    return stripOwner(payload.kjoretoydataListe[0]);
  }
  if (payload?.kjoretoy) return stripOwner(payload.kjoretoy);
  if (payload?.kjoretoyId) return stripOwner(payload);
  return null;
}

async function fetchPublicRaw(kjennemerke) {
  const res = await fetch(`${VEGVESEN_PUBLIC_RAW_BASE}/${encodeURIComponent(kjennemerke)}`, {
    headers: {
      Accept: 'application/json',
      Origin: 'https://www.vegvesen.no',
      Referer: 'https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/',
    },
  });
  if (res.status === 404 || res.status === 204) {
    throw new HttpsError('not-found', 'Fant ikke kjøretøy med det registreringsnummeret.');
  }
  if (res.status === 429) {
    throw new HttpsError('resource-exhausted', 'For mange oppslag mot Vegvesenet — prøv igjen om litt.');
  }
  if (!res.ok) {
    const err = new Error(`public HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const raw = extractRaw(data);
  if (!raw) {
    throw new HttpsError(
      'not-found',
      data?.feilmelding || data?.melding || 'Fant ikke kjøretøy med det registreringsnummeret.',
    );
  }
  return raw;
}

async function fetchEnkeltoppslag(kjennemerke, apiKey) {
  const params = new URLSearchParams();
  if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(kjennemerke)) {
    params.set('understellsnummer', kjennemerke);
  } else {
    params.set('kjennemerke', kjennemerke);
  }
  const res = await fetch(`${VEGVESEN_KJORETOYDATA_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'SVV-Authorization': `Apikey ${apiKey}`,
    },
  });
  if (res.status === 401 || res.status === 403) {
    throw new HttpsError('failed-precondition', 'Vegvesen avviste API-nøkkelen.');
  }
  if (res.status === 404) {
    throw new HttpsError('not-found', 'Fant ikke kjøretøy med det registreringsnummeret.');
  }
  if (!res.ok) {
    throw new HttpsError('unavailable', `Vegvesen HTTP ${res.status}`);
  }
  const data = await res.json();
  const raw = extractRaw(data);
  if (!raw) {
    throw new HttpsError(
      'not-found',
      data?.feilmelding || 'Fant ikke kjøretøy med det registreringsnummeret.',
    );
  }
  return raw;
}

export const lookupVehicleByReg = onCall(
  {
    region: 'europe-west1',
    cors: true,
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Du må være innlogget.');
    }
    await assertRateLimit(getFirestore(), {
      key: hashRateKey(['vegvesen', request.auth.uid]),
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    const kjennemerke = normalizeRegNumber(
      request.data?.kjennemerke || request.data?.regNumber || request.data?.plate || '',
    );
    if (!kjennemerke) {
      throw new HttpsError('invalid-argument', 'Oppgi registreringsnummer.');
    }

    try {
      try {
        const raw = await fetchPublicRaw(kjennemerke);
        return { raw, source: 'vegvesen.public' };
      } catch (publicErr) {
        if (publicErr instanceof HttpsError) throw publicErr;
        const apiKey = String(process.env.VEGVESEN_API_KEY || '').trim();
        if (!apiKey) {
          logger.warn('lookupVehicleByReg public failed, no API key fallback', {
            message: publicErr?.message,
            status: publicErr?.status,
            uid: request.auth.uid,
          });
          throw new HttpsError(
            'unavailable',
            publicErr?.message || 'Klarte ikke hente data fra Vegvesenet.',
          );
        }
        logger.warn('lookupVehicleByReg falling back to enkeltoppslag', {
          message: publicErr?.message,
          uid: request.auth.uid,
        });
        const raw = await fetchEnkeltoppslag(kjennemerke, apiKey);
        return { raw, source: 'vegvesen.enkeltoppslag' };
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      logger.warn('lookupVehicleByReg failed', {
        message: error?.message,
        uid: request.auth.uid,
      });
      throw new HttpsError('unavailable', error?.message || 'Klarte ikke hente data fra Vegvesenet.');
    }
  },
);
