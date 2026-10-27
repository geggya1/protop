/**
 * Arkiv og utsending av ferdigstilte fakturaer.
 * PDF og EHF-fil lagres uendret i Storage ved ferdigstilling (bokføringsloven § 13).
 * E-post og EHF sendes av Cloud Functions (functions/invoiceDelivery.js).
 */
import { text } from './invoices.js';

function safeName(name) {
  return String(name || 'fil').replace(/[^\wæøåÆØÅ.\- ()]+/g, '_').slice(0, 120);
}

async function callable(name, data, timeout = 60000) {
  const [{ httpsCallable }, { functions }] = await Promise.all([
    import('firebase/functions'),
    import('../../firebase.js'),
  ]);
  const call = httpsCallable(functions, name, { timeout });
  const result = await call(data);
  return result?.data || {};
}

export function friendlyCallError(error, fallback = 'Noe gikk galt.') {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  const code = String(error?.code || '');
  if (code.includes('not-found') && /function|404/i.test(message)) {
    return 'Utsendingen er ikke tilgjengelig ennå. Den kommer med neste oppdatering av serveren.';
  }
  return message || fallback;
}

function blobOf(bytes, mime) {
  if (typeof Blob === 'undefined') throw new Error('Filen kan bare lagres i nettleseren.');
  return new Blob([bytes], { type: mime });
}

/** Lagrer en fil i fakturaens mappe og svarer med en filreferanse til fakturaen. */
export async function storeInvoiceFile(companyId, invoiceId, name, bytes, mime) {
  const file = safeName(name);
  const storagePath = `families/${companyId}/invoices/${invoiceId}/${file}`;
  const blob = blobOf(bytes, mime);
  if (!companyId || companyId === '__demo__') {
    return { url: URL.createObjectURL(blob), storagePath: '', name: file, mime, size: blob.size, at: new Date().toISOString() };
  }
  const { uploadFile } = await import('../utils/media');
  const url = await uploadFile(storagePath, { blob, name: file, mimeType: mime }, mime);
  return { url, storagePath, name: file, mime, size: blob.size, at: new Date().toISOString() };
}

/** Arkiv for en ferdigstilt faktura: PDF, EHF-fil og eventuelt timespesifikasjon. */
export async function archiveInvoice(companyId, invoice, { pdf, pdfName, xml, timeSpec, timeSpecName } = {}) {
  const archive = { ...(invoice?.archive || {}) };
  if (pdf) archive.pdf = await storeInvoiceFile(companyId, invoice.id, pdfName || 'faktura.pdf', pdf, 'application/pdf');
  if (xml) {
    const bytes = new TextEncoder().encode(xml);
    archive.xml = await storeInvoiceFile(companyId, invoice.id, `${(pdfName || 'faktura').replace(/\.pdf$/i, '')}-EHF.xml`, bytes, 'application/xml');
  }
  if (timeSpec) {
    archive.timeSpec = await storeInvoiceFile(companyId, invoice.id, timeSpecName || 'Timespesifikasjon.pdf', timeSpec, 'application/pdf');
  }
  return archive;
}

/** Filer som sendes med e-posten: PDF fra arkivet og valgte vedlegg. */
export function mailFiles(invoice, { includePdf = true, includeTimeSpec = false, includeAttachments = true, pdfBase64 = '' } = {}) {
  const files = [];
  const archive = invoice?.archive || {};
  if (includePdf) {
    if (archive.pdf?.storagePath || archive.pdf?.url) {
      files.push({ name: archive.pdf.name, storagePath: archive.pdf.storagePath, url: archive.pdf.url, mime: 'application/pdf' });
    } else if (pdfBase64) {
      files.push({ name: `Faktura-${text(invoice?.invoiceNumber) || 'utkast'}.pdf`, base64: pdfBase64, mime: 'application/pdf' });
    }
  }
  if (includeTimeSpec && (archive.timeSpec?.storagePath || archive.timeSpec?.url)) {
    files.push({ name: archive.timeSpec.name, storagePath: archive.timeSpec.storagePath, url: archive.timeSpec.url, mime: 'application/pdf' });
  }
  if (includeAttachments) {
    for (const row of invoice?.attachments || []) {
      if (row.include === false) continue;
      files.push({ name: row.name, storagePath: row.storagePath, url: row.url, mime: row.mime });
    }
  }
  return files;
}

export async function sendInvoiceMail(input) {
  return callable('sendInvoiceMail', input, 90000);
}

export async function sendInvoiceEhf(input) {
  return callable('sendInvoiceEhf', input, 60000);
}

/** { connected, receiver: { found, invoice, creditNote, name }, error } */
export async function lookupPeppolReceiver(familyId, orgnr) {
  const digits = String(orgnr || '').replace(/\D/g, '');
  if (digits.length !== 9 || !familyId || familyId === '__demo__') {
    return { connected: false, receiver: { found: false, invoice: false, creditNote: false, name: '' }, error: '' };
  }
  return callable('lookupPeppolReceiver', { familyId, orgnr: digits }, 20000);
}

/** Leser en fil fra arkivet eller vedleggene som base64 (for EHF-vedlegg). */
export async function fileBase64(ref) {
  const url = text(ref?.url);
  if (!url) return '';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Kunne ikke lese ${ref?.name || 'vedlegget'}.`);
  const buffer = new Uint8Array(await res.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < buffer.length; i += chunk) {
    binary += String.fromCharCode.apply(null, buffer.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function downloadFile(bytes, name, mime) {
  if (typeof document === 'undefined') return false;
  const blob = blobOf(bytes, mime);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}

export function openFileUrl(url) {
  if (!url || typeof window === 'undefined') return false;
  window.open(url, '_blank', 'noopener');
  return true;
}

/** PDF-bytes som en blob-URL for forhåndsvisning (iframe). Kalleren frigjør den. */
export function previewUrl(bytes) {
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') return '';
  return URL.createObjectURL(blobOf(bytes, 'application/pdf'));
}
