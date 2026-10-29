/**
 * Automatisk purring og inkasso, morgen og ettermiddag (collectionAutoIndex.js).
 *
 * Feilsikring: betalingsstatus hentes fra PowerOffice rett før. Feiler hentingen, kan vi ikke
 * vite om kunden har betalt, og ingenting sendes for den bedriften den gangen. Bare fakturaer
 * der betalingen kommer fra PowerOffice tas med. Fakturaer fra testklienten tas aldri med.
 * Stegene og fristene er de samme som på fakturasiden (src/economy/collection.js).
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { resolveCompanyInvoiceDefaults } from '../src/economy/companyInvoiceDefaults.js';
import {
  COLLECTION_FLAGS_FOR, COLLECTION_KINDS, addCollectionStep, addDays, collectionLetter, collectionSettings, collectionStatus,
} from '../src/economy/collection.js';
import { buildCollectionLetterPdf, buildInvoicePdf, collectionLetterName, invoicePdfName, pdfBase64 } from '../src/economy/invoicePdf.js';
import { supplierFromCompany } from '../src/economy/ehf.js';
import { normalizeInvoice } from '../src/economy/invoices.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { normalizeFileAttachment, sendMail } from './mail.js';
import { invoiceMailFromName } from './invoiceMailGuard.js';
import { syncCompany } from './powerOffice.js';

/** Høyst så mange brev per bedrift per kjøring, så en feil ikke gir en flom av e-post. */
export const MAX_LETTERS_PER_RUN = 50;

const SUBJECT = {
  friendly: (no, company) => `Påminnelse: faktura ${no} fra ${company}`,
  reminder: (no, company) => `Purring: faktura ${no} fra ${company}`,
  notice: (no, company) => `Inkassovarsel: faktura ${no} fra ${company}`,
  debt: (no, company, customer) => `Inkasso: faktura ${no} fra ${company} til ${customer}`,
};

