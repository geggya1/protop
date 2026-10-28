/**
 * Overføring av fakturautkast og synk av fakturastatus mot PowerOffice Go.
 * Tar en API-klient (powerOfficeApi.js) og rene data, og returnerer det som skal
 * lagres. Firestore håndteres i powerOffice.js, så dette kan testes uten Firebase.
 */
import {
  REF_PREFIX,
  customerPostFromProTop,
  invoicePatchAfterTransfer,
  invoicePatchFromOutgoing,
  invoicePatchMerged,
  invoicePatchMissing,
  matchCustomer,
  orderRefFromLineRef,
  salesOrderFromInvoice,
  salesOrderRef,
} from './powerOfficeMap.js';

/** Maks antall id-er i ett invoiceIds-filter. */
const IDS_PER_CALL = 40;
/** Hvor mange utkast vi åpner for å lete etter et sammenslått utkast. */
const MERGE_SEARCH_LIMIT = 15;

function text(value) {
  return String(value ?? '').trim();
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Sats i prosent. API-et kan oppgi 0.25 eller 25. */
export function vatRatePercent(rate) {
  const n = Number(rate);
  if (rate == null || rate === '' || !Number.isFinite(n)) return null;
  return n <= 1 ? Math.round(n * 10000) / 100 : n;
}

/**
 * Produktene i Go med salgskonto og MVA, så admin ser hvilken sats et produkt gir.
 * MVA-en ligger på salgskontoen (GeneralLedgerAccounts), satsen på MVA-koden (VatCodes).
 * Mangler integrasjonen tilgang til kontoplanen, kommer produktene uten MVA.
 */
export async function productsWithVat(client, { limit = 1000 } = {}) {
  const rows = (await client.listAll('/Products', { isArchived: false }, { pageSize: 100, maxPages: 10 }))
    .filter((row) => row?.Code)
    .slice(0, limit);
  const accountNos = [...new Set(rows.map((row) => Number(row.StandardSalesAccount)).filter((n) => n > 0))];
  const accounts = new Map();
  const vatCodes = new Map();
  if (accountNos.length) {
    try {
      const list = await client.listAll('/GeneralLedgerAccounts', { accountNos: accountNos.join(',') }, { pageSize: 100, maxPages: 5 });
      for (const account of list) accounts.set(Number(account?.AccountNo), account);
      const codes = await client.listAll('/VatCodes', {}, { pageSize: 100, maxPages: 3 });
      for (const code of codes) vatCodes.set(text(code?.Code), code);
    } catch {
      // Uten tilgang til kontoplan eller MVA-koder: vis produktene uten MVA.
    }
  }
  return rows.map((row) => {
    const salesAccount = Number(row.StandardSalesAccount) || null;
    const account = salesAccount ? accounts.get(salesAccount) : null;
    const vatCode = text(account?.VatCode);
    const vat = vatCode ? vatCodes.get(vatCode) : null;
    return {
      code: text(row.Code),
      name: text(row.Name),
      salesAccount,
      vatCode,
      vatPercent: vat ? vatRatePercent(vat.Rate) : null,
    };
  });
}

export function customerRef(customerId) {
  return `${REF_PREFIX}-kunde-${text(customerId).replace(/[^\w.-]+/g, '').slice(0, 60)}`;
}

/**
 * Finn kunden i Go, eller opprett den.
 * Rekkefølge: lagret kobling → kundenummer → vår referanse → org.nr → ny kunde.
 * ProTop-kundene er importert fra PowerOffice, så kundenummeret treffer som regel.
 */
export async function resolveCustomer(client, { invoice, customer = null, known = null }) {
  const orgnr = text(customer?.orgnr || invoice?.orgnr).replace(/\s/g, '');
  const customerNumber = text(customer?.customerNumber || invoice?.customerNumber);
  const protopId = text(customer?.id || invoice?.customerId);

  if (known?.id) {
    const hit = await client.request('GET', `/Customers/${encodeURIComponent(known.id)}`);
    if (hit?.Id) return { customer: hit, created: false };
  }
  if (/^\d+$/.test(customerNumber)) {
    const list = await client.request('GET', '/Customers', { query: { customerNos: customerNumber } });
    const hit = matchCustomer(list, { orgnr, customerNumber });
    if (hit) return { customer: hit, created: false };
  }
  if (protopId) {
    const list = await client.request('GET', '/Customers', { query: { externalImportReference: customerRef(protopId) } });
    const hit = Array.isArray(list) ? list.find((row) => row?.ExternalImportReference === customerRef(protopId)) : null;
    if (hit) return { customer: hit, created: false };
  }
  if (orgnr) {
    const all = await client.listAll('/Customers', {}, { pageSize: 100, maxPages: 40 });
    const hit = matchCustomer(all, { orgnr });
    if (hit) return { customer: hit, created: false };
  }
  const built = customerPostFromProTop(customer || {
    name: invoice?.customerName,
    orgnr,
  }, { ref: protopId ? customerRef(protopId) : null, invoice });
  if (!built.ok) throw new Error(built.error);
  let created;
  try {
    created = await client.request('POST', '/Customers', { body: built.customer });
  } catch (err) {
    // EHF krever at mottakeren kan ta imot. Avviser Go det, opprettes kunden med papir.
    if (err?.status !== 400 || built.customer.InvoiceDeliveryType !== 'EHF') throw err;
    created = await client.request('POST', '/Customers', { body: { ...built.customer, InvoiceDeliveryType: 'Print' } });
  }
  if (!created?.Id) throw new Error('PowerOffice opprettet ikke kunden.');
  return { customer: created, created: true };
}

/** Let etter et utkast med vår referanse på hodet (etter et forsøk som ble avbrutt). */
async function findDraftByRef(client, customerNo, ref) {
  if (!customerNo) return null;
  const drafts = await client.request('GET', '/SalesOrders', { query: { customerNos: String(customerNo) } });
  return (Array.isArray(drafts) ? drafts : []).find((row) => row?.ExternalImportReference === ref) || null;
}

/**
 * Lag salgsordre (fakturautkast) i Go fra en ProTop-faktura.
 * Returnerer { patch, customerLink } som lagres på fakturaen og i integrasjonsstatusen.
 */
export async function transferInvoice(client, {
  invoice, customer = null, knownCustomer = null, productCodes = {}, again = false, at = new Date().toISOString(),
}) {
  const po = invoice?.poweroffice && typeof invoice.poweroffice === 'object' ? invoice.poweroffice : {};
  if (po.salesOrderId && po.state !== 'missing') {
    return { already: true, patch: null, customerLink: null };
  }
  if (po.state === 'missing' && !again) {
    throw new Error('Utkastet finnes ikke lenger i PowerOffice. Overfør på nytt bare hvis det ble slettet der.');
  }
  const attempt = (Number(po.attempt) || 0) + 1;
  const ref = salesOrderRef(invoice.id, attempt);

  // Sjekk produktene før vi gjør noe i Go.
  const dry = salesOrderFromInvoice(invoice, { customerId: -1, productCodes, ref });
  if (!dry.ok) throw new Error(dry.error);

  const { customer: poCustomer } = await resolveCustomer(client, { invoice, customer, known: knownCustomer });
  const built = salesOrderFromInvoice(invoice, { customerId: poCustomer.Id, productCodes, ref });
  if (!built.ok) throw new Error(built.error);

  let order;
  try {
    order = await client.request('POST', '/SalesOrders/Complete', { body: built.order });
  } catch (err) {
    // Referansen er unik per klient. Finnes den, ble utkastet laget i et tidligere forsøk.
    const existing = err?.status === 400 || err?.status === 409
      ? await findDraftByRef(client, poCustomer.Number, ref).catch(() => null)
      : null;
    if (!existing) throw err;
    order = existing;
  }
  if (!order?.Id) throw new Error('PowerOffice opprettet ikke utkastet.');
  const patch = invoicePatchAfterTransfer(invoice, order, { env: client.env, ref, customer: poCustomer, at });
  patch.poweroffice.attempt = attempt;
  return {
    already: false,
    patch,
    customerLink: { id: poCustomer.Id, no: poCustomer.Number ?? null },
  };
}

/**
 * Utkastet er borte. Ble det slått sammen, har et annet utkast (eller en sendt faktura)
 * linjer med vår referanse.
 */
async function findMerged(client, invoice) {
  const po = invoice.poweroffice || {};
  const ref = text(po.externalImportReference);
  if (!ref || !po.customerNo) return null;
  const ownsLine = (lines) => (Array.isArray(lines) ? lines : [])
    .some((line) => orderRefFromLineRef(line?.ExternalImportReference) === ref);

  const drafts = await client.request('GET', '/SalesOrders', { query: { customerNos: String(po.customerNo) } });
  for (const draft of (Array.isArray(drafts) ? drafts : []).slice(0, MERGE_SEARCH_LIMIT)) {
    if (!draft?.Id || draft.Id === po.salesOrderId) continue;
    const lines = await client.request('GET', `/SalesOrders/${encodeURIComponent(draft.Id)}/Lines`);
    if (ownsLine(lines)) return { kind: 'draft', id: draft.Id };
  }
  const since = text(po.transferredAt).slice(0, 10);
  const sent = await client.request('GET', '/OutgoingInvoices', {
    query: { customerNos: String(po.customerNo), ...(since ? { fromDate: since } : {}) },
  });
  for (const row of (Array.isArray(sent) ? sent : []).slice(0, MERGE_SEARCH_LIMIT)) {
    if (!row?.Id) continue;
    const lines = await client.request('GET', `/OutgoingInvoices/${encodeURIComponent(row.Id)}/Lines`);
    if (ownsLine(lines)) return { kind: 'sent', id: row.Id, outgoing: row };
  }
  return null;
}

function laterIso(a, b) {
  if (!a) return b || '';
  if (!b) return a;
  return new Date(b).getTime() > new Date(a).getTime() ? b : a;
}

/**
 * Synk fakturastatus fra Go.
 * - Utkast: GET /OutgoingInvoices?invoiceIds=… viser hvilke som er sendt.
 * - Sendte, ubetalte: balanceLastChangedDateTimeOffsetGreaterThan (anbefalt av PowerOffice),
 *   så vi bare henter fakturaer der restbeløpet er endret siden forrige synk.
 *
 * invoices: ProTop-fakturaer med poweroffice.salesOrderId.
 * Returnerer { patches: [{ id, patch }], cursor, counts }.
 */
export async function syncInvoices(client, { invoices = [], cursor = '', at = new Date().toISOString() }) {
  const patches = [];
  const counts = { checked: 0, sent: 0, paid: 0, merged: 0, missing: 0 };
  const tracked = invoices.filter((row) => text(row?.poweroffice?.salesOrderId));
  const drafts = tracked.filter((row) => row.poweroffice.state === 'draft');
  const open = tracked.filter((row) => row.poweroffice.state === 'sent');
  let nextCursor = text(cursor);

  const apply = (invoice, outgoing) => {
    const patch = invoicePatchFromOutgoing(invoice, outgoing, { at });
    patches.push({ id: invoice.id, patch });
    if (patch.poweroffice.state === 'paid') counts.paid += 1;
    else counts.sent += 1;
    nextCursor = laterIso(nextCursor, text(outgoing?.BalanceLastChangedDateTimeOffset));
  };

  // Uten markør vet vi ikke hva som har endret seg, så alle ubetalte sjekkes med id.
  const byId = cursor ? drafts : [...drafts, ...open];
  const found = new Map();
  for (const ids of chunk(byId.map((row) => row.poweroffice.salesOrderId), IDS_PER_CALL)) {
    const wanted = new Set(ids);
    const rows = await client.request('GET', '/OutgoingInvoices', { query: { invoiceIds: ids.join(',') } });
    for (const row of Array.isArray(rows) ? rows : []) {
      if (wanted.has(row?.Id)) found.set(row.Id, row);
    }
  }
  for (const invoice of byId) {
    counts.checked += 1;
    const outgoing = found.get(invoice.poweroffice.salesOrderId);
    if (outgoing) {
      apply(invoice, outgoing);
      continue;
    }
    if (invoice.poweroffice.state !== 'draft') continue;
    const order = await client.request('GET', `/SalesOrders/${encodeURIComponent(invoice.poweroffice.salesOrderId)}`);
    if (order?.Id) continue;
    const merged = await findMerged(client, invoice);
    if (merged?.kind === 'draft') {
      patches.push({ id: invoice.id, patch: invoicePatchMerged(invoice, merged.id, { at }) });
      counts.merged += 1;
    } else if (merged?.kind === 'sent') {
      const mergedInvoice = { ...invoice, poweroffice: invoicePatchMerged(invoice, merged.id, { at }).poweroffice };
      apply(mergedInvoice, merged.outgoing);
      counts.merged += 1;
    } else {
      patches.push({ id: invoice.id, patch: invoicePatchMissing(invoice, { at }) });
      counts.missing += 1;
    }
  }

  if (cursor && open.length) {
    const byOutgoing = new Map(open.map((row) => [text(row.poweroffice.outgoingInvoiceId || row.poweroffice.salesOrderId), row]));
    const changed = await client.listAll('/OutgoingInvoices', { balanceLastChangedDateTimeOffsetGreaterThan: cursor });
    for (const row of changed) {
      nextCursor = laterIso(nextCursor, text(row?.BalanceLastChangedDateTimeOffset));
      const invoice = byOutgoing.get(text(row?.Id));
      if (!invoice) continue;
      counts.checked += 1;
      apply(invoice, row);
    }
  }

  return { patches, cursor: nextCursor, counts };
}

function amount(value) {
  const n = Number(value);
  return value == null || value === '' || !Number.isFinite(n) ? null : n;
}

/**
 * Én sendt faktura i Go, slått opp på fakturanummer og lest på id slik synken gjør.
 * Lagrer ingenting. Brukes til å teste tilbakehentingen med en faktura laget i Go.
 */
export async function lookupOutgoingInvoice(client, { invoiceNo, at = new Date().toISOString() }) {
  const no = text(invoiceNo).replace(/\D/g, '');
  if (!no) throw new Error('Skriv inn fakturanummeret fra PowerOffice.');
  const list = await client.request('GET', '/OutgoingInvoices', { query: { invoiceNos: no } });
  const row = (Array.isArray(list) ? list : []).find((item) => text(item?.InvoiceNo) === no);
  if (!row) return { found: false, invoiceNo: no };
  const byId = row.Id != null ? await client.request('GET', `/OutgoingInvoices/${encodeURIComponent(row.Id)}`) : null;
  const outgoing = byId || row;
  const patch = invoicePatchFromOutgoing({}, outgoing, { at });
  return {
    found: true,
    invoiceNo: no,
    readById: !!byId,
    outgoing: {
      id: text(outgoing.Id),
      invoiceNo: text(outgoing.InvoiceNo),
      cid: text(outgoing.Cid),
      deliveryType: text(outgoing.InvoiceDeliveryType),
      sentDateTime: text(outgoing.SentDateTimeOffset),
      voucherDate: text(outgoing.VoucherDate).slice(0, 10),
      dueDate: text(outgoing.DueDate).slice(0, 10),
      totalAmount: amount(outgoing.TotalAmount),
      balance: amount(outgoing.Balance),
      customerNo: text(outgoing.CustomerNo),
      externalImportReference: text(outgoing.ExternalImportReference),
    },
    protop: {
      invoiceNumber: patch.invoiceNumber || '',
      kid: patch.kid || '',
      deliveryMethod: patch.deliveryMethod || '',
      sentAt: patch.sentAt || '',
      invoiceDate: patch.invoiceDate || '',
      dueDate: patch.dueDate || '',
      status: patch.status,
      outstandingAmount: patch.outstandingAmount,
    },
  };
}
