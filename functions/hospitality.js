/**
 * Hospitality PMS cloud functions:
 * - Nuki Web API (API token stored under users/{uid}/private/hospNuki_* — already
 *   client-denied in existing rules, no families/private deploy needed)
 * - iCal sync for Airbnb / Booking.com
 * - Automessage processing + scheduled poll
 * - Reply draft helper (template-based; Gemini optional later)
 */

import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertRateLimit, hashRateKey, assertFamilyMember } from './security.js';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { sendMail } from './mail.js';
import { assertSafeOutboundUrl, isBlockedOutboundHost } from './security.js';

if (!getApps().length) initializeApp();

const NUKI_API = 'https://api.nuki.io';

/** Optional — avoid defineSecret so hospitality can deploy without Secret Manager IAM. */
function mailApiKey() {
  return String(process.env.WEEKPLAN_MAIL_KEY || process.env.MAIL_API_KEY || '').trim();
}

// --- Pure helpers (kept in-functions to avoid cross-package imports) ---

const RESERVATION_STATUS = {
  inquiry: 'inquiry',
  confirmed: 'confirmed',
  checked_in: 'checked_in',
  checked_out: 'checked_out',
  cancelled: 'cancelled',
  no_show: 'no_show',
};

const MESSAGE_TRIGGERS = {
  booking_confirmed: 'booking_confirmed',
  hours_before_checkin: 'hours_before_checkin',
  hours_after_checkin: 'hours_after_checkin',
  hours_before_checkout: 'hours_before_checkout',
  hours_after_checkout: 'hours_after_checkout',
  on_cancellation: 'on_cancellation',
  review_request: 'review_request',
};

function isValidNukiPin(code) {
  const s = String(code ?? '');
  if (!/^[1-9]{6}$/.test(s)) return false;
  if (s.startsWith('12')) return false;
  return true;
}

function generateNukiPin(existing = []) {
  const used = new Set((existing || []).map((c) => String(c)));
  for (let i = 0; i < 500; i += 1) {
    let code = '';
    for (let d = 0; d < 6; d += 1) code += String(1 + Math.floor(Math.random() * 9));
    if (isValidNukiPin(code) && !used.has(code)) return code;
  }
  throw new HttpsError('internal', 'Kunne ikke generere unik Nuki-PIN');
}

function lockValidityWindow(checkIn, checkOut, { earlyHours = 0, lateHours = 0 } = {}) {
  const from = new Date(checkIn);
  const until = new Date(checkOut);
  if (Number.isNaN(from.getTime()) || Number.isNaN(until.getTime())) {
    throw new HttpsError('invalid-argument', 'Ugyldig innsjekk/utsjekk');
  }
  if (until <= from) throw new HttpsError('invalid-argument', 'Utsjekk må være etter innsjekk');
  return {
    allowedFromDate: new Date(from.getTime() - earlyHours * 3600_000).toISOString(),
    allowedUntilDate: new Date(until.getTime() + lateHours * 3600_000).toISOString(),
  };
}

function nukiAuthName(guestName, reservationId) {
  const base = String(guestName || 'Guest').replace(/[^\wÆØÅæøå -]/gi, '').trim() || 'Guest';
  const shortId = String(reservationId || '').slice(-4);
  return `${base} ${shortId}`.trim().slice(0, 20) || 'Guest';
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value?.toDate === 'function') {
    try { return value.toDate(); } catch { return null; }
  }
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function renderTemplate(text, vars = {}) {
  return String(text ?? '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const v = vars[key];
    return v == null ? '' : String(v);
  });
}

