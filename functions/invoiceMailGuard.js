/**
 * Faktura på e-post: hvem kan sende, til hvem, og med hvilket avsendernavn.
 *
 * Før kunne ethvert medlem (også innleide) sende selskapets faktura med egen tekst og
 * eget avsendernavn til en vilkårlig adresse, f.eks. «ny bankkonto»-svindel. Nå krever
 * serveren samme fakturatilgang som appen bruker for å vise «Send faktura», avsendernavnet
 * er selskapets eget navn, og adresser utenfor fakturaen logges med hvem som sendte.
 */

/** Samme nivå som canManage i Økonomi → Faktura: Begrenset redigering på Faktura. */
export const INVOICE_SEND_ACCESS = {
  resource: 'economyInvoices',
  action: 'read',
  message: 'Krever redigeringstilgang til Faktura i tilgangsstyringen for å sende fakturaer.',
};

function text(value) {
  return String(value || '').trim();
}

function email(value) {
  return text(value).toLowerCase();
}

/** Adressene fakturaen selv peker på (kundens faktura-e-post). */
export function invoiceKnownRecipients(invoice) {
  return [...new Set([invoice?.customerEmail, invoice?.customerCopy?.email]
    .map(email)
    .filter(Boolean))];
}

/**
 * Del mottakerne i dem fakturaen peker på og dem avsenderen har lagt inn selv.
 * Den med fakturatilgang kan sende til en annen adresse (f.eks. kundens regnskapsfører),
 * men det logges.
 */
export function invoiceMailRecipients(invoice, recipients = []) {
  const known = new Set(invoiceKnownRecipients(invoice));
  const list = [...new Set((recipients || []).map(email).filter(Boolean))];
  return {
    known: list.filter((row) => known.has(row)),
    outside: list.filter((row) => !known.has(row)),
  };
}

/** Avsendernavnet er selskapets navn fra selskapsdokumentet. Det appen sender, brukes ikke. */
export function invoiceMailFromName(family) {
  const name = text(family?.company?.navn) || text(family?.name);
  return name.replace(/[<>"]/g, '').slice(0, 80) || 'ProTop';
}

/** Domenet i en adresse, til loggen (hele adressen logges ikke). */
export function mailDomain(value) {
  const at = email(value).lastIndexOf('@');
  return at > 0 ? email(value).slice(at + 1) : '';
}
