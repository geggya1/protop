/**
 * Varsler og motpartsbehandling for en avtale.
 * Avsender lagrer saken i anbud-tilstanden. Motpartens usendte merknader
 * ligger bare på agreementShares til de sendes i retur.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { sendMail, friendlyMailError } from './mail.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { requireAuth, isValidEmail, redactEmail, hashRateKey, assertRateLimit, assertFamilyMember } from './security.js';
import { buildAgreementNotice } from '../src/anbud/agreementNotice.js';
import {
  applyAgreementOp,
  composeCounterpartyCase,
  publicAgreementView,
  splitCounterpartyPrivacy,
} from '../src/anbud/agreementCase.js';

if (!getApps().length) initializeApp();

function text(value, max = 400) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function shareRef(db, token) {
  return db.doc(`agreementShares/${token}`);
}

function stateRef(db, companyId) {
  return db.doc(`families/${companyId}/anbud/state`);
}

async function writeNotice(db, uid, { title, body, companyId }) {
  if (!uid) return;
  const id = `avtale_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  await db.doc(`users/${uid}/notifications/${id}`).set({
    eventType: 'messageReceived',
    title: text(title, 120) || 'Avtale',
    body: text(body, 400),
    familyId: companyId || null,
    createdAt: FieldValue.serverTimestamp(),
    seen: false,
  });
}

async function mailParty(db, { to, name, title, detail, actorName, link, companyName, rateKey }) {
  if (!isValidEmail(to)) return { mailed: false };
  const apiKey = await resolveMailApiKey();
  if (!apiKey) return { mailed: false, error: 'E-post er ikke konfigurert.' };
  await assertRateLimit(db, { key: rateKey, limit: 30, windowMs: 60 * 60 * 1000 });
  const message = buildAgreementNotice({ title, detail, actorName, link, companyName });
  await sendMail(apiKey, { to, name, subject: message.subject, text: message.text, html: message.html });
  logger.info('avtalevarsel sendt', { to: redactEmail(to) });
  return { mailed: true };
}

function linkFor(token) {
  const safe = text(token, 80);
  return safe ? `https://protop.no/?avtale=${encodeURIComponent(safe)}` : 'https://protop.no/';
}

export const agreementTreatment = onCall(
  {
    region: 'europe-west1',
    cors: true,
    invoker: 'public',
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request) => {
    const db = getFirestore();
    const action = text(request.data?.action, 20);
    try {
      if (action === 'notify') {
        const uid = requireAuth(request.auth);
        const companyId = text(request.data?.companyId, 80);
        await assertFamilyMember(db, companyId, uid);
        const email = text(request.data?.email, 120).toLowerCase();
        const token = text(request.data?.token, 80);
        const detail = text(request.data?.detail, 400);
        const title = text(request.data?.title, 160);
        await assertRateLimit(db, {
          key: hashRateKey(['agreement-notify', uid]),
          limit: 40,
          windowMs: 60 * 60 * 1000,
        });
        const mailed = await mailParty(db, {
          to: email,
          name: text(request.data?.name, 120),
          title,
          detail,
          actorName: text(request.data?.actorName, 120),
          link: linkFor(token),
          companyName: text(request.data?.companyName, 160),
          rateKey: hashRateKey(['agreement-mail', companyId || uid]),
        });
        const uids = (Array.isArray(request.data?.notifyUids) ? request.data.notifyUids : [])
          .map((id) => text(id, 80))
          .filter((id) => id && id !== uid)
          .slice(0, 10);
        for (const target of uids) {
          await writeNotice(db, target, { title: `Avtale: ${title}`, body: detail, companyId });
        }
        return { ok: true, ...mailed };
      }

      if (action === 'load' || action === 'act') {
        const token = text(request.data?.token, 80);
        if (!token || token.length < 16) throw new HttpsError('invalid-argument', 'Lenken er ugyldig.');
        await assertRateLimit(db, {
          key: hashRateKey(['agreement-share', token]),
          limit: 80,
          windowMs: 60 * 60 * 1000,
        });
        const shareSnap = await shareRef(db, token).get();
        if (!shareSnap.exists) throw new HttpsError('not-found', 'Avtalelenken finnes ikke.');
        const share = shareSnap.data() || {};
        const companyId = text(share.companyId, 80);
        const caseId = text(share.caseId, 48);
        const ref = stateRef(db, companyId);
        if (action === 'load') {
          const snap = await ref.get();
          const found = (snap.data()?.state?.agreementCases || []).find((row) => row.id === caseId);
          if (!found) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
          if (found.status === 'utkast') throw new HttpsError('failed-precondition', 'Avtalen er ikke sendt ennå.');
          const composed = composeCounterpartyCase(found, share.pending || {});
          return { ok: true, row: publicAgreementView(composed, 'motpart'), companyName: text(share.companyName, 160) };
        }

        const op = text(request.data?.op, 40);
        const allowed = new Set(['setField', 'addNote', 'editNote', 'deleteNote', 'return', 'sign']);
        if (!allowed.has(op)) throw new HttpsError('invalid-argument', 'Handlingen er ikke tilgjengelig for motparten.');
        let mailed = { mailed: false };
        const written = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const shareLive = await tx.get(shareRef(db, token));
          const current = snap.data()?.state || {};
          const found = (current.agreementCases || []).find((row) => row.id === caseId);
          if (!found) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
          const composed = composeCounterpartyCase(found, shareLive.data()?.pending || {});
          const result = applyAgreementOp(
            { ...current, agreementCases: (current.agreementCases || []).map((row) => (row.id === caseId ? composed : row)) },
            {
              op,
              caseId,
              party: 'motpart',
              fieldId: request.data?.fieldId,
              noteId: request.data?.noteId,
              value: request.data?.value,
              body: request.data?.body,
              kind: request.data?.kind,
              method: request.data?.method,
              actorName: text(request.data?.actorName, 120) || 'Motpart',
              actorUid: request.auth?.uid || '',
            },
          );
          if (!result.ok) throw new HttpsError('failed-precondition', result.error);
          const { stored, pending } = splitCounterpartyPrivacy(result.row);
          const agreementCases = (result.state.agreementCases || []).map((row) => (row.id === caseId ? stored : row));
          tx.set(ref, {
            state: { ...current, agreementCases },
            updatedAt: FieldValue.serverTimestamp(),
          }, { merge: true });
          tx.set(shareRef(db, token), { pending, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
          return stored;
        });
        if (op === 'return' || op === 'sign') {
          mailed = await mailParty(db, {
            to: written?.sender?.email,
            name: written?.sender?.personName,
            title: written?.title,
            detail: op === 'return' ? 'Motparten har sendt merknader i retur.' : 'Motparten har signert avtalen.',
            actorName: text(request.data?.actorName, 120),
            link: 'https://protop.no/',
            companyName: written?.sender?.name,
            rateKey: hashRateKey(['agreement-mail', companyId]),
          }).catch((error) => ({ mailed: false, error: friendlyMailError(error) }));
          for (const target of written?.notifyUids || []) {
            await writeNotice(db, target, {
              title: `Avtale: ${written?.title || ''}`,
              body: op === 'return' ? 'Merknader er kommet i retur.' : 'Motparten har signert.',
              companyId,
            }).catch(() => {});
          }
        }
        return { ok: true, row: publicAgreementView(composeCounterpartyCase(written, (await shareRef(db, token).get()).data()?.pending || {}), 'motpart'), ...mailed };
      }

      if (action === 'publishShare') {
        const uid = requireAuth(request.auth);
        const companyId = text(request.data?.companyId, 80);
        const caseId = text(request.data?.caseId, 48);
        await assertFamilyMember(db, companyId, uid);
        const ref = stateRef(db, companyId);
        const snap = await ref.get();
        const found = (snap.data()?.state?.agreementCases || []).find((row) => row.id === caseId);
        if (!found?.shareToken) throw new HttpsError('not-found', 'Avtalen finnes ikke.');
        if (found.status === 'utkast') throw new HttpsError('failed-precondition', 'Send avtalen før lenken deles.');
        await shareRef(db, found.shareToken).set({
          companyId,
          caseId,
          email: text(found.counterparty?.email, 120).toLowerCase(),
          companyName: text(found.sender?.name, 160),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
        return { ok: true, token: found.shareToken, link: linkFor(found.shareToken) };
      }

      throw new HttpsError('invalid-argument', 'Ukjent avtalehandling.');
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message };
      logger.error('agreementTreatment feilet', { message: error?.message });
      return { ok: false, error: friendlyMailError(error) };
    }
  },
);