function formatNbDateTime(d) {
  try {
    return new Intl.DateTimeFormat('nb-NO', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
  } catch {
    return d.toISOString();
  }
}

function formatNbTime(d) {
  try {
    return new Intl.DateTimeFormat('nb-NO', { hour: '2-digit', minute: '2-digit' }).format(d);
  } catch {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function buildMessageVars(reservation = {}, property = {}, lock = {}) {
  const checkIn = toDate(reservation.checkIn);
  const checkOut = toDate(reservation.checkOut);
  return {
    guestName: reservation.guestName || 'gjest',
    guestEmail: reservation.guestEmail || '',
    guestPhone: reservation.guestPhone || '',
    propertyName: property.name || reservation.propertyName || 'boligen',
    address: property.address || '',
    wifiName: property.wifiName || '',
    wifiPassword: property.wifiPassword || '',
    checkInInstructions: property.checkInInstructions || '',
    checkOutInstructions: property.checkOutInstructions || '',
    checkIn: checkIn ? formatNbDateTime(checkIn) : '',
    checkOut: checkOut ? formatNbDateTime(checkOut) : '',
    checkInTime: (checkIn ? formatNbTime(checkIn) : null) || property.checkInTime || '15:00',
    checkOutTime: (checkOut ? formatNbTime(checkOut) : null) || property.checkOutTime || '11:00',
    lockCode: lock.code || reservation.lockCode || '',
    lockValidFrom: lock.allowedFromDate ? formatNbDateTime(toDate(lock.allowedFromDate)) : '',
    lockValidUntil: lock.allowedUntilDate ? formatNbDateTime(toDate(lock.allowedUntilDate)) : '',
    channel: reservation.channel || '',
  };
}

function computeMessageSendAt(template, reservation, now = new Date()) {
  const checkIn = toDate(reservation?.checkIn);
  const checkOut = toDate(reservation?.checkOut);
  const confirmedAt = toDate(reservation?.confirmedAt) || toDate(reservation?.createdAt) || now;
  const cancelledAt = toDate(reservation?.cancelledAt) || now;
  const offsetMs = Math.max(0, Number(template?.offsetHours) || 0) * 3600_000;
  const trigger = template?.trigger;
  if (trigger === MESSAGE_TRIGGERS.booking_confirmed) return new Date(confirmedAt.getTime() + offsetMs);
  if (trigger === MESSAGE_TRIGGERS.on_cancellation) return new Date(cancelledAt.getTime() + offsetMs);
  if (trigger === MESSAGE_TRIGGERS.hours_before_checkin) return checkIn ? new Date(checkIn.getTime() - offsetMs) : null;
  if (trigger === MESSAGE_TRIGGERS.hours_after_checkin) return checkIn ? new Date(checkIn.getTime() + offsetMs) : null;
  if (trigger === MESSAGE_TRIGGERS.hours_before_checkout) return checkOut ? new Date(checkOut.getTime() - offsetMs) : null;
  if (trigger === MESSAGE_TRIGGERS.hours_after_checkout || trigger === MESSAGE_TRIGGERS.review_request) {
    return checkOut ? new Date(checkOut.getTime() + offsetMs) : null;
  }
  return null;
}

function messageDedupeKey(template, reservation) {
  return `${reservation.id || reservation.externalId || 'r'}::${template.id || template.trigger}::${template.offsetHours ?? 0}`;
}

function shouldSendMessage(template, reservation, { now = new Date(), alreadySentKeys = [] } = {}) {
  if (!template?.enabled) return false;
  if (!reservation || reservation.status === RESERVATION_STATUS.cancelled) {
    if (template.trigger !== MESSAGE_TRIGGERS.on_cancellation) return false;
  }
  if (template.trigger === MESSAGE_TRIGGERS.on_cancellation
    && reservation.status !== RESERVATION_STATUS.cancelled) return false;
  const key = messageDedupeKey(template, reservation);
  if ((alreadySentKeys || []).includes(key)) return false;
  const sendAt = computeMessageSendAt(template, reservation, now);
  if (!sendAt) return false;
  const ageMs = now.getTime() - sendAt.getTime();
  if (ageMs < 0 || ageMs > 36 * 3600_000) return false;
  return true;
}

function detectChannelFromIcalUrl(url) {
  const u = String(url || '').toLowerCase();
  if (u.includes('airbnb.')) return 'airbnb';
  if (u.includes('booking.') || u.includes('ical.booking')) return 'booking';
  return 'ical';
}

function unescapeIcal(s) {
  return String(s || '')
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

function parseIcalDate(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^\d{8}$/.test(s)) {
    return new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));
  }
  const m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (m) {
    const [, Y, Mo, D, h, mi, se, z] = m;
    if (z) return new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +se));
    return new Date(+Y, +Mo - 1, +D, +h, +mi, +se);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractGuestName(summary, description) {
  const s = String(summary || '');
  if (/^(reserved|blocked|not available|closed)/i.test(s.trim())) {
    const fromDesc = String(description || '').match(/(?:guest|gjest|name)[:\s]+(.+)/i);
    if (fromDesc) return fromDesc[1].trim().slice(0, 80);
    return s.trim();
  }
  return s.replace(/\s*\([^)]*\)\s*$/, '').trim().slice(0, 80) || 'Gjest';
}

function parseIcalEvents(icsText) {
  const text = String(icsText || '').replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
  const events = [];
  const blocks = text.split('BEGIN:VEVENT').slice(1);
  for (const raw of blocks) {
    const block = raw.split('END:VEVENT')[0] || '';
    const get = (key) => {
      const re = new RegExp(`^${key}[^:]*:(.*)$`, 'mi');
      const m = block.match(re);
      return m ? m[1].trim() : '';
    };
    const uid = get('UID');
    const summary = unescapeIcal(get('SUMMARY'));
    const description = unescapeIcal(get('DESCRIPTION'));
    const statusRaw = (get('STATUS') || '').toUpperCase();
    const dtStart = parseIcalDate(get('DTSTART'));
    const dtEnd = parseIcalDate(get('DTEND'));
    if (!dtStart || !dtEnd) continue;
    events.push({
      externalId: uid || `${dtStart.toISOString()}_${dtEnd.toISOString()}_${summary}`,
      guestName: extractGuestName(summary, description),
      summary,
      description,
      checkIn: dtStart.toISOString(),
      checkOut: dtEnd.toISOString(),
      status: statusRaw === 'CANCELLED' ? RESERVATION_STATUS.cancelled : RESERVATION_STATUS.confirmed,
    });
  }
  return events;
}

