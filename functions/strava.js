/**
 * Strava OAuth — Sign in + sync (server-side client_secret).
 *
 * Credentials (første treff vinner):
 * 1) Env: STRAVA_CLIENT_ID + STRAVA_CLIENT_SECRET
 * 2) Brukerens lagrede app: users/{uid}/private/stravaApp
 * 3) Familiens lagrede app: families/{familyId}/private/stravaApp
 *
 * Brukere oppretter egen Strava API-app på https://www.strava.com/settings/api
 * (krever Strava-abonnement for Standard Tier fra 2026).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertRateLimit, hashRateKey } from './security.js';
import { onRequest } from 'firebase-functions/v2/https';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';

function envCreds() {
  const clientId = String(process.env.STRAVA_CLIENT_ID || process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.STRAVA_CLIENT_SECRET || '').trim();
  return { clientId, clientSecret };
}

async function loadStoredCreds(db, { uid }) {
  if (!uid) return null;
  const userSnap = await db.doc(`users/${uid}/private/stravaApp`).get();
  if (userSnap.exists) {
    const d = userSnap.data() || {};
    if (d.clientId && d.clientSecret) {
      return { clientId: String(d.clientId).trim(), clientSecret: String(d.clientSecret).trim(), source: 'user' };
    }
  }
  return null;
}

async function resolveCreds(db, { uid }) {
  const env = envCreds();
  if (env.clientId && env.clientSecret) return { ...env, source: 'env' };
  const stored = await loadStoredCreds(db, { uid });
  if (stored) return stored;
  return { clientId: '', clientSecret: '', source: null };
}

async function exchangeCode(code, creds) {
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Strava er ikke satt opp. Opprett en API-app på strava.com/settings/api og lim inn Client ID + Secret i Weekplan.',
    );
  }
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    code: String(code || ''),
    grant_type: 'authorization_code',
  });
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('Strava token exchange failed', { status: res.status, data });
    throw new HttpsError('invalid-argument', data?.message || 'Strava-innlogging feilet.');
  }
  return data;
}

async function refreshAccessToken(refreshToken, creds) {
  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpsError('unauthenticated', 'Strava-session utløpt. Logg inn på nytt.');
  }
  return data;
}

function mapSportType(sport) {
  const s = String(sport || '').toLowerCase();
  if (s.includes('run')) return 'loping';
  if (s.includes('ride') || s.includes('cycl')) return 'sykling';
  if (s.includes('hike') || s.includes('walk')) return s.includes('hike') ? 'hiking' : 'tur';
  if (s.includes('swim')) return 'svomming';
  if (s.includes('weight') || s.includes('workout')) return 'styrketrening';
  return 'tur';
}

function downsampleStream(latlng = [], max = 400) {
  if (!Array.isArray(latlng) || latlng.length <= max) {
    return (latlng || []).map(([lat, lon]) => ({ lat, lon }));
  }
  const step = Math.ceil(latlng.length / max);
  const out = [];
  for (let i = 0; i < latlng.length; i += step) {
    const [lat, lon] = latlng[i] || [];
    if (Number.isFinite(lat) && Number.isFinite(lon)) out.push({ lat, lon });
  }
  return out;
}

async function ensureStravaToken(db, uid, familyId) {
  const ref = db.doc(`users/${uid}/settings/fitnessConnections`);
  const snap = await ref.get();
  const data = snap.data() || {};
  const strava = data.strava || {};
  if (!strava.refreshToken && !strava.accessToken) {
    throw new HttpsError('failed-precondition', 'Strava er ikke koblet til. Trykk «Logg inn med Strava».');
  }
  const creds = await resolveCreds(db, { uid });
  if (!creds.clientId || !creds.clientSecret) {
    throw new HttpsError('failed-precondition', 'Strava-app er ikke konfigurert.');
  }

  let accessToken = strava.accessToken;
  const expiresAt = Number(strava.expiresAt || 0);
  if (!accessToken || (expiresAt && Date.now() / 1000 > expiresAt - 60)) {
    if (!strava.refreshToken) {
      throw new HttpsError('unauthenticated', 'Strava-session utløpt. Logg inn på nytt.');
    }
    const refreshed = await refreshAccessToken(strava.refreshToken, creds);
    accessToken = refreshed.access_token;
    await ref.set({
      strava: {
        ...strava,
        connected: true,
        enabled: true,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || strava.refreshToken,
        expiresAt: refreshed.expires_at || null,
        athleteId: refreshed.athlete?.id || strava.athleteId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  return { accessToken, creds };
}

/** Status uten å lekke client_secret. */
export const getStravaAppStatus = onCall(
  { timeoutSeconds: 15, memory: '256MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const db = getFirestore();
    const familyId = String(req.data?.familyId || '').trim() || null;
    const creds = await resolveCreds(db, { uid: req.auth.uid });
    const connSnap = await db.doc(`users/${req.auth.uid}/settings/fitnessConnections`).get();
    const strava = connSnap.exists ? (connSnap.data()?.strava || {}) : {};
    return {
      configured: !!(creds.clientId && creds.clientSecret),
      clientId: creds.clientId || null,
      source: creds.source || null,
      connected: !!strava.connected,
      athleteName: strava.athleteName || null,
      athleteId: strava.athleteId || null,
      lastSyncAt: strava.lastSyncAt || null,
      redirectPath: 'oauth/strava',
    };
  },
);

