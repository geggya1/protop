/**
 * Hospitality channel OAuth — Airbnb Sign in + Booking.com property connect.
 *
 * Credentials (første treff vinner):
 * 1) Env: AIRBNB_CLIENT_ID + AIRBNB_CLIENT_SECRET / BOOKING_CLIENT_ID + BOOKING_CLIENT_SECRET
 * 2) families/{familyId}/private/hospOAuth
 *
 * Tokens lagres i families/{familyId}/private/hospOAuth (aldri til klient).
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { assertFamilyMember } from './security.js';

if (!getApps().length) initializeApp();

const AIRBNB_TOKEN_URL = 'https://api.airbnb.com/v2/oauth2/authorizations';
const AIRBNB_API = 'https://api.airbnb.com/v2';
const BOOKING_TOKEN_URL = 'https://connectivity-authentication.booking.com/token-based-authentication/exchange';

function airbnbEnvCreds() {
  return {
    clientId: String(process.env.AIRBNB_CLIENT_ID || process.env.EXPO_PUBLIC_AIRBNB_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.AIRBNB_CLIENT_SECRET || '').trim(),
  };
}

function bookingEnvCreds() {
  return {
    clientId: String(process.env.BOOKING_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.BOOKING_CLIENT_SECRET || '').trim(),
  };
}

function requireAuth(auth) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Logg inn.');
  return auth.uid;
}

async function loadOAuthDoc(db, familyId) {
  const snap = await db.doc(`families/${familyId}/private/hospOAuth`).get();
  return snap.exists ? (snap.data() || {}) : {};
}

async function resolveAirbnbCreds(db, familyId) {
  const env = airbnbEnvCreds();
  if (env.clientId && env.clientSecret) return { ...env, source: 'env' };
  const stored = await loadOAuthDoc(db, familyId);
  if (stored.airbnbClientId && stored.airbnbClientSecret) {
    return {
      clientId: String(stored.airbnbClientId).trim(),
      clientSecret: String(stored.airbnbClientSecret).trim(),
      source: 'family',
    };
  }
  return { clientId: '', clientSecret: '', source: null };
}

async function resolveBookingCreds(db, familyId) {
  const env = bookingEnvCreds();
  if (env.clientId && env.clientSecret) return { ...env, source: 'env' };
  const stored = await loadOAuthDoc(db, familyId);
  if (stored.bookingClientId && stored.bookingClientSecret) {
    return {
      clientId: String(stored.bookingClientId).trim(),
      clientSecret: String(stored.bookingClientSecret).trim(),
      source: 'family',
    };
  }
  return { clientId: '', clientSecret: '', source: null };
}

function basicAuthHeader(clientId, clientSecret) {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return `Basic ${encoded}`;
}

async function exchangeAirbnbCode(code, redirectUri, creds) {
  if (!creds?.clientId || !creds?.clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Airbnb er ikke satt opp. Weekplan trenger Partner API-nøkler.',
    );
  }
  const res = await fetch(AIRBNB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
    },
    body: JSON.stringify({
      code: String(code || ''),
      redirect_uri: String(redirectUri || ''),
      grant_type: 'authorization_code',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('Airbnb token exchange failed', { status: res.status, data });
    throw new HttpsError('invalid-argument', data?.error_message || data?.error || 'Airbnb-innlogging feilet.');
  }
  return data;
}

async function refreshAirbnbToken(refreshToken, creds) {
  const res = await fetch(AIRBNB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuthHeader(creds.clientId, creds.clientSecret),
    },
    body: JSON.stringify({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpsError('unauthenticated', 'Airbnb-session utløpt. Logg inn på nytt.');
  }
  return data;
}

async function ensureAirbnbToken(db, familyId) {
  const oauth = await loadOAuthDoc(db, familyId);
  const airbnb = oauth.airbnb || {};
  if (!airbnb.refreshToken && !airbnb.accessToken) {
    throw new HttpsError('failed-precondition', 'Airbnb er ikke koblet. Trykk «Logg inn med Airbnb».');
  }
  const creds = await resolveAirbnbCreds(db, familyId);
  if (!creds.clientId || !creds.clientSecret) {
    throw new HttpsError('failed-precondition', 'Airbnb-app er ikke konfigurert.');
  }

  let accessToken = airbnb.accessToken;
  const expiresAt = Number(airbnb.expiresAt || 0);
  if (!accessToken || (expiresAt && Date.now() / 1000 > expiresAt - 120)) {
    if (!airbnb.refreshToken) {
      throw new HttpsError('unauthenticated', 'Airbnb-session utløpt. Logg inn på nytt.');
    }
    const refreshed = await refreshAirbnbToken(airbnb.refreshToken, creds);
    accessToken = refreshed.access_token;
    await db.doc(`families/${familyId}/private/hospOAuth`).set({
      airbnb: {
        ...airbnb,
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || airbnb.refreshToken,
        expiresAt: refreshed.expires_at || null,
        updatedAt: FieldValue.serverTimestamp(),
      },
    }, { merge: true });
  }
  return { accessToken, airbnb };
}

async function fetchBookingMachineToken(creds) {
  const res = await fetch(BOOKING_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('Booking token exchange failed', { status: res.status });
    throw new HttpsError('unavailable', 'Booking.com API-tilkobling feilet.');
  }
  return data;
}

async function upsertReservationsBatch(db, familyId, rows, existingByExt, defaults = {}) {
  let batch = db.batch();
  let ops = 0;
  let created = 0;
  let updated = 0;

  const flush = async () => {
    if (ops === 0) return;
    await batch.commit();
    batch = db.batch();
    ops = 0;
  };

  for (const row of rows) {
    const extId = String(row.externalId || '');
    if (!extId) continue;
    const data = { ...row, updatedAt: FieldValue.serverTimestamp() };
    const prev = existingByExt[extId];
    if (prev?.id) {
      batch.set(db.doc(`families/${familyId}/hospReservations/${prev.id}`), data, { merge: true });
      updated += 1;
    } else {
      batch.set(db.collection(`families/${familyId}/hospReservations`).doc(), {
        ...defaults,
        ...data,
        confirmedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    }
    ops += 1;
    if (ops >= 400) await flush();
  }
  await flush();
  return { created, updated };
}

async function syncAirbnbReservations(db, familyId, channelRef, propertyId) {
  const { accessToken } = await ensureAirbnbToken(db, familyId);
  const res = await fetch(`${AIRBNB_API}/reservations?limit=50`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Airbnb-Req-Api-Version': '2024.12.31',
    },
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    logger.warn('Airbnb reservations fetch failed', { status: res.status, errText });
    throw new HttpsError('unavailable', `Kunne ikke hente Airbnb-bookinger (${res.status}).`);
  }
  const payload = await res.json().catch(() => ({}));
  const reservations = payload?.reservations || payload?.data || [];

  const existingSnap = await db.collection(`families/${familyId}/hospReservations`)
    .where('sourceId', '==', 'airbnb')
    .get();
  const existingByExt = Object.fromEntries(
    existingSnap.docs.map((d) => [String(d.data()?.externalId || ''), { id: d.id, ...d.data() }]),
  );

  const rows = [];
  for (const r of reservations) {
    const extId = String(r.confirmation_code || r.id || '');
    const checkIn = r.start_date || r.check_in || r.check_in_date;
    const checkOut = r.end_date || r.check_out || r.check_out_date;
    if (!extId || !checkIn || !checkOut) continue;
    const guestName = r.guest?.first_name
      ? `${r.guest.first_name} ${r.guest.last_name || ''}`.trim()
      : (r.guest_name || 'Gjest');
    rows.push({
      propertyId: propertyId || null,
      channel: 'airbnb',
      externalId: extId,
      confirmationCode: extId,
      threadId: r.thread_id || r.thread?.id || null,
      sourceId: 'airbnb',
      guestName,
      guestEmail: r.guest?.email || r.guest_email || '',
      guestPhone: r.guest?.phone || r.guest_phone || '',
      guestCount: Number(r.number_of_guests || r.guest_count) || 1,
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      status: String(r.status_type || r.status || 'accepted').toLowerCase().includes('cancel')
        ? 'cancelled'
        : 'confirmed',
      messagingCapable: true,
    });
  }

  const { created, updated } = await upsertReservationsBatch(db, familyId, rows, existingByExt, {
    propertyName: 'Airbnb',
    notes: '',
  });

  await channelRef.set({
    connected: true,
    oauthConnected: true,
    messagingReady: true,
    type: 'airbnb',
    label: 'Airbnb',
    lastSyncAt: FieldValue.serverTimestamp(),
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, created, updated, events: reservations.length };
}

async function syncBookingReservations(db, familyId, channelRef, propertyId) {
  const creds = await resolveBookingCreds(db, familyId);
  if (!creds.clientId || !creds.clientSecret) {
    // Mark connected but skip API sync until partner credentials exist
    await channelRef.set({
      connected: true,
      oauthConnected: true,
      messagingReady: true,
      partnerAccountId: propertyId,
      lastSyncAt: FieldValue.serverTimestamp(),
      lastError: null,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, created: 0, updated: 0, events: 0, pendingApi: true };
  }

  const tokenData = await fetchBookingMachineToken(creds);
  const accessToken = tokenData.jwt || tokenData.access_token || tokenData.token;
  if (!accessToken) {
    throw new HttpsError('unavailable', 'Booking.com token mangler i svar.');
  }

  // Reservations endpoint varies by partner tier — best-effort fetch
  const res = await fetch(
    `https://supply-xml.booking.com/hotels/xml/reservations?hotel_ids=${encodeURIComponent(propertyId)}`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } },
  ).catch(() => null);

  let created = 0;
  let updated = 0;
  let eventCount = 0;

  if (res?.ok) {
    const payload = await res.json().catch(() => ({}));
    const reservations = payload?.reservations || payload?.data || [];
    eventCount = reservations.length;

    const existingSnap = await db.collection(`families/${familyId}/hospReservations`)
      .where('sourceId', '==', 'booking')
      .get();
    const existingByExt = Object.fromEntries(
      existingSnap.docs.map((d) => [String(d.data()?.externalId || ''), { id: d.id, ...d.data() }]),
    );

    const rows = [];
    for (const r of reservations) {
      const extId = String(r.id || r.reservation_id || '');
      const checkIn = r.checkin || r.arrival_date || r.check_in;
      const checkOut = r.checkout || r.departure_date || r.check_out;
      if (!extId || !checkIn || !checkOut) continue;
      rows.push({
        propertyId: propertyId || null,
        channel: 'booking',
        externalId: extId,
        sourceId: 'booking',
        guestName: r.guest_name || r.customer?.name || 'Gjest',
        guestEmail: r.customer?.email || r.guest_email || '',
        guestPhone: r.customer?.telephone || r.guest_phone || '',
        guestCount: Number(r.number_of_guests || r.guests) || 1,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
        status: String(r.status || '').toLowerCase().includes('cancel') ? 'cancelled' : 'confirmed',
      });
    }
    const batchResult = await upsertReservationsBatch(db, familyId, rows, existingByExt, {
      propertyName: 'Booking.com',
      notes: '',
    });
    created = batchResult.created;
    updated = batchResult.updated;
  }

  await channelRef.set({
    connected: true,
    oauthConnected: true,
    messagingReady: true,
    partnerAccountId: propertyId,
    type: 'booking',
    label: 'Booking.com',
    lastSyncAt: FieldValue.serverTimestamp(),
    lastError: res?.ok ? null : 'API-synk venter på full Connectivity Partner-tilgang',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, created, updated, events: eventCount };
}

/**
 * Send message into Airbnb guest inbox (Partner Messaging API).
 * Requires Sign-in OAuth with messages:write scope.
 */