export function osloToday(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function anyAuto(cs) {
  return Object.values(cs.auto).some(Boolean);
}

/** Hva som skal sendes automatisk for én faktura i dag, eller null. */
export function autoStepFor(invoice, { today, settings }) {
  if (invoice?.poweroffice?.env === 'demo') return null;
  if (!String(invoice?.poweroffice?.outgoingInvoiceId || '').trim()) return null;
  const st = collectionStatus(invoice, { today, settings });
  const next = st.next;
  if (!next?.autoReady) return null;
  const letter = next.kind === 'reminder' || next.kind === 'notice';
  const to = next.kind === 'debt' ? st.settings.agencyEmail : String(invoice.customerEmail || '').trim();
  return {
    kind: next.kind,
    to,
    fee: letter && st.feeAllowed ? st.settings.reminderFee : 0,
    deadline: letter ? addDays(today, st.settings.deadlineDays) : '',
    status: st,
  };
}

async function companySettings(db, familyId) {
  const snap = await db.doc(`families/${familyId}/projects/state`).get();
  const data = snap.exists ? snap.data() || {} : {};
  return resolveCompanyInvoiceDefaults(data.state || data);
}

/**
 * Én bedrift. send(message) sender e-posten (sendMail med nøkkelen i produksjon).
 * Gir { ok, sent, blocked, reason }.
 */
export async function runCompanyCollection(db, familyId, status, { now = new Date(), send, sync = syncCompany } = {}) {
  const settings = await companySettings(db, familyId);
  const cs = collectionSettings(settings);
  if (!anyAuto(cs)) return { ok: true, sent: 0, blocked: 0, reason: 'av' };
  try {
    await sync(db, familyId, status);
  } catch (err) {
    // Uten fersk betalingsstatus sendes ingenting.
    return { ok: false, sent: 0, blocked: 0, reason: `Henting av betalinger fra PowerOffice feilet: ${String(err?.message || err).slice(0, 200)}` };
  }
  const today = osloToday(now);
  const familySnap = await db.doc(`families/${familyId}`).get();
  const family = familySnap.exists ? familySnap.data() || {} : {};
  const supplier = supplierFromCompany(family.company || {}, family.name || '');
  const logo = family.company?.logo || null;
  const company = invoiceMailFromName(family);
  const snap = await db.collection(`families/${familyId}/invoices`).where('poweroffice.state', '==', 'sent').get();
  let sent = 0;
  let blocked = 0;
  for (const doc of snap.docs) {
    if (sent >= MAX_LETTERS_PER_RUN) break;
    const invoice = normalizeInvoice({ ...doc.data(), id: doc.id });
    const step = autoStepFor(invoice, { today, settings });
    if (!step) continue;
    const at = now.toISOString();
    const label = COLLECTION_KINDS[step.kind].label;
    if (!step.to.includes('@')) {
      blocked += 1;
      const why = step.kind === 'debt' ? 'e-post til inkassobyrået mangler i Fakturainnstillinger' : 'kunden mangler e-postadresse på fakturaen';
      const key = `${step.kind}:mangler-epost`;
      if (invoice.collection?.autoBlocked !== key) {
        await doc.ref.update({
          'collection.autoBlocked': key,
          events: FieldValue.arrayUnion({
            id: `ev_auto_${Date.now().toString(36)}`, at, type: 'collection', text: `${label} ble ikke sendt automatisk: ${why}`, byUid: '', byName: '',
          }),
        });
      }
      continue;
    }
    const letter = collectionLetter(invoice, step.kind, { fee: step.fee, deadline: step.deadline, today, supplier, status: step.status });
    const pdf = buildCollectionLetterPdf(invoice, letter, { supplier, logo, date: today });
    const files = [{ filename: collectionLetterName(invoice, step.kind), contentType: 'application/pdf', content: pdfBase64(pdf) }];
    if (step.kind === 'debt') {
      files.push({ filename: invoicePdfName(invoice), contentType: 'application/pdf', content: pdfBase64(buildInvoicePdf(invoice, { supplier, logo })) });
    }
    const attachments = files.map((file) => normalizeFileAttachment(file)).filter((row) => row.ok).map((row) => row.attachment);
    const text = `${letter.paragraphs.join('\n\n')}\n\nMed vennlig hilsen\n${company}`;
    try {
      await send({
        to: step.to,
        cc: [],
        subject: SUBJECT[step.kind](invoice.invoiceNumber, company, invoice.customerName || ''),
        text,
        html: `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`,
        fromName: company,
        replyTo: String(settings.emailReplyTo || supplier.email || '').trim(),
        attachments,
      });
    } catch (err) {
      blocked += 1;
      logger.warn('Automatisk purring feilet', { familyId, invoiceId: doc.id, kind: step.kind, message: err?.message });
      continue;
    }
    const result = addCollectionStep(invoice, {
      kind: step.kind, fee: step.fee, deadline: step.deadline, to: step.to, channel: 'email', auto: true,
    }, { at });
    const flag = COLLECTION_FLAGS_FOR[step.kind];
    const event = result.invoice.events[result.invoice.events.length - 1];
    await doc.ref.update({
      'collection.steps': FieldValue.arrayUnion(result.step),
      [`collection.${flag}`]: true,
      [`collection.${flag}At`]: at,
      'collection.autoBlocked': FieldValue.delete(),
      events: FieldValue.arrayUnion(event),
      updatedAt: at,
    });
    sent += 1;
  }
  return { ok: true, sent, blocked, reason: '' };
}

/** Alle bedrifter som er koblet til PowerOffice. Resultatet lagres på statusen (lastCollectionRun). */
export async function runCollectionAutomation(db = getFirestore(), { now = new Date(), send = null, sync = syncCompany } = {}) {
  const snap = await db.collection('powerOfficeClients').where('connected', '==', true).get();
  let mailer = send;
  const out = { companies: 0, sent: 0, blocked: 0, failed: 0 };
  for (const doc of snap.docs) {
    out.companies += 1;
    try {
      if (!mailer) {
        const key = await resolveMailApiKey();
        if (!key) throw new Error('E-post er ikke satt opp på serveren.');
        mailer = (message) => sendMail(key, message);
      }
      const result = await runCompanyCollection(db, doc.id, doc.data() || {}, { now, send: mailer, sync });
      out.sent += result.sent;
      out.blocked += result.blocked;
      if (!result.ok) out.failed += 1;
      if (result.reason !== 'av') {
        await doc.ref.set({ lastCollectionRun: { at: now.toISOString(), ...result } }, { merge: true });
      }
      if (!result.ok) logger.warn('Automatisk purring hoppet over', { familyId: doc.id, reason: result.reason });
    } catch (err) {
      out.failed += 1;
      logger.warn('Automatisk purring feilet', { familyId: doc.id, message: err?.message });
      await doc.ref.set({
        lastCollectionRun: { at: now.toISOString(), ok: false, sent: 0, blocked: 0, reason: String(err?.message || err).slice(0, 300) },
      }, { merge: true }).catch(() => {});
    }
  }
  return out;
}
