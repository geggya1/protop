/**
 * EHF-utsending: avsender hentes fra bedriften på serveren, og samme faktura sendes
 * ikke to ganger ved et uhell (dobbeltklikk, eller nytt forsøk etter at svaret ble borte).
 *
 * Låsen ligger i ehfDeliveries/{familyId}_{invoiceId}. Samlingen har ingen regel, så bare
 * serveren kan lese og skrive den. Fakturadokumentet skrives av appen i sin helhet og
 * kan derfor ikke bære låsen.
 */

/** En påbegynt sending regnes som død etter så lang tid (funksjonen har 60 s tidsgrense). */
export const EHF_SENDING_STALE_MS = 2 * 60 * 1000;

/** «Send på nytt» rett etter en sending er nesten alltid et dobbeltklikk. */
export const EHF_RESEND_COOLDOWN_MS = 2 * 60 * 1000;

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Bedriftens orgnr fra selskapsdokumentet (det EHF-fila bygges fra), eller ''. */
export function senderOrgnrFromFamily(family) {
  const fromCompany = digits(family?.company?.organisasjonsnummer);
  if (fromCompany.length === 9) return fromCompany;
  const top = digits(family?.orgnr);
  return top.length === 9 ? top : '';
}

/** Orgnr i EndpointID under AccountingSupplierParty i EHF-fila, eller ''. */
export function xmlSupplierOrgnr(xml) {
  const block = String(xml || '').match(/<cac:AccountingSupplierParty>([\s\S]*?)<\/cac:AccountingSupplierParty>/);
  if (!block) return '';
  const endpoint = block[1].match(/<cbc:EndpointID\b[^>]*schemeID="0192"[^>]*>\s*([^<]*?)\s*<\/cbc:EndpointID>/);
  return endpoint ? digits(endpoint[1]) : '';
}

export function ehfLockId(familyId, invoiceId) {
  return `${String(familyId || '')}_${String(invoiceId || '')}`;
}

/** Har appen allerede registrert en vellykket EHF-sending på fakturaen? */
export function invoiceHasEhfDelivery(invoice) {
  return (Array.isArray(invoice?.deliveries) ? invoice.deliveries : [])
    .some((row) => row?.channel === 'ehf' && row?.status === 'sent');
}

/**
 * Hva gjør vi med en ny EHF-sending?
 * 'send' | 'in-progress' | 'already-sent' (krever «Send på nytt») | 'just-sent'.
 */
export function ehfSendDecision(lock, { resend = false, invoice = null, now = Date.now() } = {}) {
  const startedAt = Number(lock?.startedAtMs || 0);
  if (lock?.status === 'sending' && now - startedAt < EHF_SENDING_STALE_MS) return 'in-progress';
  const lastSentAt = Number(lock?.lastSentAtMs || 0);
  const sent = lastSentAt > 0 || invoiceHasEhfDelivery(invoice);
  if (sent && !resend) return 'already-sent';
  if (resend && lastSentAt > 0 && now - lastSentAt < EHF_RESEND_COOLDOWN_MS) return 'just-sent';
  return 'send';
}

export const EHF_DECISION_MESSAGES = {
  'in-progress': 'EHF-sendingen av denne fakturaen pågår allerede. Vent litt og se på fakturaen igjen.',
  'already-sent': 'Fakturaen er allerede sendt som EHF. Velg «Send på nytt» hvis den skal sendes en gang til.',
  'just-sent': 'Fakturaen ble sendt som EHF for under to minutter siden. Vent litt før du sender den på nytt.',
};