export async function sendAirbnbChannelMessage(db, familyId, reservation, body) {
  const { accessToken } = await ensureAirbnbToken(db, familyId);
  const confirmationCode = String(reservation.confirmationCode || reservation.externalId || '').trim();
  const threadId = reservation.threadId || null;
  if (!confirmationCode && !threadId) {
    throw new HttpsError('failed-precondition', 'Mangler Airbnb confirmation code / thread for melding.');
  }

  const payload = {
    message: { content: String(body || '').slice(0, 4000) },
  };
  if (threadId) payload.thread_id = threadId;
  else payload.confirmation_code = confirmationCode;

  const res = await fetch(`${AIRBNB_API}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'X-Airbnb-Req-Api-Version': '2024.12.31',
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('Airbnb message send failed', { status: res.status, data });
    throw new HttpsError(
      'unavailable',
      data?.error_message || data?.error || `Airbnb-melding feilet (${res.status}).`,
    );
  }
  return {
    ok: true,
    method: 'airbnb',
    messageId: data?.id || data?.message?.id || null,
    threadId: data?.thread_id || threadId || null,
  };
}

/**
 * Send message into Booking.com guest inbox (Messaging API).
 * Requires Connectivity Partner machine account + property connection.
 */
export async function sendBookingChannelMessage(db, familyId, reservation, body) {
  const oauth = await loadOAuthDoc(db, familyId);
  const propertyId = oauth.booking?.propertyId
    || reservation.partnerAccountId
    || null;
  if (!propertyId) {
    throw new HttpsError('failed-precondition', 'Booking.com Property ID mangler — logg inn/koble først.');
  }
  const creds = await resolveBookingCreds(db, familyId);
  if (!creds.clientId || !creds.clientSecret) {
    throw new HttpsError(
      'failed-precondition',
      'Booking.com Connectivity Partner-nøkler mangler. Sign in/tilkobling kreves for innboks-meldinger.',
    );
  }
  const tokenData = await fetchBookingMachineToken(creds);
  const accessToken = tokenData.jwt || tokenData.access_token || tokenData.token;
  if (!accessToken) {
    throw new HttpsError('unavailable', 'Booking.com token mangler.');
  }

  const reservationId = String(reservation.externalId || reservation.confirmationCode || '').trim();
  if (!reservationId) {
    throw new HttpsError('failed-precondition', 'Mangler Booking.com reservation ID.');
  }

  const res = await fetch('https://supply-xml.booking.com/messaging/properties/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      hotel_id: propertyId,
      reservation_id: reservationId,
      message: String(body || '').slice(0, 4000),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    logger.warn('Booking message send failed', { status: res.status, data });
    throw new HttpsError(
      'unavailable',
      data?.message || data?.error || `Booking.com-melding feilet (${res.status}).`,
    );
  }
  return {
    ok: true,
    method: 'booking',
    messageId: data?.message_id || data?.id || null,
  };
}

/** Resolve whether family can message into a channel (Sign-in / OAuth). */
export async function getChannelMessagingCapability(db, familyId) {
  const [oauth, channelsSnap] = await Promise.all([
    loadOAuthDoc(db, familyId),
    db.collection(`families/${familyId}/hospChannels`).get(),
  ]);
  const byType = {};
  channelsSnap.docs.forEach((d) => {
    byType[d.data()?.type || d.id] = { id: d.id, ...d.data() };
  });
  return {
    airbnb: !!(oauth.airbnb?.accessToken || oauth.airbnb?.refreshToken || byType.airbnb?.oauthConnected || byType.airbnb?.messagingReady),
    booking: !!(oauth.booking?.propertyId || byType.booking?.oauthConnected || byType.booking?.messagingReady),
    oauth,
  };
}

/** Status uten å lekke secrets. */
export const hospGetChannelStatus = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  if (familyId) await assertFamilyMember(db, familyId, uid);

  const airbnbCreds = familyId
    ? await resolveAirbnbCreds(db, familyId)
    : airbnbEnvCreds();
  const bookingCreds = familyId
    ? await resolveBookingCreds(db, familyId)
    : bookingEnvCreds();

  let airbnbConn = {};
  let bookingConn = {};
  if (familyId) {
    const oauth = await loadOAuthDoc(db, familyId);
    airbnbConn = oauth.airbnb || {};
    bookingConn = oauth.booking || {};
    const chSnap = await db.collection(`families/${familyId}/hospChannels`).get();
    chSnap.docs.forEach((d) => {
      const data = d.data() || {};
      if (d.id === 'airbnb' || data.type === 'airbnb') {
        airbnbConn = { ...airbnbConn, channel: data };
      }
      if (d.id === 'booking' || data.type === 'booking') {
        bookingConn = { ...bookingConn, channel: data };
      }
    });
  }

  return {
    airbnb: {
      configured: !!(airbnbCreds.clientId && airbnbCreds.clientSecret),
      clientId: airbnbCreds.clientId || null,
      connected: !!(airbnbConn.accessToken || airbnbConn.channel?.oauthConnected || airbnbConn.channel?.messagingReady),
      messagingReady: !!(airbnbConn.accessToken || airbnbConn.refreshToken || airbnbConn.channel?.oauthConnected || airbnbConn.channel?.messagingReady),
      accountName: airbnbConn.accountName || null,
      lastSyncAt: airbnbConn.channel?.lastSyncAt || airbnbConn.lastSyncAt || null,
      redirectPath: 'oauth/airbnb',
      redirectUriHint: 'https://www.protop.no/oauth/airbnb',
    },
    booking: {
      configured: !!(bookingCreds.clientId && bookingCreds.clientSecret),
      connected: !!(bookingConn.propertyId || bookingConn.channel?.oauthConnected || bookingConn.channel?.messagingReady),
      messagingReady: !!(bookingConn.propertyId || bookingConn.channel?.oauthConnected || bookingConn.channel?.messagingReady),
      propertyId: bookingConn.propertyId || bookingConn.channel?.partnerAccountId || null,
      lastSyncAt: bookingConn.channel?.lastSyncAt || bookingConn.lastSyncAt || null,
    },
  };
});

/**
 * Lagre Airbnb/Booking Partner Client ID + Secret for familien
 * (families/{id}/private/hospOAuth). Hemmeligheter returneres aldri til klient.
 */
export const hospSavePartnerCredentials = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const provider = String(request.data?.provider || '').trim().toLowerCase();
  const clientId = String(request.data?.clientId || '').trim();
  const clientSecret = String(request.data?.clientSecret || '').trim();
  await assertFamilyMember(db, familyId, uid);

  if (provider !== 'airbnb' && provider !== 'booking') {
    throw new HttpsError('invalid-argument', 'Ukjent leverandør (airbnb|booking).');
  }
  if (!clientId || clientId.length < 4) {
    throw new HttpsError('invalid-argument', 'Client ID mangler.');
  }
  if (!clientSecret || clientSecret.length < 8) {
    throw new HttpsError('invalid-argument', 'Client Secret mangler.');
  }

  const patch = provider === 'airbnb'
    ? {
      airbnbClientId: clientId,
      airbnbClientSecret: clientSecret,
      airbnbCredsUpdatedAt: FieldValue.serverTimestamp(),
      airbnbCredsUpdatedBy: uid,
    }
    : {
      bookingClientId: clientId,
      bookingClientSecret: clientSecret,
      bookingCredsUpdatedAt: FieldValue.serverTimestamp(),
      bookingCredsUpdatedBy: uid,
    };

  await db.doc(`families/${familyId}/private/hospOAuth`).set(patch, { merge: true });
  logger.info('Partner credentials saved', { familyId, provider, by: uid });
  return {
    ok: true,
    provider,
    configured: true,
    clientId,
  };
});

export const hospAirbnbExchangeToken = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const code = String(request.data?.code || '').trim();
  const redirectUri = String(request.data?.redirectUri || '').trim();
  const propertyId = String(request.data?.propertyId || '').trim() || null;
  await assertFamilyMember(db, familyId, uid);
  if (!code) throw new HttpsError('invalid-argument', 'Mangler autorisasjonskode.');

  const creds = await resolveAirbnbCreds(db, familyId);
  const token = await exchangeAirbnbCode(code, redirectUri, creds);

  let accountName = null;
  let userId = token.user_id || null;
  try {
    if (token.access_token) {
      const meRes = await fetch(`${AIRBNB_API}/users/me`, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'X-Airbnb-Req-Api-Version': '2024.12.31',
        },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        accountName = me?.user?.first_name
          ? `${me.user.first_name} ${me.user.last_name || ''}`.trim()
          : (me?.first_name || null);
        userId = me?.user?.id || me?.id || userId;
      }
    }
  } catch (e) {
    logger.warn('Airbnb user profile skip', { message: e?.message });
  }

  await db.doc(`families/${familyId}/private/hospOAuth`).set({
    airbnb: {
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      expiresAt: token.expires_at || null,
      userId,
      accountName,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  const channelRef = db.doc(`families/${familyId}/hospChannels/airbnb`);
  await channelRef.set({
    type: 'airbnb',
    label: 'Airbnb',
    partnerAccountId: userId ? String(userId) : '',
    oauthConnected: true,
    messagingReady: true,
    connected: true,
    propertyId,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  let syncResult = { created: 0, updated: 0 };
  try {
    syncResult = await syncAirbnbReservations(db, familyId, channelRef, propertyId);
  } catch (err) {
    logger.warn('Airbnb initial sync failed', { message: err?.message });
  }

  return {
    ok: true,
    accountName,
    userId,
    ...syncResult,
  };
});

export const hospBookingConnectProperty = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const propertyId = String(request.data?.propertyId || '').trim();
  await assertFamilyMember(db, familyId, uid);
  if (!propertyId) throw new HttpsError('invalid-argument', 'Property ID mangler.');

  await db.doc(`families/${familyId}/private/hospOAuth`).set({
    booking: {
      propertyId,
      connectedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
  }, { merge: true });

  const channelRef = db.doc(`families/${familyId}/hospChannels/booking`);
  await channelRef.set({
    type: 'booking',
    label: 'Booking.com',
    partnerAccountId: propertyId,
    oauthConnected: true,
    messagingReady: true,
    connected: true,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  let syncResult = { created: 0, updated: 0, pendingApi: false };
  try {
    syncResult = await syncBookingReservations(db, familyId, channelRef, propertyId);
  } catch (err) {
    logger.warn('Booking initial sync failed', { message: err?.message });
    await channelRef.set({ lastError: err?.message || 'Synk feilet' }, { merge: true });
  }

  return { ok: true, propertyId, ...syncResult };
});

export const hospSyncChannelOAuth = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const channelType = String(request.data?.channelType || '').trim();
  await assertFamilyMember(db, familyId, uid);
  return syncOAuthChannel(db, familyId, channelType);
});

/** Shared OAuth sync — also used from hospSyncAllChannels. */
export async function syncOAuthChannel(db, familyId, channelType) {
  const channelRef = db.doc(`families/${familyId}/hospChannels/${channelType}`);
  const chSnap = await channelRef.get();
  const channel = chSnap.exists ? chSnap.data() : {};
  const propertyId = channel.propertyId || null;

  if (channelType === 'airbnb') {
    return syncAirbnbReservations(db, familyId, channelRef, propertyId);
  }
  if (channelType === 'booking') {
    const oauth = await loadOAuthDoc(db, familyId);
    const propId = oauth.booking?.propertyId || channel.partnerAccountId;
    if (!propId) throw new HttpsError('failed-precondition', 'Booking.com Property ID mangler.');
    return syncBookingReservations(db, familyId, channelRef, propId);
  }
  throw new HttpsError('invalid-argument', 'Ukjent kanal.');
}

export const hospDisconnectChannel = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const channelType = String(request.data?.channelType || '').trim();
  await assertFamilyMember(db, familyId, uid);

  const oauthRef = db.doc(`families/${familyId}/private/hospOAuth`);
  const oauth = await loadOAuthDoc(db, familyId);
  const patch = {};
  if (channelType === 'airbnb') patch.airbnb = FieldValue.delete();
  if (channelType === 'booking') patch.booking = FieldValue.delete();
  if (Object.keys(patch).length) await oauthRef.set(patch, { merge: true });

  await db.doc(`families/${familyId}/hospChannels/${channelType}`).delete().catch(() => {});
  return { ok: true };
});
