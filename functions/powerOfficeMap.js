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
export const PRODUCT_VAT_CODES = ['HIGH', 'MID', 'LOW', 'ZERO', 'EXEMPT', 'OUTLAY', 'OUTSIDE', 'REVERSE'];

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
/** Seksjonene i ProTop, i samme rekkefølge og med samme navn som på ProTop-fakturaen. */
const SECTIONS = [
  ['hours', 'Timer'],
  ['fixed', 'Fastpris og avtaler'],
  ['expenses', 'Viderefakturerte utlegg'],
  ['outlays', 'Utlegg på vegne av kunden (uten mva)'],
  ['trips', 'Kjøring'],
  ['products', 'Produkter'],
  ['admin', 'Adm. kostnader'],
  ['other', 'Andre linjer'],
];
const SECTION_ORDER = new Map(SECTIONS.map(([id], index) => [id, index]));
const SECTION_LABEL = new Map(SECTIONS);

/** «02.2026» eller «01.2026–03.2026», som perioden på ProTop-fakturaen. */
export function linePeriod(start, end) {
  const month = (value) => {
    const match = text(value).match(/^(\d{4})-(\d{2})/);
    return match ? `${match[2]}.${match[1]}` : '';
  };
  const a = month(start);
  const b = month(end);
  if (a && b && a !== b) return `${a}–${b}`;
  return a || b || '';
}

