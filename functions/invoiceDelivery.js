/**
 * Utsending av ferdigstilte fakturaer: e-post med PDF og vedlegg, og EHF via aksesspunkt.
 *
 * Bare medlemmer av bedriften kan sende, og bare fakturaer som er ferdigstilt
 * (har nummer). PDF og vedlegg hentes fra bedriftens egen mappe i Storage, så
 * appen ikke kan legge ved filer fra andre bedrifter.
 * Leveransen registreres på fakturaen av appen, med svaret herfra.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { assertFamilyMember, assertRateLimit, hashRateKey, isValidEmail } from './security.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { friendlyMailError, normalizeFileAttachment, sendMail } from './mail.js';
import { mediaBucket } from './storageBucket.js';
import { allowedPath, storagePathFromUrl } from './invoiceFiles.js';
import {
  PeppolError,
  PeppolNotConfigured,
  deliverEhf,
  lookupReceiver,
  peppolConfig,
} from './peppolProvider.js';

if (!getApps().length) initializeApp();

const CALL = {
  region: 'europe-west1',
  cors: true,
  invoker: 'public',
  timeoutSeconds: 60,
  memory: '512MiB',
};

/** Samlet størrelse på vedleggene. E-postleverandørene stopper rundt 10 MB. */
const MAX_TOTAL_BYTES = 9 * 1024 * 1024;

function requireUid(request) {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Du må være innlogget.');
  return uid;
}

