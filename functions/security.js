/**
 * Shared security helpers for Cloud Functions.
 * Rate limits, URL allowlists, SSRF guards, auth helpers.
 */
import { createHash } from 'node:crypto';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';

const WEEKPLAN_URL_HOSTS = new Set([
  'protop.no',
  'www.protop.no',
  'protop-c189c.web.app',
  'protop-c189c.firebaseapp.com',
  'localhost',
  '127.0.0.1',
]);

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.google.internal.',
]);

/** @param {import('firebase-functions/v2/https').CallableRequest['auth']} auth */
export function requireAuth(auth) {
  if (!auth?.uid) throw new HttpsError('unauthenticated', 'Du må være innlogget.');
  return auth.uid;
}

export function isValidEmail(email) {
  return typeof email === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
}

export function redactEmail(email) {
  const s = String(email || '').trim().toLowerCase();
  const at = s.indexOf('@');
  if (at < 1) return '[redacted]';
  const user = s.slice(0, at);
  const domain = s.slice(at + 1);
  const hint = user.length <= 2 ? '*' : `${user[0]}***${user[user.length - 1]}`;
  return `${hint}@${domain}`;
}

export function hashRateKey(parts) {
  return createHash('sha256').update(parts.filter(Boolean).join('|')).digest('hex').slice(0, 40);
}

/**
 * Sliding daily / hourly buckets in Firestore (Admin SDK).
 * @returns {{ allowed: boolean, count: number, limit: number }}
 */
export async function assertRateLimit(db, {
  key,
  limit,
  windowMs = 60 * 60 * 1000,
  collection = 'rateLimits',
}) {
  if (!key || !limit) return { allowed: true, count: 0, limit };
  const bucket = Math.floor(Date.now() / windowMs);
  const id = `${key}_${bucket}`;
  const ref = db.doc(`${collection}/${id}`);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
    if (count >= limit) {
      return { allowed: false, count, limit };
    }
    tx.set(ref, {
      count: FieldValue.increment(1),
      key,
      bucket,
      windowMs,
      updatedAt: FieldValue.serverTimestamp(),
      expireAt: new Date(Date.now() + windowMs * 2),
    }, { merge: true });
    return { allowed: true, count: count + 1, limit };
  });
  if (!result.allowed) {
    const per = windowMs >= 24 * 60 * 60 * 1000
      ? `${limit} per dag`
      : windowMs >= 60 * 60 * 1000
        ? `${limit} per time`
        : `${limit} per vindu`;
    throw new HttpsError(
      'resource-exhausted',
      `For mange forespørsler. Prøv igjen senere (${per}).`,
    );
  }
  return result;
}

/**
 * Enforce both hourly and daily caps for expensive Google/Firebase/Graph callables.
 * Daily window uses Europe/Oslo calendar day when possible.
 */
export async function assertRateLimits(db, {
  key,
  hourlyLimit,
  dailyLimit,
  collection = 'rateLimits',
}) {
  if (hourlyLimit) {
    await assertRateLimit(db, {
      key: `${key}:h`,
      limit: hourlyLimit,
      windowMs: 60 * 60 * 1000,
      collection,
    });
  }
  if (dailyLimit) {
    await assertRateLimit(db, {
      key: `${key}:d`,
      limit: dailyLimit,
      windowMs: 24 * 60 * 60 * 1000,
      collection,
    });
  }
  return { allowed: true };
}

/** True if hostname resolves to a clearly private / link-local / metadata target. */
export function isBlockedOutboundHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (host === 'metadata' || host.endsWith('.internal')) return true;
  if (host === '0.0.0.0' || host === '::1' || host === '[::1]') return true;

  // IPv4 literals
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const octets = m.slice(1).map((n) => Number(n));
    if (octets.some((n) => n > 255)) return true;
    const [a, b] = octets;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true;
  }

  // IPv6 literals (coarse)
  if (host.includes(':')) {
    if (host === '::' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80')) {
      return true;
    }
  }
  return false;
}

/**
 * Validate user-supplied outbound URL (ICS / iCal). HTTPS only, no private hosts.
 * @returns {URL}
 */
