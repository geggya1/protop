/**
 * Mapping mellom ProTop-faktura og PowerOffice Go v2.
 *
 * Flyten avtalt med PowerOffice (e-post 21.10.2026):
 * - Fakturautkastet sendes som salgsordre med POST /SalesOrders/Complete.
 *   ExternalImportReference er ProTop sin referanse, unik per klient.
 * - Brukeren kontrollerer og sender fakturaen fra PowerOffice Go.
 * - Id-en på salgsordren beholdes når den blir faktura, så GET /OutgoingInvoices
 *   gir fakturanummer, KID, forsendelse og restbeløp (Balance 0 = betalt).
 * - Slås utkast sammen i Go, får utkastet ny id. Referansen forsvinner fra hodet,
 *   men blir stående på linjene. Derfor har hver linje sin egen referanse.
 *
 * Ingen avhengigheter, så den kan testes uten Firebase.
 */

export const REF_PREFIX = 'ProTop';

/** MVA-satsene i ProTop. Hver trenger et produkt i Go som styrer salgskonto og MVA. */
export const PRODUCT_VAT_CODES = ['HIGH', 'MID', 'LOW', 'ZERO', 'EXEMPT', 'OUTSIDE'];

const DELIVERY_TYPES = {
  EHF: { id: 'ehf', label: 'EHF' },
  PdfByEmail: { id: 'email', label: 'E-post (PDF)' },
  Print: { id: 'print', label: 'Papir' },
  Efaktura: { id: 'efaktura', label: 'eFaktura' },
  AvtaleGiro: { id: 'avtalegiro', label: 'AvtaleGiro' },
  External: { id: 'external', label: 'Eksternt' },
  Factoring: { id: 'factoring', label: 'Factoring' },
};