function familyIdFrom(data) {
  const familyId = String(data?.familyId || '').trim();
  if (!familyId || familyId.includes('/')) throw new HttpsError('invalid-argument', 'Bedrift mangler.');
  return familyId;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function limit(db, uid, name, max) {
  try {
    await assertRateLimit(db, { key: hashRateKey(['invoice', name, uid]), limit: max, windowMs: 60 * 60 * 1000 });
  } catch (err) {
    if (err instanceof HttpsError && err.code === 'resource-exhausted') throw err;
    logger.warn('Invoice rate limit skipped', { message: err?.message });
  }
}

async function issuedInvoice(db, familyId, invoiceId) {
  const id = String(invoiceId || '').trim();
  if (!id || id.includes('/')) throw new HttpsError('invalid-argument', 'Faktura mangler.');
  const snap = await db.doc(`families/${familyId}/invoices/${id}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'Fant ikke fakturaen.');
  const data = snap.data() || {};
  if (!String(data.invoiceNumber || '').trim() || data.status === 'draft') {
    throw new HttpsError('failed-precondition', 'Fakturaen må ferdigstilles før den sendes.');
  }
  return { id: snap.id, ...data };
}

async function readFile(file, familyId) {
  const path = String(file?.storagePath || '').trim() || storagePathFromUrl(file?.url);
  if (!allowedPath(path, familyId)) {
    throw new HttpsError('permission-denied', `Vedlegget «${String(file?.name || '').slice(0, 60)}» ligger ikke i bedriftens mappe.`);
  }
  const bucket = await mediaBucket();
  const [bytes] = await bucket.file(path).download();
  return bytes;
}

function recipients(list) {
  return [...new Set((Array.isArray(list) ? list : [list])
    .map((row) => String(row || '').trim().toLowerCase())
    .filter((row) => isValidEmail(row)))];
}

/** Sender fakturaen på e-post. Første mottaker får den, resten står på kopi. */
export const sendInvoiceMail = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const data = request.data || {};
  const familyId = familyIdFrom(data);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  await limit(db, uid, 'mail', 200);
  const invoice = await issuedInvoice(db, familyId, data.invoiceId);

  const to = recipients(data.to);
  if (!to.length) throw new HttpsError('invalid-argument', 'Legg inn minst én gyldig e-postadresse.');
  const cc = recipients(data.cc).filter((row) => !to.includes(row));
  const all = [...to, ...cc];
  if (all.length > 6) throw new HttpsError('invalid-argument', 'Fakturaen kan sendes til høyst seks adresser om gangen.');
  const subject = String(data.subject || '').trim().slice(0, 180) || `Faktura ${invoice.invoiceNumber}`;
  const text = String(data.text || '').trim().slice(0, 20000);
  if (text.length < 10) throw new HttpsError('invalid-argument', 'Skriv en melding til mottakeren.');
  const replyTo = isValidEmail(String(data.replyTo || '').trim()) ? String(data.replyTo).trim() : '';
  const fromName = String(data.fromName || '').replace(/[<>"]/g, '').trim().slice(0, 80) || 'ProTop';

  const files = Array.isArray(data.files) ? data.files.slice(0, 15) : [];
  const attachments = [];
  let total = 0;
  for (const file of files) {
    let content = String(file?.base64 || '').replace(/\s/g, '');
    if (!content) {
      const bytes = await readFile(file, familyId);
      content = Buffer.from(bytes).toString('base64');
    }
    const checked = normalizeFileAttachment({ filename: file?.name, contentType: file?.mime, content });
    if (!checked.ok) throw new HttpsError('invalid-argument', `${file?.name || 'Vedlegg'}: ${checked.error}`);
    total += Math.round(checked.attachment.content.length * 0.75);
    if (total > MAX_TOTAL_BYTES) {
      throw new HttpsError('invalid-argument', 'Vedleggene er til sammen for store for e-post (over 9 MB). Fjern noen vedlegg.');
    }
    attachments.push(checked.attachment);
  }

  const key = await resolveMailApiKey();
  if (!key) throw new HttpsError('failed-precondition', 'E-post er ikke satt opp på serveren.');
  const html = `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`;
  try {
    const sent = await sendMail(key, {
      to: to[0],
      cc: [...to.slice(1), ...cc],
      subject,
      text,
      html,
      fromName,
      replyTo,
      attachments,
    });
    logger.info('Invoice mail sent', { familyId, invoiceId: invoice.id, count: all.length, files: attachments.length });
    return {
      ok: true,
      providerId: String(sent?.messageId || sent?.id || '').slice(0, 120),
      to: all,
      files: attachments.map((row) => row.filename),
    };
  } catch (error) {
    throw new HttpsError('internal', friendlyMailError(error));
  }
});

/** Sender EHF-fila via aksesspunktet. xml lages i appen fra den ferdigstilte fakturaen. */
export const sendInvoiceEhf = onCall(CALL, async (request) => {
  const uid = requireUid(request);
  const data = request.data || {};
  const familyId = familyIdFrom(data);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  await limit(db, uid, 'ehf', 200);
  const invoice = await issuedInvoice(db, familyId, data.invoiceId);
  const xml = String(data.xml || '');
  if (!xml.startsWith('<?xml') || !xml.includes('urn:fdc:peppol.eu:2017:poacc:billing:3.0')) {
    throw new HttpsError('invalid-argument', 'EHF-fila er ikke gyldig.');
  }
  if (xml.length > 9 * 1024 * 1024) throw new HttpsError('invalid-argument', 'EHF-fila er for stor (over 9 MB). Fjern noen vedlegg.');
  if (!xml.includes(`<cbc:ID>${String(invoice.invoiceNumber).replace(/[<&>]/g, '')}</cbc:ID>`)) {
    throw new HttpsError('invalid-argument', 'EHF-fila hører ikke til denne fakturaen.');
  }
  try {
    const result = await deliverEhf({
      xml,
      senderOrgnr: data.senderOrgnr,
      receiverOrgnr: invoice.orgnr || data.receiverOrgnr,
      documentId: invoice.invoiceNumber,
      creditNote: invoice.kind === 'credit_note' || !!invoice.creditNoteForId,
    });
    logger.info('Invoice EHF sent', { familyId, invoiceId: invoice.id, providerId: result.providerId });
    return { ok: true, ...result };
  } catch (error) {
    if (error instanceof PeppolNotConfigured) throw new HttpsError('failed-precondition', error.message);
    if (error instanceof PeppolError) throw new HttpsError('unavailable', error.message);
    logger.error('Invoice EHF failed', error);
    throw new HttpsError('internal', 'EHF-sendingen feilet. Prøv igjen, eller send på e-post.');
  }
});

/** Kan kunden ta imot EHF? Og er EHF-sendingen koblet? */
export const lookupPeppolReceiver = onCall({ ...CALL, memory: '256MiB', timeoutSeconds: 20 }, async (request) => {
  const uid = requireUid(request);
  const data = request.data || {};
  const familyId = familyIdFrom(data);
  const db = getFirestore();
  await assertFamilyMember(db, familyId, uid);
  await limit(db, uid, 'lookup', 600);
  const config = await peppolConfig();
  let receiver = { found: false, invoice: false, creditNote: false, name: '' };
  let error = '';
  try {
    receiver = await lookupReceiver(data.orgnr);
  } catch (cause) {
    error = String(cause?.message || 'Peppol-katalogen svarte ikke.').slice(0, 200);
  }
  return { ok: true, connected: config.connected, receiver, error };
});