/**
 * Lagre egen Strava API-app (Client ID + Secret) — kun via server.
 * scope: 'user' | 'family'
 */
export const saveStravaAppConfig = onCall(
  { timeoutSeconds: 20, memory: '256MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const clientId = String(req.data?.clientId || '').trim();
    const clientSecret = String(req.data?.clientSecret || '').trim();
    const scope = String(req.data?.scope || 'user').trim();
    const familyId = String(req.data?.familyId || '').trim() || null;

    if (!/^\d+$/.test(clientId)) {
      throw new HttpsError('invalid-argument', 'Client ID skal være et tall fra Strava API-innstillingene.');
    }
    if (clientSecret.length < 8) {
      throw new HttpsError('invalid-argument', 'Client Secret mangler eller er for kort.');
    }

    const db = getFirestore();
    const payload = {
      clientId,
      clientSecret,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: req.auth.uid,
    };

    if (scope === 'family') {
      // Lagres fortsatt på bruker (families/* har bred wildcard-regel).
      // Merk familyId for deling av Client ID-visning.
      await db.doc(`users/${req.auth.uid}/private/stravaApp`).set({
        ...payload,
        shareWithFamilyId: familyId || null,
      }, { merge: true });
    } else {
      await db.doc(`users/${req.auth.uid}/private/stravaApp`).set(payload, { merge: true });
    }

    return { ok: true, clientId, scope };
  },
);

