/**
 * Friend profile lookup — no Secret Manager (safe for GitHub deploy SA).
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  requireAuth,
  isValidEmail,
  hashRateKey,
  assertRateLimits,
} from './security.js';
import { LOOKUP_LIMITS, lookupProfileFields, lookupRateScopes } from './friendLookupLogic.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

function phoneLookupCandidates(raw) {
  const s = String(raw || '').trim();
  if (!s) return [];
  const digits = s.replace(/[^\d+]/g, '');
  const out = new Set([s, digits]);
  if (digits.startsWith('+')) out.add(digits.slice(1));
  if (/^47\d{8}$/.test(digits.replace(/\D/g, ''))) {
    out.add(`+${digits.replace(/\D/g, '')}`);
  }
  if (/^\d{8}$/.test(digits.replace(/\D/g, ''))) {
    out.add(`+47${digits.replace(/\D/g, '')}`);
  }
  return [...out].filter(Boolean);
}

/**
 * Slå opp en ProTop-bruker (voksen eller barn) for en venneforespørsel.
 * Grense per bruker, lavere for e-post/telefon. Svaret har bare uid
 * (og navn/brukernavn ved oppslag på @brukernavn), aldri e-post eller telefon.
 */
export const lookupFriendProfile = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 20,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const caller = requireAuth(req.auth);
      const identifier = String(req.data?.identifier || '').trim().slice(0, 200);
      if (!identifier) return { ok: true, profile: null };

      const looksLikeEmail = identifier.includes('@') && isValidEmail(identifier);
      const phoneCandidates = phoneLookupCandidates(identifier);
      const looksLikePhone = !looksLikeEmail && !identifier.includes('@') && phoneCandidates.length > 0
        && /^\+?[\d\s().-]+$/.test(identifier);
      const kind = looksLikeEmail ? 'email' : (looksLikePhone ? 'phone' : 'username');
      for (const scope of lookupRateScopes(kind)) {
        await assertRateLimits(db, {
          key: hashRateKey(['lookup-friend', scope, caller]),
          ...LOOKUP_LIMITS[scope],
        });
      }
      const publicFriendProfile = (uid, data = {}) => lookupProfileFields(uid, data, kind);

      if (looksLikeEmail) {
        const email = identifier.toLowerCase();
        const usersSnap = await db.collection('users').where('email', '==', email).limit(3).get();
        for (const d of usersSnap.docs) {
          return { ok: true, profile: publicFriendProfile(d.id, d.data() || {}) };
        }
        const parentsSnap = await db.collection('parents').where('email', '==', email).limit(5).get();
        for (const d of parentsSnap.docs) {
          const data = d.data() || {};
          if (data.placeholder === true && !data.uid) continue;
          const uid = data.uid || (String(d.id).length >= 20 ? d.id : null);
          if (!uid) continue;
          return { ok: true, profile: publicFriendProfile(uid, data) };
        }
        const childrenSnap = await db.collection('children').where('email', '==', email).limit(5).get();
        for (const d of childrenSnap.docs) {
          const data = d.data() || {};
          const uid = data.uid || d.id;
          if (!uid) continue;
          return { ok: true, profile: publicFriendProfile(uid, { ...data, role: 'child' }) };
        }
        return { ok: true, profile: null };
      }

      if (looksLikePhone) {
        for (const candidate of phoneCandidates) {
          const usersSnap = await db.collection('users').where('phone', '==', candidate).limit(3).get();
          for (const d of usersSnap.docs) {
            return { ok: true, profile: publicFriendProfile(d.id, d.data() || {}) };
          }
          const parentsSnap = await db.collection('parents').where('phone', '==', candidate).limit(5).get();
          for (const d of parentsSnap.docs) {
            const data = d.data() || {};
            if (data.placeholder === true && !data.uid) continue;
            const uid = data.uid || (String(d.id).length >= 20 ? d.id : null);
            if (!uid) continue;
            return { ok: true, profile: publicFriendProfile(uid, data) };
          }
          const childrenSnap = await db.collection('children').where('phone', '==', candidate).limit(5).get();
          for (const d of childrenSnap.docs) {
            const data = d.data() || {};
            const uid = data.uid || d.id;
            if (!uid) continue;
            return { ok: true, profile: publicFriendProfile(uid, { ...data, role: 'child' }) };
          }
        }
        return { ok: true, profile: null };
      }

      const u = identifier.toLowerCase().replace(/^@/, '');
      if (u.length < 3) return { ok: true, profile: null };
      const unameSnap = await db.doc(`usernames/${u}`).get();
      if (!unameSnap.exists) return { ok: true, profile: null };
      const data = unameSnap.data() || {};
      const uid = data.uid;
      if (!uid) return { ok: true, profile: null };
      const [userSnap, parentSnap, childSnap] = await Promise.all([
        db.doc(`users/${uid}`).get(),
        db.doc(`parents/${uid}`).get(),
        db.doc(`children/${uid}`).get(),
      ]);
      const userData = userSnap.exists ? userSnap.data() : {};
      const parentData = parentSnap.exists ? parentSnap.data() : {};
      const childData = childSnap.exists ? childSnap.data() : {};
      return {
        ok: true,
        profile: publicFriendProfile(uid, {
          username: userData.username || parentData.username || childData.username || u,
          name: userData.displayName || userData.name || parentData.name || childData.name || u,
        }),
      };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message, profile: null };
      }
      logger.error('❌ [lookupFriendProfile]', { message: error?.message });
      return { ok: false, error: error?.message || 'Oppslag feilet', profile: null };
    }
  },
);
