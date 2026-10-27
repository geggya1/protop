/**
 * EHF via Peppol-aksesspunkt.
 *
 * Leverandøren (aksesspunktet) kobles med to hemmeligheter i Secret Manager:
 * - PEPPOL_API_KEY: API-nøkkelen fra leverandøren
 * - PEPPOL_SEND_URL: adressen EHF-fila sendes til (POST, application/xml)
 * PEPPOL_PROVIDER velger tilpasning når leverandøren krever et eget format (standard: «generic»).
 *
 * Til den er koblet svarer sendingen «ikke koblet», og appen tilbyr e-post i stedet.
 * Mottakeroppslaget bruker den åpne Peppol-katalogen og virker uten avtale.
 */
import { resolveRuntimeSecret } from './runtimeSecret.js';

export class PeppolNotConfigured extends Error {
  constructor() {
    super('EHF-sending er ikke koblet til et aksesspunkt ennå.');
    this.code = 'not-configured';
  }
}

export class PeppolError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

export function participantId(orgnr) {
  const digits = String(orgnr || '').replace(/\D/g, '');
  return digits.length === 9 ? `0192:${digits}` : '';
}

export async function peppolConfig({ fetchImpl = fetch } = {}) {
  const [key, url] = await Promise.all([
    resolveRuntimeSecret('PEPPOL_API_KEY', { fetchImpl }),
    resolveRuntimeSecret('PEPPOL_SEND_URL', { fetchImpl }),
  ]);
  const provider = String(process.env.PEPPOL_PROVIDER || 'generic').trim().toLowerCase();
  return { key, url, provider, connected: !!(key && /^https:\/\//.test(url)) };
}

/** Kan mottakeren ta imot EHF faktura og kreditnota? Oppslag i Peppol-katalogen. */
export async function lookupReceiver(orgnr, { fetchImpl = fetch } = {}) {
  const id = participantId(orgnr);
  if (!id) return { found: false, invoice: false, creditNote: false, name: '' };
  const url = `https://directory.peppol.eu/search/1.0/json?participant=${encodeURIComponent(`iso6523-actorid-upis::${id}`)}`;
  const res = await fetchImpl(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new PeppolError(`Peppol-katalogen svarte ${res.status}.`, res.status);
  const body = await res.json().catch(() => ({}));
  const match = Array.isArray(body?.matches) ? body.matches[0] : null;
  if (!match) return { found: false, invoice: false, creditNote: false, name: '' };
  const docs = (Array.isArray(match.docTypes) ? match.docTypes : [])
    .map((row) => String(row?.value || row || ''));
  const billing = (type) => docs.some((value) => value.includes(type) && value.includes('poacc:billing:3.0'));
  const entity = Array.isArray(match.entities) ? match.entities[0] : null;
  const name = Array.isArray(entity?.name) ? String(entity.name[0]?.name || '') : String(entity?.name || '');
  return {
    found: true,
    invoice: billing('Invoice-2::Invoice'),
    creditNote: billing('CreditNote-2::CreditNote'),
    name,
  };
}

/**
 * Sender EHF-fila. Svarer { providerId, status }.
 * Den generelle tilpasningen poster XML-en og leser id og status fra JSON-svaret.
 */
export async function deliverEhf({ xml, senderOrgnr, receiverOrgnr, documentId, creditNote = false }, { fetchImpl = fetch } = {}) {
  const cfg = await peppolConfig({ fetchImpl });
  if (!cfg.connected) throw new PeppolNotConfigured();
  const sender = participantId(senderOrgnr);
  const receiver = participantId(receiverOrgnr);
  if (!sender || !receiver) throw new PeppolError('Org.nr. til avsender eller mottaker mangler.');
  const res = await fetchImpl(cfg.url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${cfg.key}`,
      'content-type': 'application/xml; charset=utf-8',
      accept: 'application/json',
      'x-peppol-sender': sender,
      'x-peppol-receiver': receiver,
      'x-peppol-document': creditNote ? 'credit-note' : 'invoice',
      'x-document-id': String(documentId || '').slice(0, 60),
    },
    body: xml,
    signal: AbortSignal.timeout(30000),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const message = body?.message || body?.error || body?.errors?.[0]?.message || `Aksesspunktet svarte ${res.status}.`;
    throw new PeppolError(String(message).slice(0, 300), res.status);
  }
  return {
    providerId: String(body?.id || body?.guid || body?.messageId || body?.transmissionId || '').slice(0, 120),
    status: String(body?.status || 'sent').slice(0, 40),
  };
}