/** Tekst i Go deles i linjer på høyst 250 tegn, på ordgrense. */
function textChunks(value, max = 250) {
  const out = [];
  for (const paragraph of String(value ?? '').split(/\n+/)) {
    let rest = paragraph.replace(/\s+/g, ' ').trim();
    while (rest.length > max) {
      const cut = rest.lastIndexOf(' ', max) > max / 2 ? rest.lastIndexOf(' ', max) : max;
      out.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    if (rest) out.push(rest);
  }
  return out;
}

export function salesOrderFromInvoice(invoice, { customerId, productCodes = {}, ref, brandingTheme = '' }) {
  const row = invoice && typeof invoice === 'object' ? invoice : {};
  if (!customerId) return { ok: false, error: 'Kunden finnes ikke i PowerOffice ennå.' };
  if (!ref) return { ok: false, error: 'Referanse mangler.' };
  const codes = normalizeProductCodes(productCodes);
  const missing = new Set();
  const source = (Array.isArray(row.lines) ? row.lines : []).map((line, index) => ({ line, index }));
  // Seksjonsoverskrifter som på ProTop-fakturaen, når linjene har seksjon.
  const sectioned = source.some(({ line }) => SECTION_ORDER.has(text(line?.section)));
  const sectionOf = ({ line }) => (SECTION_ORDER.has(text(line?.section)) ? text(line.section) : 'other');
  if (sectioned) {
    source.sort((a, b) => (SECTION_ORDER.get(sectionOf(a)) - SECTION_ORDER.get(sectionOf(b))) || (a.index - b.index));
  }
  const lines = [];
  const textLine = (description, key) => lines.push({
    Description: description,
    SortOrder: lines.length,
    ExternalImportReference: `${ref}-${key}`,
    LineType: 'Text',
  });
  // Fakturateksten først, som på ProTop-fakturaen.
  textChunks(row.invoiceText).forEach((chunk, index) => textLine(chunk, `T${index + 1}`));
  let currentSection = '';
  for (const item of source) {
    const { line, index } = item;
    if (sectioned && sectionOf(item) !== currentSection) {
      currentSection = sectionOf(item);
      textLine(SECTION_LABEL.get(currentSection), `H${SECTION_ORDER.get(currentSection) + 1}`);
    }
    const quantity = num(line?.quantity) ?? 0;
    // Nettopris etter påslag og rabatt, så summen i PowerOffice blir lik utkastet i ProTop.
    const net = num(line?.netUnitPrice);
    const listPrice = num(line?.unitPrice) ?? 0;
    const unitPrice = net != null && quantity && Math.abs(net - listPrice) > 0.00001 ? net : listPrice;
    const period = linePeriod(line?.periodStart, line?.periodEnd);
    const description = [period, text(line?.description)].filter(Boolean).join(' · ').slice(0, 250);
    const base = {
      Description: description || null,
      SortOrder: lines.length,
      ExternalImportReference: lineRef(ref, index),
    };
    if (!quantity && !unitPrice) {
      lines.push({ ...base, LineType: 'Text' });
      continue;
    }
    const vatCode = text(line?.vatCode) || 'HIGH';
    const productCode = text(line?.productCode) || codes[vatCode] || '';
    if (!productCode) missing.add(vatCode);
    lines.push({
      ...base,
      LineType: 'Normal',
      ProductCode: productCode,
      Quantity: quantity,
      ProductUnitPrice: unitPrice === listPrice ? round2(unitPrice) : Math.round(unitPrice * 10000) / 10000,
    });
  }
  if (!source.length) return { ok: false, error: 'Fakturaen har ingen linjer.' };
  if (missing.size) {
    return {
      ok: false,
      error: `Velg produkt for MVA-sats ${[...missing].join(', ')} under Økonomi → Innstillinger → Regnskapssystem.`,
      missingVatCodes: [...missing],
    };
  }
  const order = {
    CustomerId: customerId,
    ExternalImportReference: ref,
    SalesOrderDate: isoDate(row.invoiceDate) || null,
    DeliveryDate: isoDate(row.periodEnd) || null,
    CustomerReference: text(row.customerReference) || null,
    PurchaseOrderReference: text(row.orderReference) || null,
    ContractNo: text(row.contractReference) || null,
    // Fakturaoppsettet (logo, farger, bunntekst) i Go. Tomt: klientens standard.
    BrandingThemeCode: text(brandingTheme) || null,
    PaymentTerm: paymentTerm(row),
    CurrencyCode: text(row.currency) || 'NOK',
    SalesOrderLines: lines,
  };
  for (const key of Object.keys(order)) {
    if (order[key] == null) delete order[key];
  }
  return { ok: true, order };
}

/**
 * Kredittiden på fakturaen i ProTop, i dager, så Go gir samme forfall som ProTop viser.
 * Uten kredittid arver Go betalingsbetingelsen fra kunden eller klienten.
 */
function paymentTerm(row) {
  if (row.creditDays == null || row.creditDays === '') return null;
  const days = Number(row.creditDays);
  return Number.isFinite(days) && days >= 0 ? Math.round(days) : null;
}

/**
 * Send-forespørsel for et utkast i Go (SendInvoiceRequestPostDto). Auto: Go sender EHF,
 * eFaktura eller AvtaleGiro når kunden kan ta imot det, ellers PDF på e-post.
 * Valgt fakturadato og frist i ProTop følger med. Ellers dagens dato og betalingsbetingelsen.
 */
export function sendRequestFromInvoice(invoice) {
  const row = invoice && typeof invoice === 'object' ? invoice : {};
  const body = { DeliveryType: 'Auto' };
  const email = text(row.customerEmail);
  if (email) body.EmailAddress = email;
  if (row.invoiceDateSet === true && isoDate(row.invoiceDate)) body.VoucherDate = isoDate(row.invoiceDate);
  if (row.dueDateSet === true && isoDate(row.dueDate)) body.OverrideDueDate = isoDate(row.dueDate);
  return body;
}

/**
 * Forsendelse for en ny kunde i Go. Go bruker ellers e-post, og avviser kunden når
 * e-postadressen mangler. Med e-post: PDF på e-post. Uten: EHF når kunden har
 * org.nr., ellers papir. Purring og inkassovarsel kan bare gå på e-post eller papir.
 */
export function customerDelivery({ email = '', orgnr = '', isPerson = false } = {}) {
  if (text(email)) {
    return { InvoiceDeliveryType: 'PdfByEmail', ReminderDeliveryType: 'PdfByEmail', NoticeOfDebtCollectionDeliveryType: 'PdfByEmail' };
  }
  const ehf = !isPerson && text(orgnr).replace(/\D/g, '').length === 9;
  return { InvoiceDeliveryType: ehf ? 'EHF' : 'Print', ReminderDeliveryType: 'Print', NoticeOfDebtCollectionDeliveryType: 'Print' };
}

/**
 * ProTop-kunde → CustomerPostDto. Mangler kunderegisteret e-post eller adresse,
 * brukes det som står på fakturaen.
 */
export function customerPostFromProTop(customer, { ref, invoice = null } = {}) {
  const row = customer && typeof customer === 'object' ? customer : {};
  const inv = invoice && typeof invoice === 'object' ? invoice : {};
  const name = text(row.name || row.customerName || inv.customerName).slice(0, 160);
  if (!name) return { ok: false, error: 'Kunden mangler navn.' };
  const email = text(row.email);
  const invoiceEmail = text(row.invoiceEmail) || email || text(inv.customerEmail);
  const isPerson = row.kind === 'person';
  const orgnr = text(row.orgnr || inv.orgnr).replace(/\s/g, '');
  const body = {
    Name: name,
    ExternalImportReference: ref || null,
    EmailAddress: email || invoiceEmail || null,
    InvoiceEmailAddress: invoiceEmail || null,
    PhoneNumber: text(row.phone) || null,
    ...customerDelivery({ email: invoiceEmail, orgnr, isPerson }),
  };
  if (isPerson) {
    const parts = name.split(' ');
    body.IsPerson = true;
    body.FirstName = parts.slice(0, -1).join(' ') || name;
    body.LastName = parts.length > 1 ? parts[parts.length - 1] : name;
  } else {
    body.OrganizationNumber = orgnr || null;
  }
  const addr = inv.customerAddress && typeof inv.customerAddress === 'object' ? inv.customerAddress : {};
  const fromRegister = !!(text(row.address) || text(row.postalCode) || text(row.place));
  const street = fromRegister ? text(row.address) : text(addr.street);
  const zip = fromRegister ? text(row.postalCode) : text(addr.postalCode);
  const city = fromRegister ? text(row.place) : text(addr.city);
  if (street || zip || city) {
    body.MailAddress = {
      AddressLine1: street || null,
      ZipCode: zip || null,
      City: city || null,
      CountryCode: (fromRegister ? '' : text(addr.country).toUpperCase().slice(0, 2)) || 'NO',
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
      cid: text(outgoing?.Cid) || text(previous.cid),
      deliveryType: text(outgoing?.InvoiceDeliveryType),
      sentDateTime: text(outgoing?.SentDateTimeOffset),
      balance,
      balanceChangedAt: text(outgoing?.BalanceLastChangedDateTimeOffset),
      matchId: num(outgoing?.MatchId),
      sendError: '',
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

function norDate(value) {
  const iso = isoDate(value);
  return iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '';
}

function kroner(value) {
  const n = Number(value) || 0;
  const [whole, frac] = Math.abs(n).toFixed(2).split('.');
  return `${n < 0 ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${frac} kr`;
}

/**
 * Hendelser til endringsloggen for det som skjedde med fakturaen i PowerOffice, ut fra
 * fakturaen før og etter en lagring. user: brukeren gjorde det (navnet står foran teksten).
 * Ellers er det PowerOffice som meldte det, og teksten står alene.
 */
export function powerOfficeEvents(before, after) {
  const b = before?.poweroffice && typeof before.poweroffice === 'object' ? before.poweroffice : {};
  const a = after?.poweroffice && typeof after.poweroffice === 'object' ? after.poweroffice : {};
  const maybe = (value) => (value == null || value === '' ? null : num(value));
  const out = [];
  const test = a.env === 'demo' ? ' (testklient)' : '';
  if (text(a.transferredAt) && a.transferredAt !== b.transferredAt && a.state === 'draft') {
    const again = text(b.salesOrderId) || maybe(b.attempt) > 0;
    const no = maybe(a.orderNo);
    out.push({
      type: 'poweroffice',
      user: true,
      text: `overførte utkastet til PowerOffice${test}${again ? ' på nytt' : ''}${no ? ` som utkast nr. ${no}` : ''}`,
    });
  }
  if (text(a.attachmentsAddedAt) && a.attachmentsAddedAt !== b.attachmentsAddedAt) {
    const n = maybe(a.attachments) || 0;
    out.push({ type: 'attachment', user: true, text: `la ved ${n === 1 ? '1 fil' : `${n} filer`} på utkastet i PowerOffice` });
  }
  if (text(a.attachmentErrors) && a.attachmentErrors !== b.attachmentErrors) {
    out.push({ type: 'attachment', user: false, text: `Vedlegg kom ikke med i PowerOffice: ${a.attachmentErrors}` });
  }
  if (a.state === 'sending' && b.state !== 'sending') {
    out.push({ type: 'delivery', user: true, text: 'ba PowerOffice sende fakturaen til kunden' });
  }
  if (text(a.sendError) && a.sendError !== b.sendError) {
    out.push({ type: 'delivery', user: false, text: `Sendingen fra PowerOffice feilet: ${a.sendError}` });
  }
  const done = (state) => state === 'sent' || state === 'paid';
  if (done(a.state) && !done(b.state)) {
    const delivery = deliveryFromPowerOffice(a.deliveryType);
    const parts = [
      delivery ? `som ${delivery.label}` : '',
      norDate(after?.sentAt || a.sentDateTime) ? `${norDate(after?.sentAt || a.sentDateTime)}` : '',
    ].filter(Boolean).join(' ');
    const facts = [
      text(a.cid) ? `KID ${a.cid}` : '',
      norDate(after?.invoiceDate) ? `fakturadato ${norDate(after.invoiceDate)}` : '',
      norDate(after?.dueDate) ? `forfall ${norDate(after.dueDate)}` : '',
      Number.isFinite(Number(after?.amountInclVat)) && after?.amountInclVat !== '' && after?.amountInclVat != null
        ? kroner(after.amountInclVat) : '',
    ].filter(Boolean).join(', ');
    out.push({
      type: 'delivery',
      user: false,
      text: `PowerOffice${test} sendte faktura ${maybe(a.invoiceNo) ?? text(after?.invoiceNumber)}${parts ? ` ${parts}` : ''}${facts ? ` (${facts})` : ''}`,
    });
  }
  const before0 = maybe(b.balance);
  const after0 = maybe(a.balance);
  if (a.state === 'paid' && b.state !== 'paid') {
    out.push({ type: 'payment', user: false, text: 'Fakturaen er betalt (registrert i PowerOffice)' });
  } else if (done(a.state) && done(b.state) && before0 != null && after0 != null && after0 !== before0) {
    out.push({
      type: 'payment',
      user: false,
      text: after0 < before0
        ? `Innbetaling registrert i PowerOffice, restbeløp ${kroner(after0)}`
        : `Restbeløpet i PowerOffice er endret til ${kroner(after0)}`,
    });
  }
  if (a.state === 'missing' && b.state !== 'missing') {
    out.push({
      type: 'poweroffice',
      user: false,
      text: 'Utkastet finnes ikke lenger i PowerOffice (slettet der). Det kan endres, overføres på nytt eller slettes i ProTop',
    });
  }
  if (text(a.mergedFrom) && a.mergedFrom !== b.mergedFrom) {
    out.push({ type: 'poweroffice', user: false, text: 'Utkastet ble slått sammen med et annet utkast i PowerOffice' });
  }
  return out;
}

/** Fakturaen etter en lagring med merge: poweroffice slås sammen felt for felt. */
export function mergedInvoice(invoice, patch) {
  const base = invoice && typeof invoice === 'object' ? invoice : {};
  const next = { ...base, ...(patch || {}) };
  if (patch?.poweroffice && typeof patch.poweroffice === 'object') {
    next.poweroffice = { ...(base.poweroffice || {}), ...patch.poweroffice };
  }
  return next;
}