function mergeIcalReservations(existing = [], events = [], {
  channel, propertyId, sourceId, now = new Date(),
} = {}) {
  const byExternal = new Map();
  for (const r of existing) {
    if (r.externalId && r.sourceId === sourceId) byExternal.set(r.externalId, r);
  }
  const upserts = [];
  const seen = new Set();
  for (const ev of events) {
    seen.add(ev.externalId);
    const prev = byExternal.get(ev.externalId);
    const base = {
      externalId: ev.externalId,
      sourceId: sourceId || null,
      propertyId,
      channel: channel || 'ical',
      guestName: ev.guestName,
      summary: ev.summary,
      description: ev.description || '',
      checkIn: ev.checkIn,
      checkOut: ev.checkOut,
      status: ev.status,
      syncAt: now.toISOString(),
    };
    if (!prev) upserts.push({ action: 'create', data: base });
    else {
      const changed =
        prev.checkIn !== ev.checkIn
        || prev.checkOut !== ev.checkOut
        || (prev.status !== RESERVATION_STATUS.cancelled && ev.status === RESERVATION_STATUS.cancelled)
        || prev.guestName !== ev.guestName;
      if (changed) {
        let status = prev.status;
        if (ev.status === RESERVATION_STATUS.cancelled) status = RESERVATION_STATUS.cancelled;
        else if (prev.status === RESERVATION_STATUS.cancelled) status = RESERVATION_STATUS.confirmed;
        upserts.push({ action: 'update', id: prev.id, data: { ...base, status } });
      }
    }
  }
  for (const [extId, prev] of byExternal) {
    if (seen.has(extId)) continue;
    if ([RESERVATION_STATUS.confirmed, RESERVATION_STATUS.inquiry, RESERVATION_STATUS.checked_in].includes(prev.status)) {
      upserts.push({
        action: 'update',
        id: prev.id,
        data: {
          status: RESERVATION_STATUS.cancelled,
          cancelledAt: now.toISOString(),
          syncAt: now.toISOString(),
          cancelReason: 'removed_from_ical',
        },
      });
    }
  }
  return upserts;
}

// --- Auth helpers ---

function requireAuth(auth) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Du må være innlogget.');
  return auth.uid;
}