export function assertSafeOutboundUrl(raw, { allowHttp = false } = {}) {
  let parsed;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    throw new HttpsError('invalid-argument', 'Ugyldig URL.');
  }
  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'https:') {
    // ok
  } else if (allowHttp && protocol === 'http:') {
    // hospitality legacy feeds sometimes use http — still block private hosts
  } else {
    throw new HttpsError('invalid-argument', 'URL må bruke https://');
  }
  if (parsed.username || parsed.password) {
    throw new HttpsError('invalid-argument', 'URL med innloggingsinfo er ikke tillatt.');
  }
  if (isBlockedOutboundHost(parsed.hostname)) {
    throw new HttpsError('invalid-argument', 'URL peker til en blokkert adresse.');
  }
  return parsed;
}

/** continueUrl / registerUrl for mail — only Weekplan (and local) hosts. */
export function assertSafeAppContinueUrl(raw, fallback) {
  const fb = fallback || 'https://www.protop.no/';
  if (typeof raw !== 'string' || !raw.trim()) return fb;
  let parsed;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return fb;
  }
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && WEEKPLAN_URL_HOSTS.has(parsed.hostname))) {
    return fb;
  }
  const host = parsed.hostname.toLowerCase();
  if (!WEEKPLAN_URL_HOSTS.has(host)) return fb;
  return parsed.toString();
}

/** True when a families/{id}/parents|children doc should grant live access. */
export function memberDocGrantsAccess(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.deleted === true) return false;
  if (data.leftAt != null) return false;
  if (data.active === false) {
    return data.inviteStatus === 'pending';
  }
  return true;
}

export async function assertFamilyMember(db, familyId, uid) {
  if (!familyId) throw new HttpsError('invalid-argument', 'familyId mangler.');
  if (!uid) throw new HttpsError('unauthenticated', 'Du må være innlogget.');
  const fam = await db.doc(`families/${familyId}`).get();
  if (!fam.exists) throw new HttpsError('not-found', 'Familie ikke funnet.');
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  const isOwnerOrAdmin =
    data.ownerUid === uid
    || data.ownerId === uid
    || data.createdBy === uid
    || data.adminUid === uid
    || adminUids.includes(uid);

  let revokedParentOrChild = false;

  const parent = await db.doc(`families/${familyId}/parents/${uid}`).get();
  if (parent.exists) {
    if (memberDocGrantsAccess(parent.data())) return fam;
    revokedParentOrChild = true;
  } else {
    const parentsSnap = await db.collection(`families/${familyId}/parents`).where('uid', '==', uid).limit(1).get();
    if (!parentsSnap.empty) {
      if (memberDocGrantsAccess(parentsSnap.docs[0].data())) return fam;
      revokedParentOrChild = true;
    }
  }

  const child = await db.doc(`families/${familyId}/children/${uid}`).get();
  if (child.exists) {
    if (memberDocGrantsAccess(child.data())) return fam;
    revokedParentOrChild = true;
  }

  // Soft-deleted / deactivated membership docs win over stale members[] indexes,
  // except for the family owner/admin who must still be able to recover the family.
  if (revokedParentOrChild && !isOwnerOrAdmin) {
    throw new HttpsError('permission-denied', 'Ingen tilgang til denne familien.');
  }

  if (isOwnerOrAdmin) return fam;

  const top = await db.doc(`parents/${uid}`).get();
  if (top.exists && top.data()?.familyId === familyId && top.data()?.active !== false && top.data()?.deleted !== true) {
    return fam;
  }
  const members = data.memberIds || data.members || [];
  if (Array.isArray(members) && members.includes(uid)) return fam;
  if (members && typeof members === 'object' && !Array.isArray(members) && members[uid]) return fam;
  throw new HttpsError('permission-denied', 'Ingen tilgang til denne familien.');
}

export async function assertFamilyAdmin(db, familyId, uid) {
  const fam = await assertFamilyMember(db, familyId, uid);
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  const ok =
    data.ownerUid === uid
    || data.ownerId === uid
    || data.createdBy === uid
    || adminUids.includes(uid);
  if (!ok) {
    const parent = await db.doc(`families/${familyId}/parents/${uid}`).get();
    if (parent.exists && parent.data()?.admin === true) return fam;
    throw new HttpsError('permission-denied', 'Bare admin kan gjøre dette.');
  }
  return fam;
}
