/**
 * Kall mot PowerOffice-funksjonene (functions/powerOffice.js).
 * Nøklene ligger på serveren. Appen ser bare status og resultat.
 */
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase.js';

async function call(name, data, timeout = 60000) {
  const fn = httpsCallable(functions, name, { timeout });
  const result = await fn(data);
  return result?.data || null;
}

export function loadPowerOfficeStatus(familyId) {
  return call('powerOfficeStatus', { familyId }, 20000);
}

/**
 * Klientnøkkel fra Utvidelser i PowerOffice Go, og/eller produkt per MVA-sats.
 * Serveren finner selv ut om nøkkelen hører til produksjon eller en testklient.
 */
export function connectPowerOffice(familyId, { clientKey, productCodes, autoSend, attachDocs, brandingTheme } = {}) {
  return call('powerOfficeConnect', {
    familyId,
    ...(clientKey ? { clientKey } : {}),
    ...(productCodes ? { productCodes } : {}),
    ...(typeof autoSend === 'boolean' ? { autoSend } : {}),
    ...(typeof attachDocs === 'boolean' ? { attachDocs } : {}),
    ...(typeof brandingTheme === 'string' ? { brandingTheme } : {}),
  }, 30000);
}

export function disconnectPowerOffice(familyId) {
  return call('powerOfficeDisconnect', { familyId }, 20000);
}

export function listPowerOfficeProducts(familyId) {
  return call('powerOfficeProducts', { familyId }, 60000);
}

/**
 * send: be Go sende fakturaen med en gang (også et utkast som allerede er overført).
 * actorName: navnet i endringsloggen.
 */
export function transferInvoiceToPowerOffice(familyId, invoiceId, { again = false, send = false, attachments = null, actorName = '' } = {}) {
  return call('powerOfficeTransferInvoice', {
    familyId,
    invoiceId,
    again,
    ...(actorName ? { actorName: String(actorName).slice(0, 120) } : {}),
    ...(send ? { send: true } : {}),
    ...(Array.isArray(attachments) && attachments.length ? { attachments } : {}),
  }, 180000);
}

export function syncPowerOfficeInvoices(familyId) {
  return call('powerOfficeSyncInvoices', { familyId }, 120000);
}

/** Les én sendt faktura fra Go på fakturanummer. Lagrer ingenting. */
export function lookupPowerOfficeInvoice(familyId, invoiceNo) {
  return call('powerOfficeLookupInvoice', { familyId, invoiceNo: String(invoiceNo || '').trim() }, 60000);
}

/** Fakturaen slik kunden fikk den fra PowerOffice. kind: 'pdf' eller 'ehf'. Gir { name, mime, base64 }. */
export function fetchPowerOfficeDocument(familyId, invoiceId, kind = 'pdf') {
  return call('powerOfficeInvoiceDocument', { familyId, invoiceId, kind: kind === 'ehf' ? 'ehf' : 'pdf' }, 60000);
}
