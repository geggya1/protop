/**
 * Opprett bedrift: finnes organisasjonsnummeret fra før, kan personen be om å bli med.
 * Andres bedrifter kan ikke leses eller skrives fra klienten, så oppslag og
 * forespørsel går her. Administrator inviterer, og personen må godta invitasjonen.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { buildJoinRequest } from '../src/project/companyRegistry.js';
import { companyOrgnr, orgnrIndexDecision, orgnrIndexRecord } from '../src/project/orgnrIndex.js';
import { isConfirmedMember } from '../src/utils/groupInviteLogic.js';
import { isOrganizationType } from '../src/utils/groupTypes.js';
import { companyRecipients } from '../src/notifications/audience.js';
import {
  assertRateLimit, hashRateKey, isFamilyOwnerOrAdmin, requireAuth,
} from './security.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value) {
  return String(value ?? '').trim();
}

function digits(value) {
  return text(value).replace(/\D/g, '');
}

function live(data) {
  return !!data && data.deleted !== true && data.hiddenFromApp !== true;
}

function label(data) {
  return text(data?.company?.navn || data?.name) || 'Bedriften';
}

function candidate(snap) {
  return snap?.exists ? { id: snap.id, data: snap.data() || {}, createTime: snap.createTime || null } : null;
}

/**
 * Bedriften som eier orgnummeret, avgjort i én transaksjon mot orgnrIndex/{orgnr}
 * (se src/project/orgnrIndex.js). Første oppslag etter oppretting eller endring
 * skriver indeksen; deretter vinner den samme bedriften til den slettes eller bytter orgnr.
 */
export async function resolveOrgnrOwner(store, orgnr, { source = 'lookup', uid = '' } = {}) {
  const indexRef = store.doc(`orgnrIndex/${orgnr}`);
  return store.runTransaction(async (tx) => {
    const indexSnap = await tx.get(indexRef);
    const index = indexSnap.exists ? indexSnap.data() || {} : null;
    const indexed = index?.familyId ? candidate(await tx.get(store.doc(`families/${index.familyId}`))) : null;
    let decision = orgnrIndexDecision({ orgnr, index, indexed, candidates: indexed ? [indexed] : [] });
    if (decision.write || !decision.owner) {
      // Eldre bedrifter kan mangle toppfeltet orgnr; da står det bare i selskapsprofilen.
      const [byTop, byProfile] = await Promise.all([
        tx.get(store.collection('families').where('orgnr', '==', orgnr).limit(20)),
        tx.get(store.collection('families').where('company.organisasjonsnummer', '==', orgnr).limit(20)),
      ]);
      const candidates = [...byTop.docs, ...byProfile.docs].map(candidate);
      decision = orgnrIndexDecision({ orgnr, index, indexed, candidates });
    }
    if (decision.write === 'set') {
      tx.set(indexRef, {
        ...orgnrIndexRecord({ orgnr, familyId: decision.owner.id, source, claimedBy: uid }),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (decision.write === 'delete') {
      tx.delete(indexRef);
    }
    return decision.owner;
  });
}

/** Finnes bedriften i ProTop? Svarer bare med id og navn. */
export const findCompanyByOrgnr = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const orgnr = digits(req.data?.orgnr);
  if (orgnr.length !== 9) return { ok: true, company: null };
  await assertRateLimit(db, {
    key: hashRateKey(['company-orgnr', uid]),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  const row = await resolveOrgnrOwner(db, orgnr, { uid });
  if (!row) return { ok: true, company: null };
  const data = row.data || {};
  return {
    ok: true,
    company: { id: row.id, name: label(data), member: isConfirmedMember(data, uid) },
  };
});

/**
 * Ny bedrift (eller nytt orgnr i selskapsinnstillingene): knytt orgnummeret til bedriften
 * hvis ingen annen levende bedrift har det fra før. Bare eier eller administrator.
 * Svar: { ok, claimed } eller { ok, claimed: false, taken: { id, name } } når en annen
 * bedrift allerede eier orgnummeret (da finner «Be om å bli med» den andre).
 */
export const claimCompanyOrgnr = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const familyId = text(req.data?.familyId);
  if (!familyId || familyId.includes('/')) return { ok: false, error: 'not-found' };
  await assertRateLimit(db, {
    key: hashRateKey(['company-orgnr-claim', uid]),
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  const snap = await db.doc(`families/${familyId}`).get();
  const family = snap.exists ? snap.data() || {} : null;
  if (!live(family)) return { ok: false, error: 'not-found' };
  if (!isFamilyOwnerOrAdmin(family, uid)) return { ok: false, error: 'forbidden' };
  if (!isOrganizationType(family.type)) return { ok: false, error: 'not-company' };
  const orgnr = companyOrgnr(family);
  if (!orgnr) return { ok: true, claimed: false, orgnr: '' };
  const owner = await resolveOrgnrOwner(db, orgnr, { source: 'claim', uid });
  if (owner?.id === familyId) return { ok: true, claimed: true, orgnr };
  if (owner?.id) {
    logger.warn('orgnr already owned', { orgnr, familyId, owner: owner.id });
    return { ok: true, claimed: false, orgnr, taken: { id: owner.id, name: label(owner.data) } };
  }
  return { ok: true, claimed: false, orgnr };
});

/**
 * Be om å bli med. Varselet går til dem som kan invitere: eier, administratorer og de
 * som har Admin på Ansatte i tilgangsstyringen (Øverste leder og Administrator som standard).
 */
export const requestCompanyJoin = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const companyId = text(req.data?.companyId);
  if (!companyId) return { ok: false, error: 'not-found' };
  await assertRateLimit(db, {
    key: hashRateKey(['company-join', uid]),
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  const snap = await db.doc(`families/${companyId}`).get();
  const company = snap.exists ? snap.data() || {} : null;
  if (!live(company)) return { ok: false, error: 'not-found' };
  if (isConfirmedMember(company, uid)) return { ok: false, error: 'already-member' };

  const email = text(req.auth?.token?.email).toLowerCase();
  const name = text(req.data?.name) || text(req.auth?.token?.name);
  const at = new Date().toISOString();
  const ref = db.doc(`families/${companyId}/joinRequests/${uid}`);
  const existing = await ref.get();
  if (existing.exists && existing.data()?.status === 'pending') {
    return { ok: true, already: true, companyName: label(company), createdAt: existing.data()?.createdAt || at };
  }
  await ref.set({
    ...buildJoinRequest({ uid, name, email, at }),
    kind: 'member',
    source: 'orgnr',
    parentUid: uid,
    parentName: name,
    parentEmail: email,
    updatedAt: at,
  });

  const employees = (await db.collection(`families/${companyId}/employees`).get())
    .docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  const recipients = companyRecipients({ family: company, employees, type: 'companyJoinRequest', exclude: [uid] });
  const who = [name, email && `(${email})`].filter(Boolean).join(' ') || 'En bruker';
  await Promise.all(recipients.map((recipient) => db.collection(`users/${recipient}/notifications`).add({
    eventType: 'companyJoinRequest',
    title: 'Forespørsel om å bli med',
    body: `${who} ber om å bli med i «${label(company)}». Inviter personen under Ansatte → Inviter brukere.`,
    familyId: companyId,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    seen: false,
  }).catch((error) => {
    logger.warn('join request notification failed', { message: error?.message });
  })));
  return { ok: true, companyName: label(company), createdAt: at };
});
