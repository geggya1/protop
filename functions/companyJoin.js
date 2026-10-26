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
import { isConfirmedMember } from '../src/utils/groupInviteLogic.js';
import { companyRecipients } from '../src/notifications/audience.js';
import { assertRateLimit, hashRateKey, requireAuth } from './security.js';

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
  const snap = await db.collection('families').where('orgnr', '==', orgnr).limit(5).get();
  const row = snap.docs.find((doc) => live(doc.data()));
  if (!row) return { ok: true, company: null };
  const data = row.data() || {};
  return {
    ok: true,
    company: { id: row.id, name: label(data), member: isConfirmedMember(data, uid) },
  };
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