function text(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isoDate(value) {
  const match = text(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

/** Referansen på salgsordren. Nytt forsøk etter at utkastet er borte får eget nummer. */
export function salesOrderRef(invoiceId, attempt = 1) {
  const id = text(invoiceId).replace(/[^\w.-]+/g, '').slice(0, 80);
  if (!id) throw new Error('Fakturaen mangler id.');
  return attempt > 1 ? `${REF_PREFIX}-${id}-${attempt}` : `${REF_PREFIX}-${id}`;
}

export function lineRef(orderRef, index) {
  return `${orderRef}-L${index + 1}`;
}

/** Fra en linjereferanse tilbake til salgsordrens referanse. */
export function orderRefFromLineRef(ref) {
  const match = text(ref).match(/^(.+)-L\d+$/);
  return match ? match[1] : '';
}

export function deliveryFromPowerOffice(type) {
  return DELIVERY_TYPES[text(type)] || (text(type) ? { id: text(type).toLowerCase(), label: text(type) } : null);
}

export function normalizeProductCodes(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  for (const code of PRODUCT_VAT_CODES) {
    const value = text(input[code]).slice(0, 40);
    if (value) out[code] = value;
  }
  return out;
}

/**
 * ProTop-faktura → SalesOrderCompletePostDto.
 * Linjer uten beløp og antall blir tekstlinjer. Andre linjer trenger et produkt
 * (line.productCode eller produktet for linjens MVA-sats).
 */
export function salesOrderFromInvoice(invoice, { customerId, productCodes = {}, ref }) {
  const row = invoice && typeof invoice === 'object' ? invoice : {};
  if (!customerId) return { ok: false, error: 'Kunden finnes ikke i PowerOffice ennå.' };
  if (!ref) return { ok: false, error: 'Referanse mangler.' };
  const codes = normalizeProductCodes(productCodes);
  const missing = new Set();
  const lines = (Array.isArray(row.lines) ? row.lines : []).map((line, index) => {
    const quantity = num(line?.quantity) ?? 0;
    // Nettopris etter påslag og rabatt, så summen i PowerOffice blir lik utkastet i ProTop.
    const net = num(line?.netUnitPrice);
    const listPrice = num(line?.unitPrice) ?? 0;
    const unitPrice = net != null && quantity && Math.abs(net - listPrice) > 0.00001 ? net : listPrice;
    const description = text(line?.description).slice(0, 250);
    const base = {
      Description: description || null,
      SortOrder: index,
      ExternalImportReference: lineRef(ref, index),
    };
    if (!quantity && !unitPrice) {
      return { ...base, LineType: 'Text' };
    }
    const vatCode = text(line?.vatCode) || 'HIGH';
    const productCode = text(line?.productCode) || codes[vatCode] || '';
    if (!productCode) missing.add(vatCode);
    return {
      ...base,
      LineType: 'Normal',
      ProductCode: productCode,
      Quantity: quantity,
      ProductUnitPrice: unitPrice === listPrice ? round2(unitPrice) : Math.round(unitPrice * 10000) / 10000,
    };
  });
  if (!lines.length) return { ok: false, error: 'Fakturaen har ingen linjer.' };
  if (missing.size) {
    return {
      ok: false,
      error: `Velg produkt i PowerOffice for MVA-sats ${[...missing].join(', ')}.`,
      missingVatCodes: [...missing],
    };
  }
  const order = {
    CustomerId: customerId,
    ExternalImportReference: ref,
    SalesOrderDate: isoDate(row.invoiceDate) || null,
    DeliveryDate: isoDate(row.periodEnd) || null,
    CustomerReference: text(row.customerReference) || null,
    CurrencyCode: text(row.currency) || 'NOK',
    SalesOrderLines: lines,
  };
  for (const key of Object.keys(order)) {
    if (order[key] == null) delete order[key];
  }
  return { ok: true, order };
}

/** ProTop-kunde → CustomerPostDto. */
export function customerPostFromProTop(customer, { ref } = {}) {
  const row = customer && typeof customer === 'object' ? customer : {};
  const name = text(row.name || row.customerName).slice(0, 160);
  if (!name) return { ok: false, error: 'Kunden mangler navn.' };
  const email = text(row.email);
  const body = {
    Name: name,
    ExternalImportReference: ref || null,
    EmailAddress: email || null,
    InvoiceEmailAddress: email || null,
    PhoneNumber: text(row.phone) || null,
  };
  if (row.kind === 'person') {
    const parts = name.split(' ');
    body.IsPerson = true;
    body.FirstName = parts.slice(0, -1).join(' ') || name;
    body.LastName = parts.length > 1 ? parts[parts.length - 1] : name;
  } else {
    body.OrganizationNumber = text(row.orgnr).replace(/\s/g, '') || null;
  }
  const zip = text(row.postalCode);
  const city = text(row.place);
  if (text(row.address) || zip || city) {
    body.MailAddress = {
      AddressLine1: text(row.address) || null,
      ZipCode: zip || null,
      City: city || null,
      CountryCode: 'NO',
    };
  }
  for (const key of Object.keys(body)) {
    if (body[key] == null) delete body[key];
  }
  return { ok: true, customer: body };
}

/** Finn kunden i en liste fra GET /Customers: org.nr først, så kundenummer. */
export function matchCustomer(candidates, { orgnr = '', customerNumber = '' } = {}) {
  const list = Array.isArray(candidates) ? candidates : [];
  const org = text(orgnr).replace(/\s/g, '');
  if (org) {
    const hit = list.find((c) => text(c?.OrganizationNumber).replace(/\s/g, '') === org);
    if (hit) return hit;
  }
  const no = text(customerNumber);
  if (no) {
    const hit = list.find((c) => text(c?.Number) === no);
    // Samme kundenummer, men annet org.nr: ikke samme kunde.
    if (hit && (!org || !text(hit.OrganizationNumber))) return hit;
  }
  return null;
}

/** Felt som lagres på fakturaen etter at utkastet er opprettet i Go. */
export function invoicePatchAfterTransfer(invoice, order, { env, ref, customer, at }) {
  const previous = invoice?.poweroffice && typeof invoice.poweroffice === 'object' ? invoice.poweroffice : {};
  return {
    exportStatus: 'Overført til PowerOffice',
    // KID og fakturanummer settes av PowerOffice når fakturaen sendes.
    kid: '',
    poweroffice: {
      env,
      state: 'draft',
      salesOrderId: text(order?.Id),
      orderNo: num(order?.SalesOrderNo),
      externalImportReference: ref,
      attempt: (num(previous.attempt) || 0) + 1,
      customerId: num(customer?.Id),
      customerNo: num(customer?.Number),
      protopInvoiceNumber: text(previous.protopInvoiceNumber || invoice?.invoiceNumber),
      transferredAt: at,
      syncedAt: at,
    },
    updatedAt: at,
  };
}

/** GET /OutgoingInvoices → felt på ProTop-fakturaen. */
export function invoicePatchFromOutgoing(invoice, outgoing, { at }) {
  const previous = invoice?.poweroffice && typeof invoice.poweroffice === 'object' ? invoice.poweroffice : {};
  const balance = num(outgoing?.Balance);
  const total = num(outgoing?.TotalAmount);
  const net = num(outgoing?.NetAmount);
  const delivery = deliveryFromPowerOffice(outgoing?.InvoiceDeliveryType);
  const sentAt = isoDate(outgoing?.SentDateTimeOffset) || isoDate(outgoing?.VoucherDate);
  const paid = balance === 0;
  const credited = total != null && total < 0;
  const patch = {
    sent: 'sent',
    sentAt,
    exportStatus: 'Sendt fra PowerOffice',
    status: paid ? 'paid' : (credited ? 'credited' : 'sent'),
    paidAt: paid ? (isoDate(outgoing?.BalanceLastChangedDateTimeOffset) || text(invoice?.paidAt)) : '',
    outstanding: balance == null ? text(invoice?.outstanding) : String(balance),
    outstandingAmount: balance,
    lockedAt: text(invoice?.lockedAt) || sentAt,
    poweroffice: {
      ...previous,
      state: paid ? 'paid' : 'sent',
      outgoingInvoiceId: text(outgoing?.Id),
      invoiceNo: num(outgoing?.InvoiceNo),
      cid: text(outgoing?.Cid),
      deliveryType: text(outgoing?.InvoiceDeliveryType),
      sentDateTime: text(outgoing?.SentDateTimeOffset),
      balance,
      balanceChangedAt: text(outgoing?.BalanceLastChangedDateTimeOffset),
      matchId: num(outgoing?.MatchId),
      syncedAt: at,
    },
    updatedAt: at,
  };
  if (outgoing?.InvoiceNo != null) patch.invoiceNumber = String(outgoing.InvoiceNo);
  if (text(outgoing?.Cid)) patch.kid = text(outgoing.Cid);
  if (isoDate(outgoing?.VoucherDate)) patch.invoiceDate = isoDate(outgoing.VoucherDate);
  if (isoDate(outgoing?.DueDate)) patch.dueDate = isoDate(outgoing.DueDate);
  if (delivery) patch.deliveryMethod = delivery.id;
  if (previous.mergedFrom) {
    // Fakturaen i Go dekker flere ProTop-utkast. Beløp og restbeløp gjelder hele fakturaen.
    patch.outstanding = paid ? '0' : text(invoice?.outstanding);
    patch.outstandingAmount = paid ? 0 : num(invoice?.outstandingAmount);
    return patch;
  }
  // Brukeren kan ha endret utkastet i Go. Beløpene på fakturaen er de som gjelder.
  if (total != null) patch.amountInclVat = total;
  if (net != null) patch.amountExVat = net;
  if (total != null && net != null) patch.vat = round2(total - net);
  return patch;
}

/** Utkastet finnes verken som salgsordre eller faktura: slettet eller slått sammen. */
export function invoicePatchMissing(invoice, { at }) {
  const previous = invoice?.poweroffice && typeof invoice.poweroffice === 'object' ? invoice.poweroffice : {};
  return {
    exportStatus: 'Ikke funnet i PowerOffice',
    poweroffice: { ...previous, state: 'missing', syncedAt: at },
    updatedAt: at,
  };
}

/** Utkastet er slått sammen med et annet. Den nye salgsordren har linjene våre. */
export function invoicePatchMerged(invoice, salesOrderId, { at }) {
  const previous = invoice?.poweroffice && typeof invoice.poweroffice === 'object' ? invoice.poweroffice : {};
  return {
    exportStatus: 'Overført til PowerOffice (slått sammen)',
    poweroffice: {
      ...previous,
      state: 'draft',
      mergedFrom: text(previous.salesOrderId),
      salesOrderId: text(salesOrderId),
      syncedAt: at,
    },
    updatedAt: at,
  };
}