async function nukiFetch(token, path, { method = 'GET', body } = {}) {
  const res = await fetch(`${NUKI_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!res.ok) {
    logger.warn('Nuki API error', { path, status: res.status, data });
    throw new HttpsError('failed-precondition', `Nuki API feilet (${res.status}).`);
  }
  return data;
}

function nukiSecretPath(uid, familyId) {
  return `users/${uid}/private/hospNuki_${familyId}`;
}

async function loadNukiToken(db, familyId) {
  const ch = await db.doc(`families/${familyId}/hospChannels/nuki`).get();
  const connectedBy = ch.exists ? String(ch.data()?.connectedBy || '').trim() : '';
  if (!connectedBy) return '';
  const snap = await db.doc(nukiSecretPath(connectedBy, familyId)).get();
  return snap.exists ? String(snap.data()?.apiToken || '').trim() : '';
}

async function nukiTokenIsSet(db, familyId) {
  const token = await loadNukiToken(db, familyId);
  return !!token;
}

// --- Callables ---

export const hospSaveNukiToken = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const apiToken = String(request.data?.apiToken || '').trim();
  await assertFamilyMember(db, familyId, uid);
  if (!apiToken || apiToken.length < 10) {
    throw new HttpsError('invalid-argument', 'Ugyldig Nuki API-token.');
  }
  // Verify token by listing smartlocks
  const locks = await nukiFetch(apiToken, '/smartlock');
  // Store secret under users/{uid}/private (existing rules: client write false)
  await db.doc(nukiSecretPath(uid, familyId)).set({
    apiToken,
    familyId,
    connected: true,
    connectedBy: uid,
    connectedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await db.doc(`families/${familyId}/hospChannels/nuki`).set({
    type: 'nuki',
    label: 'Nuki',
    connected: true,
    apiTokenSet: true,
    connectedBy: uid,
    lockCount: Array.isArray(locks) ? locks.length : 0,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    lastError: null,
  }, { merge: true });
  return { ok: true, lockCount: Array.isArray(locks) ? locks.length : 0 };
});

export const hospGetNukiStatus = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const ch = await db.doc(`families/${familyId}/hospChannels/nuki`).get();
  const connected = await nukiTokenIsSet(db, familyId);
  return {
    connected,
    apiTokenSet: connected,
    lockCount: ch.exists ? (ch.data()?.lockCount || 0) : 0,
    lastSyncAt: ch.exists ? (ch.data()?.lastSyncAt || null) : null,
    lastError: ch.exists ? (ch.data()?.lastError || null) : null,
  };
});

export const hospDisconnectNuki = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const ch = await db.doc(`families/${familyId}/hospChannels/nuki`).get();
  const connectedBy = ch.exists ? String(ch.data()?.connectedBy || uid).trim() : uid;
  await db.doc(nukiSecretPath(connectedBy, familyId)).delete().catch(() => {});
  if (connectedBy !== uid) {
    await db.doc(nukiSecretPath(uid, familyId)).delete().catch(() => {});
  }
  await db.doc(`families/${familyId}/hospChannels/nuki`).set({
    type: 'nuki',
    connected: false,
    apiTokenSet: false,
    connectedBy: null,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

export const hospSyncNukiLocks = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const token = await loadNukiToken(db, familyId);
  if (!token) throw new HttpsError('failed-precondition', 'Nuki er ikke koblet til.');
  const locks = await nukiFetch(token, '/smartlock');
  const batch = db.batch();
  const list = Array.isArray(locks) ? locks : [];
  for (const lock of list) {
    const id = String(lock.smartlockId || lock.id);
    const ref = db.doc(`families/${familyId}/hospLocks/${id}`);
    batch.set(ref, {
      provider: 'nuki',
      smartlockId: id,
      name: lock.name || `Nuki ${id}`,
      type: lock.type ?? null,
      state: lock.state || null,
      batteryCritical: !!(lock.state?.batteryCritical),
      keypadPaired: !!(lock.config?.keypadPaired),
      rawName: lock.name || null,
      syncedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  batch.set(db.doc(`families/${familyId}/hospChannels/nuki`), {
    type: 'nuki',
    connected: true,
    apiTokenSet: true,
    lockCount: list.length,
    lastSyncAt: FieldValue.serverTimestamp(),
    lastError: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  await batch.commit();
  return {
    ok: true,
    locks: list.map((l) => ({
      smartlockId: String(l.smartlockId || l.id),
      name: l.name || '',
      keypadPaired: !!(l.config?.keypadPaired),
    })),
  };
});

export const hospProvisionLockCode = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const reservationId = String(request.data?.reservationId || '');
  await assertFamilyMember(db, familyId, uid);
  if (!reservationId) throw new HttpsError('invalid-argument', 'reservationId mangler.');

  const resRef = db.doc(`families/${familyId}/hospReservations/${reservationId}`);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new HttpsError('not-found', 'Booking ikke funnet.');
  const reservation = { id: resSnap.id, ...resSnap.data() };
  if (reservation.status === RESERVATION_STATUS.cancelled) {
    throw new HttpsError('failed-precondition', 'Kan ikke lage kode for kansellert booking.');
  }

  let property = {};
  if (reservation.propertyId) {
    const p = await db.doc(`families/${familyId}/hospProperties/${reservation.propertyId}`).get();
    if (p.exists) property = p.data() || {};
  }
  const smartlockId = String(property.nukiSmartlockId || request.data?.smartlockId || '').trim();
  if (!smartlockId) {
    throw new HttpsError('failed-precondition', 'Ingen Nuki-lås knyttet til boligen.');
  }

  const token = await loadNukiToken(db, familyId);
  if (!token) throw new HttpsError('failed-precondition', 'Nuki er ikke koblet til.');

  // Collect existing codes for uniqueness
  const authList = await nukiFetch(token, `/smartlock/${smartlockId}/auth`).catch(() => []);
  const existingCodes = (Array.isArray(authList) ? authList : [])
    .map((a) => a.code)
    .filter(Boolean);

  const code = generateNukiPin(existingCodes);
  const window = lockValidityWindow(reservation.checkIn, reservation.checkOut, {
    earlyHours: Number(property.lockEarlyHours) || 0,
    lateHours: Number(property.lockLateHours) || 0,
  });
  const name = nukiAuthName(reservation.guestName, reservationId);

  await nukiFetch(token, '/smartlock/auth', {
    method: 'PUT',
    body: {
      name,
      smartlockIds: [Number(smartlockId) || smartlockId],
      type: 13,
      code: Number(code),
      allowedFromDate: window.allowedFromDate,
      allowedUntilDate: window.allowedUntilDate,
    },
  });

  // Resolve auth id
  const after = await nukiFetch(token, `/smartlock/${smartlockId}/auth`).catch(() => []);
  const created = (Array.isArray(after) ? after : []).find(
    (a) => String(a.code) === String(code) || a.name === name,
  );

  await resRef.set({
    lockCode: code,
    lockAuthId: created?.id || null,
    lockSmartlockId: smartlockId,
    lockAllowedFrom: window.allowedFromDate,
    lockAllowedUntil: window.allowedUntilDate,
    lockProvisionedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    code,
    authId: created?.id || null,
    ...window,
  };
});

export const hospRevokeLockCode = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const reservationId = String(request.data?.reservationId || '');
  await assertFamilyMember(db, familyId, uid);
  const resRef = db.doc(`families/${familyId}/hospReservations/${reservationId}`);
  const resSnap = await resRef.get();
  if (!resSnap.exists) throw new HttpsError('not-found', 'Booking ikke funnet.');
  const reservation = resSnap.data() || {};
  const token = await loadNukiToken(db, familyId);
  if (token && reservation.lockAuthId && reservation.lockSmartlockId) {
    await nukiFetch(
      token,
      `/smartlock/${reservation.lockSmartlockId}/auth/${reservation.lockAuthId}`,
      { method: 'DELETE' },
    ).catch((err) => logger.warn('Nuki revoke failed', err));
  }
  await resRef.set({
    lockCode: null,
    lockAuthId: null,
    lockRevokedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { ok: true };
});

async function syncOneChannel(db, familyId, channelId) {
  const chRef = db.doc(`families/${familyId}/hospChannels/${channelId}`);
  const chSnap = await chRef.get();
  if (!chSnap.exists) throw new HttpsError('not-found', 'Kanal ikke funnet.');
  const channel = { id: chSnap.id, ...chSnap.data() };
  const icalUrl = String(channel.icalUrl || '').trim();
  if (!icalUrl) throw new HttpsError('failed-precondition', 'iCal-URL mangler for kanalen.');

  let current = assertSafeOutboundUrl(icalUrl, { allowHttp: true }).toString();
  let res = null;
  for (let hop = 0; hop < 3; hop += 1) {
    res = await fetch(current, {
      headers: { Accept: 'text/calendar, text/plain, */*' },
      redirect: 'manual',
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) break;
      const next = assertSafeOutboundUrl(new URL(loc, current).toString(), { allowHttp: true });
      if (isBlockedOutboundHost(next.hostname)) {
        throw new HttpsError('invalid-argument', 'iCal-URL peker til blokkert adresse.');
      }
      current = next.toString();
      continue;
    }
    break;
  }
  if (!res || !res.ok) {
    await chRef.set({
      lastError: `iCal henting feilet (${res?.status || 0})`,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    throw new HttpsError('unavailable', `Kunne ikke hente iCal (${res?.status || 0}).`);
  }
  const ics = await res.text();
  if (ics.length > 2_000_000) {
    throw new HttpsError('invalid-argument', 'iCal-filen er for stor.');
  }
  const events = parseIcalEvents(ics);
  const channelType = channel.type || detectChannelFromIcalUrl(icalUrl);

  const existingSnap = await db.collection(`families/${familyId}/hospReservations`)
    .where('sourceId', '==', channelId)
    .get();
  const existing = existingSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const upserts = mergeIcalReservations(existing, events, {
    channel: channelType,
    propertyId: channel.propertyId || null,
    sourceId: channelId,
  });

  let created = 0;
  let updated = 0;
  for (const item of upserts) {
    if (item.action === 'create') {
      await db.collection(`families/${familyId}/hospReservations`).add({
        ...item.data,
        propertyName: channel.label || channelType,
        guestEmail: '',
        guestPhone: '',
        guestCount: 1,
        notes: '',
        messagingCapable: false,
        source: 'ical',
        confirmedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      created += 1;
    } else if (item.action === 'update') {
      await db.doc(`families/${familyId}/hospReservations/${item.id}`).set({
        ...item.data,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      updated += 1;
    }
  }

  await chRef.set({
    connected: true,
    type: channelType,
    lastSyncAt: FieldValue.serverTimestamp(),
    lastError: null,
    lastEventCount: events.length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, created, updated, events: events.length };
}

/** Lim inn kalender-URL → auto-gjenkjenn kanal, lagre, synk (én operasjon). */
export const hospConnectIcal = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const icalUrl = String(request.data?.icalUrl || '').trim();
  const propertyId = String(request.data?.propertyId || '').trim() || null;
  await assertFamilyMember(db, familyId, uid);
  if (!icalUrl || !/^https?:\/\//i.test(icalUrl)) {
    throw new HttpsError('invalid-argument', 'Ugyldig kalender-URL. Lim inn full https://-adresse.');
  }
  const channelType = detectChannelFromIcalUrl(icalUrl);
  if (channelType === 'ical') {
    throw new HttpsError('invalid-argument', 'Gjenkjente ikke Airbnb/Booking.com. Sjekk at URL-en er riktig.');
  }
  const label = channelType === 'airbnb' ? 'Airbnb' : 'Booking.com';
  await db.doc(`families/${familyId}/hospChannels/${channelType}`).set({
    type: channelType,
    label,
    icalUrl,
    propertyId,
    connected: true,
    oauthConnected: false,
    messagingReady: false,
    calendarOnly: true,
    updatedBy: uid,
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  const result = await syncOneChannel(db, familyId, channelType);
  return {
    ok: true,
    channelType,
    label,
    messagingReady: false,
    note: 'iCal synker kun kalender. Logg inn med Sign in for å sende automeldinger inn til kanalen.',
    ...result,
  };
});

export const hospSyncChannelIcal = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  const channelId = String(request.data?.channelId || '');
  await assertFamilyMember(db, familyId, uid);
  return syncOneChannel(db, familyId, channelId);
});

export const hospSyncAllChannels = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  await assertRateLimit(getFirestore(), {
    key: hashRateKey(['hosp-sync', uid]),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const { syncOAuthChannel } = await import('./hospitalityOauth.js');
  const snap = await db.collection(`families/${familyId}/hospChannels`).get();
  const oauthSnap = await db.doc(`families/${familyId}/private/hospOAuth`).get().catch(() => null);
  const oauth = oauthSnap?.exists ? (oauthSnap.data() || {}) : {};
  const results = [];
  for (const d of snap.docs) {
    const data = d.data() || {};
    const channelType = data.type || d.id;
    try {
      const useOAuth = data.oauthConnected
        || (channelType === 'airbnb' && oauth.airbnb?.accessToken)
        || (channelType === 'booking' && (oauth.booking?.propertyId || data.partnerAccountId));
      if (useOAuth) {
        const r = await syncOAuthChannel(db, familyId, channelType);
        results.push({ channelId: d.id, ...r });
        continue;
      }
      if (!data.icalUrl) continue;
      const r = await syncOneChannel(db, familyId, d.id);
      results.push({ channelId: d.id, ...r });
    } catch (err) {
      results.push({ channelId: d.id, ok: false, error: err.message || String(err) });
    }
  }
  return { ok: true, results };
});

async function processFamilyAutomessages(db, familyId, mailApiKey = '') {
  const [tplSnap, resSnap, logSnap, propSnap] = await Promise.all([
    db.collection(`families/${familyId}/hospMessageTemplates`).get(),
    db.collection(`families/${familyId}/hospReservations`).get(),
    db.collection(`families/${familyId}/hospMessageLog`).get(),
    db.collection(`families/${familyId}/hospProperties`).get(),
  ]);
  const templates = tplSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const reservations = resSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const properties = Object.fromEntries(propSnap.docs.map((d) => [d.id, d.data()]));
  const alreadySentKeys = logSnap.docs.map((d) => d.data()?.dedupeKey).filter(Boolean);
  const now = new Date();
  const sent = [];

  const {
    getChannelMessagingCapability,
    sendAirbnbChannelMessage,
    sendBookingChannelMessage,
  } = await import('./hospitalityOauth.js');
  const capability = await getChannelMessagingCapability(db, familyId);

  for (const reservation of reservations) {
    const property = properties[reservation.propertyId] || {};
    const lock = {
      code: reservation.lockCode,
      allowedFromDate: reservation.lockAllowedFrom,
      allowedUntilDate: reservation.lockAllowedUntil,
    };
    const vars = buildMessageVars(reservation, property, lock);
    const channel = String(reservation.channel || 'manual');
    const isAirbnb = channel === 'airbnb';
    const isBooking = channel === 'booking';
    const messagingReady = (isAirbnb && capability.airbnb) || (isBooking && capability.booking);

    for (const template of templates) {
      if (!shouldSendMessage(template, reservation, { now, alreadySentKeys })) continue;

      const subject = renderTemplate(template.subject || 'Melding', vars);
      const body = renderTemplate(template.body || '', vars);
      const dedupeKey = messageDedupeKey(template, reservation);
      let delivery = { method: 'log_only', ok: true };

      // Channel bookings: MUST go through Airbnb/Booking inbox after Sign in.
      // iCal alone cannot deliver into platform messaging.
      if (isAirbnb || isBooking) {
        if (!messagingReady) {
          delivery = {
            method: 'blocked',
            ok: false,
            error: 'Sign in med Airbnb/Booking.com kreves for å sende automeldinger inn til kanalen. iCal synker kun kalender.',
          };
        } else {
          try {
            const result = isAirbnb
              ? await sendAirbnbChannelMessage(db, familyId, reservation, body)
              : await sendBookingChannelMessage(db, familyId, reservation, body);
            delivery = {
              method: result.method,
              ok: true,
              messageId: result.messageId || null,
              threadId: result.threadId || null,
            };
            if (result.threadId && !reservation.threadId) {
              await db.doc(`families/${familyId}/hospReservations/${reservation.id}`).set({
                threadId: result.threadId,
                updatedAt: FieldValue.serverTimestamp(),
              }, { merge: true });
            }
          } catch (err) {
            logger.warn('Channel automessage failed', {
              channel, familyId, reservationId: reservation.id, err: err?.message,
            });
            delivery = {
              method: channel,
              ok: false,
              error: err?.message || String(err),
            };
            // Optional email fallback only if channel send failed AND guest email known
            if (reservation.guestEmail && mailApiKey) {
              try {
                await sendMail(mailApiKey, {
                  to: reservation.guestEmail,
                  subject,
                  text: body,
                });
                delivery = {
                  ...delivery,
                  emailFallback: { ok: true, method: 'email' },
                };
              } catch (mailErr) {
                delivery = {
                  ...delivery,
                  emailFallback: { ok: false, error: mailErr?.message || String(mailErr) },
                };
              }
            }
          }
        }
      } else if (reservation.guestEmail && mailApiKey) {
        try {
          await sendMail(mailApiKey, {
            to: reservation.guestEmail,
            subject,
            text: body,
          });
          delivery = { method: 'email', ok: true };
        } catch (err) {
          logger.warn('Automessage email failed', { err: err?.message });
          delivery = { method: 'email', ok: false, error: err?.message || String(err) };
        }
      }

      await db.collection(`families/${familyId}/hospMessageLog`).add({
        reservationId: reservation.id,
        templateId: template.id,
        trigger: template.trigger,
        offsetHours: template.offsetHours || 0,
        dedupeKey,
        subject,
        body,
        channel,
        guestEmail: reservation.guestEmail || null,
        delivery,
        createdAt: FieldValue.serverTimestamp(),
      });
      alreadySentKeys.push(dedupeKey);
      sent.push({ reservationId: reservation.id, templateId: template.id, delivery });
    }
  }
  return { sent: sent.length, items: sent, messaging: { airbnb: capability.airbnb, booking: capability.booking } };
}

export const hospProcessAutomessages = onCall({
  region: 'europe-west1',
  cors: true,
}, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  return processFamilyAutomessages(db, familyId, mailApiKey());
});

export const hospGenerateReplyDraft = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const messageText = String(request.data?.messageText || '').trim();
  const tone = String(request.data?.tone || 'vennlig').trim();
  let reviewText = messageText;
  if (request.data?.reviewId) {
    const r = await db.doc(`families/${familyId}/hospReviews/${request.data.reviewId}`).get();
    if (r.exists) reviewText = r.data()?.text || reviewText;
  }
  const draft =
    `Tusen takk for tilbakemeldingen!\n\n` +
    `Vi setter stor pris på at du delte opplevelsen din` +
    `${reviewText ? ` («${reviewText.slice(0, 120)}${reviewText.length > 120 ? '…' : ''}»)` : ''}. ` +
    `Vi tar dette med oss videre for å gjøre oppholdet enda bedre for neste gjest.\n\n` +
    `Med ${tone} hilsen,\nVertskapet`;
  return { ok: true, draft };
});

export const hospLoginChecklist = onCall({ region: 'europe-west1', cors: true }, async (request) => {
  const uid = requireAuth(request.auth);
  const db = getFirestore();
  const familyId = String(request.data?.familyId || '');
  await assertFamilyMember(db, familyId, uid);
  const [channels, props] = await Promise.all([
    db.collection(`families/${familyId}/hospChannels`).get(),
    db.collection(`families/${familyId}/hospProperties`).get(),
  ]);
  const byType = {};
  channels.docs.forEach((d) => { byType[d.data()?.type || d.id] = { id: d.id, ...d.data() }; });
  const oauthSnap = await db.doc(`families/${familyId}/private/hospOAuth`).get().catch(() => null);
  const oauth = oauthSnap?.exists ? (oauthSnap.data() || {}) : {};
  const airbnbEnvOk = !!(String(process.env.AIRBNB_CLIENT_ID || '').trim()
    && String(process.env.AIRBNB_CLIENT_SECRET || '').trim());
  const bookingEnvOk = !!(String(process.env.BOOKING_CLIENT_ID || '').trim()
    && String(process.env.BOOKING_CLIENT_SECRET || '').trim());
  const airbnbFamilyOk = !!(oauth.airbnbClientId && oauth.airbnbClientSecret);
  const bookingFamilyOk = !!(oauth.bookingClientId && oauth.bookingClientSecret);
  const airbnbCreds = airbnbEnvOk || airbnbFamilyOk;
  const bookingCreds = bookingEnvOk || bookingFamilyOk;
  const airbnbClientId = airbnbEnvOk
    ? (process.env.AIRBNB_CLIENT_ID || process.env.EXPO_PUBLIC_AIRBNB_CLIENT_ID || null)
    : (airbnbFamilyOk ? String(oauth.airbnbClientId) : null);
  const airbnbOAuth = !!(byType.airbnb?.oauthConnected || byType.airbnb?.messagingReady || oauth.airbnb?.accessToken);
  const bookingOAuth = !!(byType.booking?.oauthConnected || byType.booking?.messagingReady || oauth.booking?.propertyId);
  const airbnbCalendar = !!(byType.airbnb?.icalUrl || byType.airbnb?.connected || airbnbOAuth);
  const bookingCalendar = !!(byType.booking?.icalUrl || byType.booking?.connected || bookingOAuth);
  const nukiConnected = await nukiTokenIsSet(db, familyId);
  return {
    ok: true,
    propertyCount: props.size,
    channels: {
      airbnb: {
        connected: airbnbOAuth,
        calendarConnected: airbnbCalendar,
        messagingReady: airbnbOAuth,
        configured: !!airbnbCreds,
        oauth: airbnbOAuth,
        clientId: airbnbClientId,
        accountName: oauth.airbnb?.accountName || null,
        lastSyncAt: byType.airbnb?.lastSyncAt || null,
        lastError: byType.airbnb?.lastError || null,
        mode: airbnbOAuth ? 'oauth' : (byType.airbnb?.icalUrl ? 'ical' : null),
      },
      booking: {
        connected: bookingOAuth,
        calendarConnected: bookingCalendar,
        messagingReady: bookingOAuth,
        configured: !!bookingCreds,
        oauth: bookingOAuth,
        propertyId: oauth.booking?.propertyId || byType.booking?.partnerAccountId || null,
        lastSyncAt: byType.booking?.lastSyncAt || null,
        lastError: byType.booking?.lastError || null,
        mode: bookingOAuth ? 'oauth' : (byType.booking?.icalUrl ? 'ical' : null),
      },
      nuki: { connected: nukiConnected },
    },
    items: [
      {
        id: 'airbnb',
        label: 'Airbnb (Sign in)',
        connected: airbnbOAuth,
        how: airbnbOAuth
          ? `Sign in OK${oauth.airbnb?.accountName ? ` — ${oauth.airbnb.accountName}` : ''}. Automeldinger går til Airbnb-innboks.`
          : 'Logg inn med Airbnb — påkrevd for automeldinger inn til Airbnb.',
        partnerApiReady: !!airbnbCreds,
        messagingReady: airbnbOAuth,
      },
      {
        id: 'booking',
        label: 'Booking.com (Sign in)',
        connected: bookingOAuth,
        how: bookingOAuth
          ? `Sign in OK (Property ID ${oauth.booking?.propertyId || byType.booking?.partnerAccountId || ''}). Automeldinger går til Booking-innboks.`
          : 'Logg inn / koble Property ID — påkrevd for automeldinger inn til Booking.com.',
        partnerApiReady: !!bookingCreds,
        messagingReady: bookingOAuth,
      },
      {
        id: 'nuki',
        label: 'Nuki smartlås',
        connected: nukiConnected,
        how: 'Nuki Web → Meny → API → Generer API-token, lim inn i Utleie-modulen.',
        partnerApiReady: true,
        partnerApiNote: 'Token lagres under users/{uid}/private (ikke lesbart fra klient).',
      },
      {
        id: 'property',
        label: 'Minst én bolig',
        connected: props.size > 0,
        how: 'Opprett under Boliger.',
        partnerApiReady: true,
      },
    ],
  };
});

/** Poll all families with hospitality channels every 15 minutes. */
export const hospScheduledSync = onSchedule({
  region: 'europe-west1',
  schedule: 'every 15 minutes',
  timeoutSeconds: 540,
}, async () => {
  const db = getFirestore();
  const mailKey = mailApiKey();
  // Discover families that have at least one hospChannels doc via collection group
  let channelSnap;
  try {
    channelSnap = await db.collectionGroup('hospChannels').get();
  } catch (err) {
    logger.warn('hospChannels collection group failed – ensure index exists', err);
    return;
  }
  const familyIds = new Set();
  channelSnap.docs.forEach((d) => {
    const parts = d.ref.path.split('/');
    // families/{id}/hospChannels/{cid}
    if (parts[0] === 'families' && parts[2] === 'hospChannels') familyIds.add(parts[1]);
  });

  for (const familyId of familyIds) {
    try {
      const { syncOAuthChannel } = await import('./hospitalityOauth.js');
      const oauthSnap = await db.doc(`families/${familyId}/private/hospOAuth`).get().catch(() => null);
      const oauth = oauthSnap?.exists ? (oauthSnap.data() || {}) : {};
      const snap = await db.collection(`families/${familyId}/hospChannels`).get();
      for (const d of snap.docs) {
        const data = d.data() || {};
        const channelType = data.type || d.id;
        const useOAuth = data.oauthConnected
          || (channelType === 'airbnb' && oauth.airbnb?.accessToken)
          || (channelType === 'booking' && (oauth.booking?.propertyId || data.partnerAccountId));
        if (useOAuth) {
          await syncOAuthChannel(db, familyId, channelType).catch((err) => {
            logger.warn('Scheduled OAuth sync failed', { familyId, channelId: d.id, err: err?.message });
          });
          continue;
        }
        if (!data.icalUrl) continue;
        await syncOneChannel(db, familyId, d.id).catch((err) => {
          logger.warn('Scheduled ical sync failed', { familyId, channelId: d.id, err: err?.message });
        });
      }
      await processFamilyAutomessages(db, familyId, mailKey).catch((err) => {
        logger.warn('Scheduled automessage failed', { familyId, err: err?.message });
      });
    } catch (err) {
      logger.warn('Scheduled hospitality tick failed', { familyId, err: err?.message });
    }
  }
});