export const stravaExchangeToken = onCall(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const code = String(req.data?.code || '').trim();
    const familyId = String(req.data?.familyId || '').trim() || null;
    if (!code) throw new HttpsError('invalid-argument', 'Mangler autorisasjonskode.');

    const db = getFirestore();
    const uid = req.auth.uid;
    const creds = await resolveCreds(db, { uid });
    const token = await exchangeCode(code, creds);

    let weightKg = null;
    try {
      if (token.athlete?.weight != null && Number.isFinite(Number(token.athlete.weight))) {
        weightKg = Number(token.athlete.weight);
      } else if (token.access_token) {
        const athRes = await fetch('https://www.strava.com/api/v3/athlete', {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        if (athRes.ok) {
          const ath = await athRes.json();
          if (ath?.weight != null && Number.isFinite(Number(ath.weight))) {
            weightKg = Number(ath.weight);
          }
        }
      }
    } catch (e) {
      logger.warn('Strava athlete weight skip', { message: e?.message });
    }

    const ref = db.doc(`users/${uid}/settings/fitnessConnections`);
    const patch = {
      strava: {
        connected: true,
        enabled: true,
        source: 'oauth',
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_at || null,
        athleteId: token.athlete?.id || null,
        athleteName: [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(' ') || null,
        familyId: familyId || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      // Merk Garmin/Apple som «via Strava» når bruker logger inn
      garmin: {
        connected: true,
        enabled: true,
        source: 'strava_bridge',
        updatedAt: FieldValue.serverTimestamp(),
      },
      apple_health: {
        connected: true,
        enabled: true,
        source: 'strava_bridge',
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (weightKg != null) {
      patch.healthProfile = {
        weightKg: Math.round(weightKg * 10) / 10,
        source: 'strava',
        updatedAt: FieldValue.serverTimestamp(),
      };
    }
    await ref.set(patch, { merge: true });

    return {
      ok: true,
      athleteId: token.athlete?.id || null,
      athleteName: [token.athlete?.firstname, token.athlete?.lastname].filter(Boolean).join(' ') || null,
      weightKg,
    };
  },
);

export const stravaSyncActivities = onCall(
  { timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const db = getFirestore();
    await assertRateLimit(db, {
      key: hashRateKey(['strava-sync', req.auth.uid]),
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const uid = req.auth.uid;
    const familyId = String(req.data?.familyId || '').trim() || null;
    const { accessToken } = await ensureStravaToken(db, uid, familyId);
    const perPage = Math.min(50, Number(req.data?.perPage) || 30);

    const listRes = await fetch(
      `https://www.strava.com/api/v3/athlete/activities?per_page=${perPage}`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const activities = await listRes.json().catch(() => []);
    if (!listRes.ok) {
      logger.warn('Strava activities failed', { status: listRes.status, activities });
      throw new HttpsError('internal', 'Kunne ikke hente Strava-aktiviteter.');
    }

    const col = db.collection(`users/${uid}/importedWorkouts`);
    let imported = 0;
    let skipped = 0;

    for (const act of activities) {
      const externalId = `strava_${act.id}`;
      const existing = await col.where('externalId', '==', externalId).limit(1).get();
      if (!existing.empty) {
        skipped += 1;
        continue;
      }

      let track = [];
      try {
        const streamRes = await fetch(
          `https://www.strava.com/api/v3/activities/${act.id}/streams?keys=latlng&key_by_type=true`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        if (streamRes.ok) {
          const streams = await streamRes.json();
          track = downsampleStream(streams?.latlng?.data || []);
        }
      } catch (e) {
        logger.warn('Strava stream skip', { id: act.id, message: e?.message });
      }

      await col.add({
        title: act.name || 'Strava-aktivitet',
        type: mapSportType(act.sport_type || act.type),
        source: 'strava',
        sourceFormat: 'strava',
        sourceFile: null,
        externalId,
        startedAt: act.start_date || act.start_date_local || null,
        durationSec: act.moving_time ?? act.elapsed_time ?? null,
        distanceM: act.distance != null ? Math.round(act.distance) : null,
        elevationGainM: act.total_elevation_gain != null ? Math.round(act.total_elevation_gain) : null,
        calories: act.calories ?? null,
        avgHr: act.average_heartrate != null ? Math.round(act.average_heartrate) : null,
        maxHr: act.max_heartrate != null ? Math.round(act.max_heartrate) : null,
        weightKg: null,
        track,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      imported += 1;
    }

    await db.doc(`users/${uid}/settings/fitnessConnections`).set({
      strava: {
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncImported: imported,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return { ok: true, imported, skipped, total: activities.length };
  },
);

/** Koble fra Strava (lokal token). */
export const stravaDisconnect = onCall(
  { timeoutSeconds: 15, memory: '256MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const db = getFirestore();
    await db.doc(`users/${req.auth.uid}/settings/fitnessConnections`).set({
      strava: {
        connected: false,
        enabled: false,
        accessToken: null,
        refreshToken: null,
        expiresAt: null,
        disconnectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true };
  },
);

/**
 * Strava push webhook (sanntid).
 * GET: hub challenge. POST: activity events → importer tur.
 * Env: STRAVA_WEBHOOK_VERIFY_TOKEN (+ client id/secret for create subscription)
 */
async function importOneStravaActivity(db, uid, accessToken, activityId) {
  const col = db.collection(`users/${uid}/importedWorkouts`);
  const externalId = `strava_${activityId}`;
  const existing = await col.where('externalId', '==', externalId).limit(1).get();
  if (!existing.empty) return { skipped: true };

  const actRes = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const act = await actRes.json().catch(() => null);
  if (!actRes.ok || !act) {
    logger.warn('Strava webhook activity fetch failed', { activityId, status: actRes.status });
    return { skipped: true };
  }

  let track = [];
  try {
    const streamRes = await fetch(
      `https://www.strava.com/api/v3/activities/${activityId}/streams?keys=latlng&key_by_type=true`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (streamRes.ok) {
      const streams = await streamRes.json();
      track = downsampleStream(streams?.latlng?.data || []);
    }
  } catch { /* ignore */ }

  await col.add({
    title: act.name || 'Strava-aktivitet',
    type: mapSportType(act.sport_type || act.type),
    source: 'strava',
    sourceFormat: 'strava_webhook',
    sourceFile: null,
    externalId,
    startedAt: act.start_date || act.start_date_local || null,
    durationSec: act.moving_time ?? act.elapsed_time ?? null,
    distanceM: act.distance != null ? Math.round(act.distance) : null,
    elevationGainM: act.total_elevation_gain != null ? Math.round(act.total_elevation_gain) : null,
    calories: act.calories ?? null,
    avgHr: act.average_heartrate != null ? Math.round(act.average_heartrate) : null,
    maxHr: act.max_heartrate != null ? Math.round(act.max_heartrate) : null,
    weightKg: null,
    track,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { imported: true };
}

export const stravaWebhook = onRequest(
  { timeoutSeconds: 60, memory: '512MiB', cors: false },
  async (req, res) => {
    const db = getFirestore();
    const verifyToken = String(process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || '').trim();
    if (!verifyToken || verifyToken === 'weekplan-strava') {
      logger.error('STRAVA_WEBHOOK_VERIFY_TOKEN mangler eller bruker usikker default');
      res.status(503).send('Webhook not configured');
      return;
    }

    if (req.method === 'GET') {
      const mode = req.query['hub.mode'];
      const token = req.query['hub.verify_token'];
      const challenge = req.query['hub.challenge'];
      if (mode === 'subscribe' && token === verifyToken && challenge) {
        res.status(200).json({ 'hub.challenge': challenge });
        return;
      }
      res.status(403).send('Forbidden');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    // Strava does not sign POSTs; require a shared subscription + opaque object shape.
    const body = req.body;
    const events = Array.isArray(body) ? body : [body];
    if (!events.length || events.length > 25) {
      res.status(400).send('Bad Request');
      return;
    }
    const looksLikeStrava = events.every((ev) => ev && typeof ev === 'object'
      && ('object_type' in ev || 'aspect_type' in ev || 'owner_id' in ev));
    if (!looksLikeStrava) {
      res.status(400).send('Bad Request');
      return;
    }

    // Ack immediately (Strava expects fast 200)
    res.status(200).send('EVENT_RECEIVED');

    try {
      for (const ev of events) {
        if (!ev || ev.object_type !== 'activity') continue;
        if (ev.aspect_type !== 'create' && ev.aspect_type !== 'update') continue;
        const athleteId = ev.owner_id;
        const activityId = ev.object_id;
        if (!athleteId || !activityId) continue;

        const users = await db.collectionGroup('settings')
          .where('strava.athleteId', '==', athleteId)
          .limit(5)
          .get()
          .catch(() => null);

        // Fallback: scan fitnessConnections docs via collection group on fitnessConnections path
        let docs = users?.docs || [];
        if (!docs.length) {
          const alt = await db.collectionGroup('settings')
            .where('strava.athleteId', '==', Number(athleteId))
            .limit(5)
            .get()
            .catch(() => null);
          docs = alt?.docs || [];
        }

        for (const d of docs) {
          const path = d.ref.path; // users/{uid}/settings/fitnessConnections
          const parts = path.split('/');
          const uid = parts[1];
          if (!uid) continue;
          try {
            const { accessToken } = await ensureStravaToken(db, uid, null);
            await importOneStravaActivity(db, uid, accessToken, activityId);
            await d.ref.set({
              strava: {
                lastWebhookAt: FieldValue.serverTimestamp(),
                lastWebhookActivityId: activityId,
              },
            }, { merge: true });
          } catch (e) {
            logger.warn('Strava webhook import failed', { uid, activityId, message: e?.message });
          }
        }
      }
    } catch (e) {
      logger.error('Strava webhook handler error', { message: e?.message });
    }
  },
);

/** Opprett Strava push-subscription (sanntid). */
export const registerStravaWebhook = onCall(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    if (!req.auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
    const db = getFirestore();
    const creds = await resolveCreds(db, { uid: req.auth.uid });
    if (!creds.clientId || !creds.clientSecret) {
      throw new HttpsError('failed-precondition', 'Sett opp Strava Client ID/Secret først.');
    }
    const callbackUrl = String(req.data?.callbackUrl || '').trim()
      || String(process.env.STRAVA_WEBHOOK_CALLBACK_URL || '').trim();
    if (!callbackUrl) {
      throw new HttpsError(
        'failed-precondition',
        'Mangler callbackUrl. Etter deploy: https://REGION-PROJECT.cloudfunctions.net/stravaWebhook',
      );
    }
    const verifyToken = String(process.env.STRAVA_WEBHOOK_VERIFY_TOKEN || '').trim();
    if (!verifyToken || verifyToken === 'weekplan-strava') {
      throw new HttpsError(
        'failed-precondition',
        'Sett STRAVA_WEBHOOK_VERIFY_TOKEN (sterk, unik verdi) før webhook registreres.',
      );
    }
    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    });
    const res = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.warn('Strava webhook register failed', { status: res.status, data });
      throw new HttpsError('internal', data?.message || 'Kunne ikke aktivere Strava sanntid.');
    }
    await db.doc(`users/${req.auth.uid}/settings/fitnessConnections`).set({
      strava: {
        webhookId: data.id || null,
        webhookEnabled: true,
        webhookCallback: callbackUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, id: data.id || null };
  },
);
