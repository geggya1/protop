/**
 * PowerOffice Go: token, kall, mapping, overføring av utkast og synk av fakturastatus.
 * Ingen nettverk: fetch og API-klient er falske.
 */
import assert from 'node:assert/strict';
import {
  createPowerOfficeClient, findClientEnvironment, PowerOfficeError, powerOfficeErrorText, problemMessage, POWEROFFICE_ENVS,
} from './powerOfficeApi.js';
import {
  customerDelivery,
  customerPostFromProTop,
  invoicePatchAfterTransfer,
  invoicePatchFromOutgoing,
  invoicePatchMissing,
  matchCustomer,
  mergedInvoice,
  powerOfficeEvents,
  orderRefFromLineRef,
  salesOrderFromInvoice,
  salesOrderRef,
  sendRequestFromInvoice,
} from './powerOfficeMap.js';
import {
  attachmentFiles, attachToSalesOrder, customerRef, fetchInvoiceDocument, lookupOutgoingInvoice, productsWithVat,
  requestSend, sendFailedPatch, syncInvoices, transferInvoice, vatRatePercent,
} from './powerOfficeSync.js';
import { deflateRawSync } from 'node:zlib';
import { readZipEntries } from './zipEntries.js';

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
    text: async () => (body == null ? '' : JSON.stringify(body)),
  };
}

function fakeClock() {
  let t = 1_000_000;
  const slept = [];
  return {
    now: () => t,
    sleep: async (ms) => { slept.push(ms); t += ms; },
    advance: (ms) => { t += ms; },
    slept,
  };
}

// ── API-klient ──────────────────────────────────────────────────────────────
{
  const clock = fakeClock();
  const calls = [];
  let tokenCount = 0;
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === POWEROFFICE_ENVS.demo.tokenUrl) {
      tokenCount += 1;
      return jsonResponse(200, { access_token: `tok${tokenCount}`, expires_in: 1200 });
    }
    if (url.endsWith('/Customers/77')) return jsonResponse(404, null);
    if (url.includes('/Customers?')) return jsonResponse(200, [{ Id: 1 }]);
    return jsonResponse(500, { title: 'Feil', detail: 'Noe gikk galt' });
  };
  const client = createPowerOfficeClient({
    env: 'demo',
    applicationKey: 'app',
    clientKey: 'client',
    subscriptionKey: 'sub',
    fetchImpl,
    now: clock.now,
    sleep: clock.sleep,
  });
  const rows = await client.request('GET', '/Customers', { query: { customerNos: '10001', empty: '' } });
  assert.deepEqual(rows, [{ Id: 1 }]);
  const token = calls[0];
  assert.equal(token.init.method, 'POST');
  assert.equal(token.init.headers.Authorization, `Basic ${Buffer.from('app:client').toString('base64')}`);
  assert.equal(token.init.headers['Ocp-Apim-Subscription-Key'], 'sub');
  assert.equal(token.init.body, 'grant_type=client_credentials');
  const api = calls[1];
  assert.equal(api.url, 'https://goapi.poweroffice.net/demo/v2/Customers?customerNos=10001');
  assert.equal(api.init.headers.Authorization, 'Bearer tok1');
  assert.equal(api.init.headers['Ocp-Apim-Subscription-Key'], 'sub');

  // 404 på GET er «finnes ikke», ikke feil. Tokenet gjenbrukes.
  assert.equal(await client.request('GET', '/Customers/77'), null);
  assert.equal(tokenCount, 1);

  // Kallene spres slik at vi holder oss under 10 i sekundet.
  assert.ok(clock.slept.every((ms) => ms > 0));
  assert.ok(clock.slept.reduce((a, b) => a + b, 0) >= 2 * 110);

  await assert.rejects(client.request('POST', '/SalesOrders/Complete', { body: {} }), /Noe gikk galt · Feil/);

  // Utløpt token gir nytt token.
  clock.advance(1200 * 1000);
  await client.request('GET', '/Customers', { query: { customerNos: '1' } });
  assert.equal(tokenCount, 2);
}

{
  // 401 → nytt token og ett nytt forsøk. 429 → vent og prøv igjen.
  const clock = fakeClock();
  let tokens = 0;
  let hits = 0;
  const fetchImpl = async (url) => {
    if (url.includes('OAuth')) {
      tokens += 1;
      return jsonResponse(200, { access_token: `t${tokens}`, expires_in: 1200 });
    }
    hits += 1;
    if (hits === 1) return jsonResponse(401, null);
    if (hits === 2) return jsonResponse(429, null, { 'retry-after': '2' });
    return jsonResponse(200, { ok: true });
  };
  const client = createPowerOfficeClient({
    env: 'prod', applicationKey: 'a', clientKey: 'c', subscriptionKey: 's', fetchImpl, now: clock.now, sleep: clock.sleep,
  });
  assert.deepEqual(await client.request('GET', '/ClientIntegrationInformation'), { ok: true });
  assert.equal(tokens, 2);
  assert.ok(clock.slept.includes(2000));
}

{
  // Sider hentes til en side er kortere enn sidestørrelsen. PageNumber er 1-basert.
  const pages = [];
  const fetchImpl = async (url) => {
    if (url.includes('OAuth')) return jsonResponse(200, { access_token: 't', expires_in: 1200 });
    const page = Number(new URL(url).searchParams.get('PageNumber'));
    pages.push(page);
    return jsonResponse(200, page < 3 ? [{ n: page }, { n: page }] : [{ n: page }]);
  };
  const clock = fakeClock();
  const client = createPowerOfficeClient({
    applicationKey: 'a', clientKey: 'c', subscriptionKey: 's', fetchImpl, now: clock.now, sleep: clock.sleep,
  });
  const all = await client.listAll('/Products', { isArchived: false }, { pageSize: 2 });
  assert.equal(all.length, 5);
  assert.deepEqual(pages, [1, 2, 3]);
}

assert.throws(() => createPowerOfficeClient({ env: 'demo', clientKey: 'c' }), /ikke satt opp/);

{
  // Miljøet følger av klientnøkkelen: produksjon først, så testklienten.
  const keys = { prod: { applicationKey: 'pa', subscriptionKey: 'ps' }, demo: { applicationKey: 'da', subscriptionKey: 'ds' } };
  const created = [];
  const fakeClient = (accepts) => ({ env, clientKey }) => {
    created.push(env);
    return {
      request: async () => {
        if (env !== accepts) throw new PowerOfficeError('avvist', { status: 401 });
        return { ClientName: 'Invest AS - API Test Client' };
      },
    };
  };
  const demo = await findClientEnvironment('k', { keysFor: async (env) => keys[env], createClient: fakeClient('demo') });
  assert.equal(demo.env, 'demo');
  assert.equal(demo.info.ClientName, 'Invest AS - API Test Client');
  assert.deepEqual(created, ['prod', 'demo']);

  // Uten produksjonsnøkler hoppes produksjon over.
  created.length = 0;
  await findClientEnvironment('k', { keysFor: async (env) => (env === 'demo' ? keys.demo : {}), createClient: fakeClient('demo') });
  assert.deepEqual(created, ['demo']);

  await assert.rejects(
    findClientEnvironment('k', { keysFor: async (env) => keys[env], createClient: fakeClient('none') }),
    /avviste klientnøkkelen/,
  );
  await assert.rejects(findClientEnvironment('k', { keysFor: async () => ({}) }), /ikke tilgang/);

  // Andre feil (f.eks. nede) stopper søket i stedet for å prøve neste miljø.
  const down = () => ({ request: async () => { throw new PowerOfficeError('nede', { status: 503 }); } });
  await assert.rejects(findClientEnvironment('k', { keysFor: async (env) => keys[env], createClient: down }), /nede/);
}
assert.throws(() => createPowerOfficeClient({ env: 'x', applicationKey: 'a', clientKey: 'c', subscriptionKey: 's' }), /Ukjent/);
assert.equal(
  problemMessage({ title: 'Valideringsfeil', errors: { CustomerId: ['Påkrevd'] } }, 400),
  'Valideringsfeil · CustomerId: Påkrevd',
);
assert.match(problemMessage(null, 503), /opptatt/);

// ── Mapping ─────────────────────────────────────────────────────────────────
const invoice = {
  id: 'inv_10023',
  invoiceNumber: '10023',
  invoiceDate: '2026-10-20',
  periodEnd: '2026-10-19',
  customerId: 'c1',
  customerNumber: '10001',
  customerName: 'Kunde AS',
  orgnr: '999888777',
  customerReference: 'Ola',
  status: 'draft',
  exportStatus: 'utkast',
  kid: '100230',
  amountInclVat: 1250,
  outstandingAmount: 1250,
  lines: [
    { description: 'Befaring', quantity: 7.5, unitPrice: 1000, vatCode: 'HIGH' },
    { description: 'Merknad', quantity: 0, unitPrice: 0 },
    { description: 'Bompenger', quantity: 1, unitPrice: 54.333, vatCode: 'OUTSIDE' },
  ],
};
const productCodes = { HIGH: '1', OUTSIDE: '9' };

assert.equal(salesOrderRef('inv_10023'), 'ProTop-inv_10023');
assert.equal(salesOrderRef('inv_10023', 2), 'ProTop-inv_10023-2');
assert.equal(orderRefFromLineRef('ProTop-inv_10023-L3'), 'ProTop-inv_10023');
assert.equal(orderRefFromLineRef('noe annet'), '');

{
  const built = salesOrderFromInvoice(invoice, { customerId: 55, productCodes, ref: 'ProTop-inv_10023' });
  assert.equal(built.ok, true);
  const { order } = built;
  assert.equal(order.CustomerId, 55);
  assert.equal(order.ExternalImportReference, 'ProTop-inv_10023');
  assert.equal(order.SalesOrderDate, '2026-10-20');
  assert.equal(order.DeliveryDate, '2026-10-19');
  assert.equal(order.CustomerReference, 'Ola');
  assert.equal(order.SalesOrderLines.length, 3);
  assert.deepEqual(order.SalesOrderLines[0], {
    Description: 'Befaring',
    SortOrder: 0,
    ExternalImportReference: 'ProTop-inv_10023-L1',
    LineType: 'Normal',
    ProductCode: '1',
    Quantity: 7.5,
    ProductUnitPrice: 1000,
  });
  assert.equal(order.SalesOrderLines[1].LineType, 'Text');
  assert.equal(order.SalesOrderLines[1].ProductCode, undefined);
  assert.equal(order.SalesOrderLines[2].ProductCode, '9');
  assert.equal(order.SalesOrderLines[2].ProductUnitPrice, 54.33);

  const missing = salesOrderFromInvoice(invoice, { customerId: 55, productCodes: { HIGH: '1' }, ref: 'r' });
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missingVatCodes, ['OUTSIDE']);
  assert.match(missing.error, /OUTSIDE/);
  assert.equal(salesOrderFromInvoice({ lines: [] }, { customerId: 1, ref: 'r' }).ok, false);

  // Kredittiden i ProTop går som betalingsbetingelse. Uten kredittid bestemmer Go.
  assert.equal('PaymentTerm' in order, false);
  const term = (patch) => salesOrderFromInvoice({ ...invoice, ...patch }, { customerId: 55, productCodes, ref: 'r' }).order.PaymentTerm;
  assert.equal(term({ dueDateSet: true, creditDays: 14 }), 14);
  assert.equal(term({ dueDateSet: true, creditDays: 0 }), 0);
  assert.equal(term({ dueDateSet: true, creditDays: null }), undefined);
  assert.equal(term({ dueDateSet: false, creditDays: 28 }), 28);
  assert.equal(term({ creditDays: '' }), undefined);
}

{
  const customers = [
    { Id: 1, Number: 10001, OrganizationNumber: '111222333' },
    { Id: 2, Number: 10002, OrganizationNumber: '999 888 777' },
    { Id: 3, Number: 10003, OrganizationNumber: '' },
  ];
  assert.equal(matchCustomer(customers, { orgnr: '999888777', customerNumber: '10001' }).Id, 2);
  // Samme nummer, annet org.nr: ikke samme kunde.
  assert.equal(matchCustomer(customers, { orgnr: '444555666', customerNumber: '10001' }), null);
  assert.equal(matchCustomer(customers, { customerNumber: '10003' }).Id, 3);
}

{
  const sentInvoice = { ...invoice, poweroffice: { state: 'draft', salesOrderId: 'so-1' } };
  const outgoing = {
    Id: 'so-1',
    InvoiceNo: 20051,
    Cid: '200510000017',
    InvoiceDeliveryType: 'EHF',
    SentDateTimeOffset: '2026-10-22T09:15:00+02:00',
    VoucherDate: '2026-10-22',
    DueDate: '2026-11-05',
    Balance: 1300,
    BalanceLastChangedDateTimeOffset: '2026-10-22T09:15:00+02:00',
    TotalAmount: 1300,
    NetAmount: 1040,
    MatchId: 9,
  };
  const patch = invoicePatchFromOutgoing(sentInvoice, outgoing, { at: '2026-10-22T10:00:00Z' });
  assert.equal(patch.status, 'sent');
  assert.equal(patch.invoiceNumber, '20051');
  assert.equal(patch.kid, '200510000017');
  assert.equal(patch.deliveryMethod, 'ehf');
  assert.equal(patch.sentAt, '2026-10-22');
  assert.equal(patch.dueDate, '2026-11-05');
  assert.equal(patch.outstandingAmount, 1300);
  assert.equal(patch.amountInclVat, 1300);
  assert.equal(patch.vat, 260);
  assert.equal(patch.poweroffice.state, 'sent');
  assert.equal(patch.poweroffice.salesOrderId, 'so-1');
  assert.equal(patch.poweroffice.matchId, 9);

  const paid = invoicePatchFromOutgoing(sentInvoice, {
    ...outgoing, Balance: 0, BalanceLastChangedDateTimeOffset: '2026-11-01T08:00:00+01:00',
  }, { at: 'x' });
  assert.equal(paid.status, 'paid');
  assert.equal(paid.paidAt, '2026-11-01');
  assert.equal(paid.poweroffice.state, 'paid');

  // Sammenslått utkast: fakturaen i Go dekker flere ProTop-utkast. Beholder egne beløp.
  const merged = invoicePatchFromOutgoing(
    { ...sentInvoice, poweroffice: { ...sentInvoice.poweroffice, mergedFrom: 'so-0' } },
    outgoing,
    { at: 'x' },
  );
  assert.equal(merged.amountInclVat, undefined);
  assert.equal(merged.outstandingAmount, 1250);
  assert.equal(merged.invoiceNumber, '20051');
}

// ── Overføring og synk med falsk API-klient ─────────────────────────────────
function fakeClient(routes) {
  const log = [];
  const client = {
    env: 'demo',
    log,
    async request(method, path, { query = null, body } = {}) {
      log.push({ method, path, query, body });
      const handler = routes[`${method} ${path}`];
      if (!handler) return method === 'GET' ? null : {};
      return typeof handler === 'function' ? handler({ query, body }) : handler;
    },
    async listAll(path, query) {
      return (await client.request('GET', path, { query })) || [];
    },
    async upload(path, file) {
      return client.request('POST', path, { body: { file: file.name, mime: file.mime, size: file.bytes.length } });
    },
  };
  return client;
}

{
  // Kunden finnes med samme kundenummer og org.nr.
  const client = fakeClient({
    'GET /Customers': ({ query }) => (query.customerNos === '10001'
      ? [{ Id: 501, Number: 10001, OrganizationNumber: '999888777' }]
      : []),
    'POST /SalesOrders/Complete': ({ body }) => ({ Id: 'so-new', SalesOrderNo: 7, ...body }),
  });
  const result = await transferInvoice(client, { invoice, productCodes, at: '2026-10-27T08:00:00Z' });
  assert.equal(result.already, false);
  assert.deepEqual(result.customerLink, { id: 501, no: 10001 });
  const post = client.log.find((row) => row.method === 'POST');
  assert.equal(post.body.CustomerId, 501);
  assert.equal(post.body.ExternalImportReference, 'ProTop-inv_10023');
  assert.equal(result.patch.kid, '');
  assert.equal(result.patch.exportStatus, 'Overført til PowerOffice');
  assert.deepEqual(
    {
      state: result.patch.poweroffice.state,
      salesOrderId: result.patch.poweroffice.salesOrderId,
      orderNo: result.patch.poweroffice.orderNo,
      ref: result.patch.poweroffice.externalImportReference,
      attempt: result.patch.poweroffice.attempt,
      protop: result.patch.poweroffice.protopInvoiceNumber,
    },
    { state: 'draft', salesOrderId: 'so-new', orderNo: 7, ref: 'ProTop-inv_10023', attempt: 1, protop: '10023' },
  );

  // Allerede overført: ingen nye kall.
  const again = fakeClient({});
  const second = await transferInvoice(again, { invoice: { ...invoice, poweroffice: result.patch.poweroffice }, productCodes });
  assert.equal(second.already, true);
  assert.equal(again.log.length, 0);
}

{
  // Mangler produkt: stopper før noe skjer i Go.
  const client = fakeClient({});
  await assert.rejects(transferInvoice(client, { invoice, productCodes: { HIGH: '1' } }), /OUTSIDE/);
  assert.equal(client.log.length, 0);
}

{
  // Ukjent kunde: opprettes med vår referanse.
  const client = fakeClient({
    'GET /Customers': () => [],
    'POST /Customers': ({ body }) => ({ Id: 900, Number: 10500, ...body }),
    'POST /SalesOrders/Complete': () => ({ Id: 'so-2' }),
  });
  const customer = { id: 'c9', name: 'Ny Kunde AS', orgnr: '123456789', email: 'post@ny.no', address: 'Gate 1', postalCode: '4006', place: 'Stavanger' };
  const result = await transferInvoice(client, {
    invoice: { ...invoice, customerId: 'c9', customerNumber: '' }, customer, productCodes,
  });
  const created = client.log.find((row) => row.method === 'POST' && row.path === '/Customers');
  assert.equal(created.body.Name, 'Ny Kunde AS');
  assert.equal(created.body.OrganizationNumber, '123456789');
  assert.equal(created.body.ExternalImportReference, customerRef('c9'));
  assert.deepEqual(created.body.MailAddress, { AddressLine1: 'Gate 1', ZipCode: '4006', City: 'Stavanger', CountryCode: 'NO' });
  assert.equal(created.body.InvoiceDeliveryType, 'PdfByEmail');
  assert.equal(created.body.InvoiceEmailAddress, 'post@ny.no');
  assert.deepEqual(result.customerLink, { id: 900, no: 10500 });
}

{
  // Uten e-post: Go avviser kunden med e-post som forsendelse. EHF med org.nr.,
  // purring og inkassovarsel på papir. Adressen hentes fra fakturaen.
  const client = fakeClient({
    'GET /Customers': () => [],
    'POST /Customers': ({ body }) => ({ Id: 901, Number: 10501, ...body }),
    'POST /SalesOrders/Complete': () => ({ Id: 'so-3' }),
  });
  const customer = { id: 'c10', name: 'Hillevågsveien 59-63 AS', orgnr: '918269819' };
  await transferInvoice(client, {
    invoice: { ...invoice, customerId: 'c10', customerNumber: '', customerEmail: '', customerAddress: { street: 'Gate 2', postalCode: '4010', city: 'Stavanger', country: 'NO' } },
    customer,
    productCodes,
  });
  const created = client.log.find((row) => row.method === 'POST' && row.path === '/Customers');
  assert.equal(created.body.InvoiceDeliveryType, 'EHF');
  assert.equal(created.body.ReminderDeliveryType, 'Print');
  assert.equal(created.body.NoticeOfDebtCollectionDeliveryType, 'Print');
  assert.equal('InvoiceEmailAddress' in created.body, false);
  assert.deepEqual(created.body.MailAddress, { AddressLine1: 'Gate 2', ZipCode: '4010', City: 'Stavanger', CountryCode: 'NO' });
}

{
  // Avviser Go EHF, prøves kunden én gang til med papir.
  let tries = 0;
  const client = fakeClient({
    'GET /Customers': () => [],
    'POST /Customers': ({ body }) => {
      tries += 1;
      if (body.InvoiceDeliveryType === 'EHF') {
        const err = new Error('Customer is not an EHF receiver');
        err.status = 400;
        throw err;
      }
      return { Id: 902, Number: 10502, ...body };
    },
    'POST /SalesOrders/Complete': () => ({ Id: 'so-4' }),
  });
  const result = await transferInvoice(client, {
    invoice: { ...invoice, customerId: 'c11', customerNumber: '', customerEmail: '' },
    customer: { id: 'c11', name: 'Uten EHF AS', orgnr: '999888777' },
    productCodes,
  });
  assert.equal(tries, 2);
  assert.deepEqual(result.customerLink, { id: 902, no: 10502 });
  const posts = client.log.filter((row) => row.method === 'POST' && row.path === '/Customers');
  assert.equal(posts[1].body.InvoiceDeliveryType, 'Print');
}

// E-post på fakturaen holder når kunderegisteret mangler den. Person uten e-post: papir.
assert.equal(customerPostFromProTop({ name: 'A AS', orgnr: '918269819' }, { invoice: { customerEmail: 'f@a.no' } }).customer.InvoiceDeliveryType, 'PdfByEmail');
assert.equal(customerDelivery({ email: '', orgnr: '', isPerson: true }).InvoiceDeliveryType, 'Print');
assert.equal(customerDelivery({ orgnr: '918 269 819' }).InvoiceDeliveryType, 'EHF');

{
  // Forrige forsøk laget utkastet, men svaret kom aldri: referansen er tatt.
  const client = fakeClient({
    'GET /Customers/501': { Id: 501, Number: 10001 },
    'POST /SalesOrders/Complete': () => {
      const err = new Error('ExternalImportReference finnes allerede');
      err.status = 400;
      throw err;
    },
    'GET /SalesOrders': [{ Id: 'so-old', ExternalImportReference: 'ProTop-inv_10023' }],
  });
  const result = await transferInvoice(client, { invoice, knownCustomer: { id: 501 }, productCodes });
  assert.equal(result.patch.poweroffice.salesOrderId, 'so-old');
}

{
  // Borte i Go: krever bekreftelse og får ny referanse.
  const gone = { ...invoice, poweroffice: { state: 'missing', salesOrderId: 'so-x', attempt: 1 } };
  await assert.rejects(transferInvoice(fakeClient({}), { invoice: gone, productCodes }), /Overfør på nytt/);
  const client = fakeClient({
    'GET /Customers': [{ Id: 501, Number: 10001, OrganizationNumber: '999888777' }],
    'POST /SalesOrders/Complete': () => ({ Id: 'so-3' }),
  });
  const result = await transferInvoice(client, { invoice: gone, productCodes, again: true });
  assert.equal(result.patch.poweroffice.externalImportReference, 'ProTop-inv_10023-2');
  assert.equal(result.patch.poweroffice.attempt, 2);
}

{
  const tracked = (id, state, extra = {}) => ({
    id,
    amountInclVat: 1000,
    outstandingAmount: 1000,
    poweroffice: { state, salesOrderId: `so-${id}`, customerNo: 10001, externalImportReference: `ProTop-${id}`, transferredAt: '2026-10-20T10:00:00Z', ...extra },
  });
  const invoices = [
    tracked('a', 'draft'), // sendt i Go
    tracked('b', 'draft'), // fortsatt utkast
    tracked('c', 'draft'), // slått sammen med et annet utkast
    tracked('d', 'draft'), // slettet
    tracked('e', 'sent', { outgoingInvoiceId: 'so-e', cid: '22' }), // betalt siden forrige synk
    { id: 'f', poweroffice: {} },
  ];
  const client = fakeClient({
    'GET /OutgoingInvoices': ({ query }) => {
      if (query.invoiceIds) {
        // Filteret kan gi andre fakturaer også. Bare de vi spurte etter skal brukes.
        return [
          { Id: 'so-a', InvoiceNo: 1, Cid: '11', Balance: 1000, TotalAmount: 1000, NetAmount: 800, BalanceLastChangedDateTimeOffset: '2026-10-25T10:00:00Z' },
          { Id: 'so-zzz', InvoiceNo: 99, Balance: 5 },
        ];
      }
      if (query.balanceLastChangedDateTimeOffsetGreaterThan) {
        return [
          { Id: 'so-e', InvoiceNo: 2, Balance: 0, TotalAmount: 1000, NetAmount: 800, BalanceLastChangedDateTimeOffset: '2026-10-26T12:00:00Z' },
          { Id: 'not-ours', InvoiceNo: 3, Balance: 0, BalanceLastChangedDateTimeOffset: '2026-10-26T13:00:00Z' },
        ];
      }
      return [];
    },
    'GET /SalesOrders/so-b': { Id: 'so-b' },
    'GET /SalesOrders': [{ Id: 'so-merged' }],
    'GET /SalesOrders/so-merged/Lines': [{ ExternalImportReference: 'ProTop-c-L1' }],
  });
  const result = await syncInvoices(client, { invoices, cursor: '2026-10-24T00:00:00Z', at: 'now' });
  const byId = Object.fromEntries(result.patches.map((row) => [row.id, row.patch]));
  assert.deepEqual(Object.keys(byId).sort(), ['a', 'c', 'd', 'e']);
  assert.equal(byId.a.status, 'sent');
  assert.equal(byId.a.invoiceNumber, '1');
  assert.equal(byId.a.kid, '11');
  assert.equal(byId.c.poweroffice.salesOrderId, 'so-merged');
  assert.equal(byId.c.poweroffice.mergedFrom, 'so-c');
  assert.equal(byId.d.poweroffice.state, 'missing');
  assert.equal(byId.e.status, 'paid');
  assert.equal(result.cursor, '2026-10-26T13:00:00Z');
  assert.deepEqual(result.counts, { checked: 5, sent: 1, paid: 1, merged: 1, missing: 1, sending: 0, failed: 0 });
  const idQuery = client.log.find((row) => row.query?.invoiceIds);
  assert.equal(idQuery.query.invoiceIds, 'so-a,so-b,so-c,so-d');
}

{
  // Send fra ProTop: Auto-forsendelse, valgt dato og frist følger med, status «sendes».
  const client = fakeClient({ 'POST /SalesOrders/so-9/createAndSendInvoice': () => null });
  const draftInGo = {
    id: 'inv_9', customerEmail: 'faktura@kunde.no', invoiceDate: '2026-10-29', invoiceDateSet: true,
    dueDate: '2026-11-12', dueDateSet: true,
    poweroffice: { env: 'demo', state: 'draft', salesOrderId: 'so-9', orderNo: 2, sendError: 'gammel feil' },
  };
  const patch = await requestSend(client, { invoice: draftInGo, at: 't1' });
  const call = client.log.find((row) => row.method === 'POST');
  assert.equal(call.path, '/SalesOrders/so-9/createAndSendInvoice');
  assert.deepEqual(call.body, { DeliveryType: 'Auto', EmailAddress: 'faktura@kunde.no', VoucherDate: '2026-10-29', OverrideDueDate: '2026-11-12' });
  assert.equal(patch.poweroffice.state, 'sending');
  assert.equal(patch.poweroffice.sendRequestedAt, 't1');
  assert.equal(patch.poweroffice.sendError, '');
  assert.equal(patch.poweroffice.orderNo, 2);
  // Uten valgte datoer: Go bruker dagens dato og betalingsbetingelsen.
  assert.deepEqual(sendRequestFromInvoice({ invoiceDate: '2026-10-01', dueDate: '2026-10-15' }), { DeliveryType: 'Auto' });
  await assert.rejects(requestSend(client, { invoice: { poweroffice: { state: 'sent', salesOrderId: 'so-9' } } }), /Bare utkast/);
  const failed = sendFailedPatch(draftInGo, 'Integrasjonen mangler tilgang', { at: 't2' });
  assert.equal(failed.poweroffice.state, 'draft');
  assert.equal(failed.poweroffice.sendError, 'Integrasjonen mangler tilgang');
}

{
  // Synk av fakturaer som sendes: ferdig → sendt. Underveis → venter. Feilet → tilbake til utkast med feilen.
  const client = fakeClient({
    'GET /OutgoingInvoices': () => [{ Id: 'so-done', InvoiceNo: 30001, Cid: '300010000015', Balance: 500, TotalAmount: 500 }],
    'GET /SalesOrders/sentState': ({ query }) => (query.id === 'so-fail'
      ? [{ Id: 'so-fail', IsInvoiceBeingProcessed: false, LastErrorMessage: 'Mangler e-postadresse' }]
      : [{ Id: query.id, IsInvoiceBeingProcessed: true }]),
  });
  const rows = ['so-done', 'so-busy', 'so-fail'].map((id) => ({ id, poweroffice: { state: 'sending', salesOrderId: id } }));
  const result = await syncInvoices(client, { invoices: rows, cursor: 'c', at: 'now' });
  const byId = Object.fromEntries(result.patches.map((row) => [row.id, row.patch]));
  assert.equal(byId['so-done'].poweroffice.state, 'sent');
  assert.equal(byId['so-done'].invoiceNumber, '30001');
  assert.equal(byId['so-busy'], undefined);
  assert.equal(byId['so-fail'].poweroffice.state, 'draft');
  assert.equal(byId['so-fail'].poweroffice.sendError, 'Mangler e-postadresse');
  assert.equal(result.counts.sending, 1);
  assert.equal(result.counts.failed, 1);
  assert.equal(client.log.some((row) => row.path.startsWith('/SalesOrders/so-busy') && !row.path.includes('sentState')), false,
    'et utkast som sendes, tolkes ikke som slettet');
}

{
  // Uten markør: også sendte, ubetalte sjekkes med id.
  const client = fakeClient({
    'GET /OutgoingInvoices': ({ query }) => (query.invoiceIds ? [{ Id: 'so-e', InvoiceNo: 2, Balance: 400 }] : []),
  });
  const result = await syncInvoices(client, {
    invoices: [{ id: 'e', poweroffice: { state: 'sent', salesOrderId: 'so-e' } }],
    cursor: '',
  });
  assert.equal(result.patches.length, 1);
  assert.equal(result.patches[0].patch.outstandingAmount, 400);
  assert.equal(client.log.some((row) => row.query?.balanceLastChangedDateTimeOffsetGreaterThan), false);
}

{
  // KID mangler i listen: fakturaen leses på id første gang. Sendt uten KID sjekkes også med markør.
  const client = fakeClient({
    'GET /OutgoingInvoices': ({ query }) => (query.invoiceIds
      ? [{ Id: 'so-k', InvoiceNo: 10000, Balance: 215678.75, TotalAmount: 215678.75 }]
      : []),
    'GET /OutgoingInvoices/so-k': { Id: 'so-k', InvoiceNo: 10000, Cid: '8951100666', Balance: 215678.75, TotalAmount: 215678.75 },
  });
  const sent = { id: 'k', poweroffice: { state: 'sent', salesOrderId: 'so-k', outgoingInvoiceId: 'so-k' } };
  const result = await syncInvoices(client, { invoices: [sent], cursor: 'c', at: 'now' });
  assert.equal(result.patches[0].patch.kid, '8951100666');
  assert.equal(result.patches[0].patch.poweroffice.cid, '8951100666');
  // KID som er lagret, blir stående når listen mangler den.
  const kept = invoicePatchFromOutgoing({ poweroffice: { cid: '8951100666' } }, { Id: 'so-k', InvoiceNo: 10000, Balance: 0 }, { at: 'now' });
  assert.equal(kept.poweroffice.cid, '8951100666');
}

{
  // Produkter med salgskonto og MVA fra kontoplanen.
  assert.equal(vatRatePercent(0.25), 25);
  assert.equal(vatRatePercent(25), 25);
  assert.equal(vatRatePercent(0), 0);
  assert.equal(vatRatePercent(null), null);
  const client = fakeClient({
    'GET /Products': [
      { Code: '1', Name: 'Timer', StandardSalesAccount: 3000 },
      { Code: '2', Name: 'Utlegg fritatt', StandardSalesAccount: 3100 },
      { Code: '', Name: 'Uten kode' },
      { Code: '3', Name: 'Uten konto' },
    ],
    'GET /GeneralLedgerAccounts': ({ query }) => {
      assert.equal(query.accountNos, '3000,3100');
      return [{ AccountNo: 3000, VatCode: '3' }, { AccountNo: 3100, VatCode: '5' }];
    },
    'GET /VatCodes': [{ Code: '3', Rate: 0.25 }, { Code: '5', Rate: 0 }],
  });
  const products = await productsWithVat(client);
  assert.deepEqual(products, [
    { code: '1', name: 'Timer', salesAccount: 3000, vatCode: '3', vatPercent: 25 },
    { code: '2', name: 'Utlegg fritatt', salesAccount: 3100, vatCode: '5', vatPercent: 0 },
    { code: '3', name: 'Uten konto', salesAccount: null, vatCode: '', vatPercent: null },
  ]);

  // Uten tilgang til kontoplanen: produktene kommer likevel, uten MVA.
  const denied = fakeClient({
    'GET /Products': [{ Code: '1', Name: 'Timer', StandardSalesAccount: 3000 }],
    'GET /GeneralLedgerAccounts': () => { throw new Error('403'); },
  });
  assert.deepEqual(await productsWithVat(denied), [
    { code: '1', name: 'Timer', salesAccount: 3000, vatCode: '', vatPercent: null },
  ]);
}

{
  // Oppslag på fakturanummer: finner fakturaen, leser den på id og viser det ProTop ville lagret.
  const outgoing = {
    Id: 'so-77', InvoiceNo: 20077, Cid: '200770000012', InvoiceDeliveryType: 'EHF',
    SentDateTimeOffset: '2026-10-28T10:00:00+01:00', VoucherDate: '2026-10-28T00:00:00', DueDate: '2026-11-11T00:00:00',
    TotalAmount: 1250, Balance: 1250, CustomerNo: 10024,
  };
  const client = fakeClient({
    'GET /OutgoingInvoices': ({ query }) => (query.invoiceNos === '20077' ? [{ Id: 'so-77', InvoiceNo: 20077 }] : []),
    'GET /OutgoingInvoices/so-77': outgoing,
  });
  const found = await lookupOutgoingInvoice(client, { invoiceNo: ' 20077 ', at: 'x' });
  assert.equal(found.found, true);
  assert.equal(found.readById, true);
  assert.equal(found.outgoing.cid, '200770000012');
  assert.equal(found.outgoing.customerNo, '10024');
  assert.deepEqual(found.protop, {
    invoiceNumber: '20077', kid: '200770000012', deliveryMethod: 'ehf', sentAt: '2026-10-28',
    invoiceDate: '2026-10-28', dueDate: '2026-11-11', status: 'sent', outstandingAmount: 1250,
  });
  assert.equal(client.log.some((row) => row.method !== 'GET'), false, 'oppslaget endrer ingenting');
  assert.deepEqual(await lookupOutgoingInvoice(client, { invoiceNo: '999' }), { found: false, invoiceNo: '999' });
  await assert.rejects(lookupOutgoingInvoice(client, { invoiceNo: 'abc' }), /fakturanummeret/);
}

{
  // Fakturatekst, seksjonsoverskrifter og periode som på ProTop-fakturaen, pluss referanser og fakturaoppsett.
  const rich = {
    ...invoice,
    invoiceText: 'Gjelder prosjektering av Prismen.\nSe vedlagt spesifikasjon.',
    orderReference: 'PO-77',
    contractReference: 'K-2026-1',
    lines: [
      { section: 'trips', description: 'Kjøring Sandnes', quantity: 40, unitPrice: 4.5, vatCode: 'HIGH' },
      { section: 'hours', description: 'Geir Ove Andersen', quantity: 10.5, unitPrice: 1250, vatCode: 'HIGH', periodStart: '2026-02-01', periodEnd: '2026-02-28' },
      { section: 'hours', description: 'Håvard', quantity: 3.5, unitPrice: 1250, vatCode: 'HIGH', periodStart: '2026-01-05', periodEnd: '2026-03-20' },
    ],
  };
  const { order } = salesOrderFromInvoice(rich, { customerId: 55, productCodes, ref: 'R', brandingTheme: 'C1' });
  assert.deepEqual(order.SalesOrderLines.map((row) => [row.LineType, row.Description]), [
    ['Text', 'Gjelder prosjektering av Prismen.'],
    ['Text', 'Se vedlagt spesifikasjon.'],
    ['Text', 'Timer'],
    ['Normal', '02.2026 · Geir Ove Andersen'],
    ['Normal', '01.2026–03.2026 · Håvard'],
    ['Text', 'Kjøring'],
    ['Normal', 'Kjøring Sandnes'],
  ]);
  assert.deepEqual(order.SalesOrderLines.map((row) => row.SortOrder), [0, 1, 2, 3, 4, 5, 6]);
  // Linjereferansene følger ProTop-linjen, så sammenslåtte utkast fortsatt kan spores.
  assert.equal(order.SalesOrderLines[3].ExternalImportReference, 'R-L2');
  assert.equal(order.SalesOrderLines[6].ExternalImportReference, 'R-L1');
  assert.equal(new Set(order.SalesOrderLines.map((row) => row.ExternalImportReference)).size, 7);
  assert.equal(order.PurchaseOrderReference, 'PO-77');
  assert.equal(order.ContractNo, 'K-2026-1');
  assert.equal(order.BrandingThemeCode, 'C1');
  assert.equal('BrandingThemeCode' in salesOrderFromInvoice(invoice, { customerId: 55, productCodes, ref: 'R' }).order, false);
}

{
  // Vedlegg: navn renses, ukjent type blir binærfil, for store hoppes over, og én feil stopper ikke resten.
  const small = Buffer.from('%PDF-1.4 test').toString('base64');
  const big = Buffer.alloc(8 * 1024 * 1024, 1).toString('base64');
  const { files, skipped } = attachmentFiles([
    { name: 'Fakturaspesifikasjon.pdf', mime: 'application/pdf', base64: small },
    { name: 'kvittering/../a?.jpg', mime: 'image/jpeg', base64: small },
    { name: 'rart.bin', mime: 'text/html', base64: small },
    { name: 'stor.pdf', mime: 'application/pdf', base64: big },
    { name: 'tom.pdf', base64: '' },
  ]);
  assert.deepEqual(files.map((row) => [row.name, row.mime]), [
    ['Fakturaspesifikasjon.pdf', 'application/pdf'],
    ['kvittering-..-a-.jpg', 'image/jpeg'],
    ['rart.bin', 'application/octet-stream'],
  ]);
  assert.deepEqual(skipped, ['stor.pdf']);
  let calls = 0;
  const client = {
    async upload(path, file) {
      calls += 1;
      assert.equal(path, '/SalesOrders/so-1/Attachments');
      if (file.name === 'rart.bin') throw new Error('Filtypen støttes ikke');
      return { Id: calls };
    },
  };
  const result = await attachToSalesOrder(client, 'so-1', files);
  assert.deepEqual(result.added, ['Fakturaspesifikasjon.pdf', 'kvittering-..-a-.jpg']);
  assert.deepEqual(result.failed, [{ name: 'rart.bin', message: 'Filtypen støttes ikke' }]);
}

{
  // Opplasting går som multipart med feltet «file», med samme token og nøkkel som andre kall.
  const seen = [];
  const fetchImpl = async (url, init) => {
    if (String(url).includes('OAuth')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 1200 }), { status: 200 });
    seen.push({ url: String(url), init });
    return new Response(JSON.stringify({ Id: 9, FileName: 'a.pdf' }), { status: 201 });
  };
  const client = createPowerOfficeClient({ env: 'demo', applicationKey: 'a', clientKey: 'c', subscriptionKey: 's', fetchImpl, sleep: async () => {}, minIntervalMs: 0 });
  const out = await client.upload('/SalesOrders/so-1/Attachments', { name: 'a.pdf', mime: 'application/pdf', bytes: Buffer.from('pdf') });
  assert.equal(out.Id, 9);
  assert.match(seen[0].url, /\/demo\/v2\/SalesOrders\/so-1\/Attachments$/);
  assert.equal(seen[0].init.method, 'POST');
  assert.ok(seen[0].init.body instanceof FormData);
  const file = seen[0].init.body.get('file');
  assert.equal(file.name, 'a.pdf');
  assert.equal(file.type, 'application/pdf');
  assert.equal(seen[0].init.headers['Content-Type'], undefined, 'fetch setter multipart-grensen selv');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer tok');
}

// Feilteksten sier hvilket steg Go avviste.
assert.equal(
  powerOfficeErrorText(new PowerOfficeError('One or more validation errors occurred. · Name: required', { status: 400, path: '/Customers' })),
  'PowerOffice avviste kunden: One or more validation errors occurred. · Name: required',
);
assert.match(powerOfficeErrorText(new PowerOfficeError('x', { status: 422, path: '/SalesOrders/Complete' })), /^PowerOffice avviste fakturautkastet: x$/);
assert.equal(powerOfficeErrorText(new PowerOfficeError('PowerOffice er opptatt.', { status: 503, path: '/SalesOrders/Complete' })), 'PowerOffice er opptatt.');
assert.equal(powerOfficeErrorText(new PowerOfficeError('Nøklene mangler.')), 'Nøklene mangler.');
// Intern feil i Go (500): steget og kallet står med, så support kan finne det.
assert.equal(
  powerOfficeErrorText(new PowerOfficeError('Resolution failed · Internal Server Error', { status: 500, path: '/SalesOrders/Complete' })),
  'PowerOffice fikk en intern feil (500) på fakturautkastet (SalesOrders/Complete). Feilen ligger hos PowerOffice. Prøv igjen senere, eller send meldingen til PowerOffice: Resolution failed · Internal Server Error',
);
assert.match(powerOfficeErrorText(new PowerOfficeError('x', { status: 500, path: '/Customers' })), /intern feil \(500\) på kunden \(Customers\)/);

console.log('powerOffice.test ok');

// Påslag på linjen: PowerOffice får nettoprisen, så summen blir lik ProTop.
{
  const { salesOrderFromInvoice: build } = await import('./powerOfficeMap.js');
  const order = build({
    invoiceDate: '2026-10-27',
    lines: [
      { description: 'Utlegg', quantity: 1, unitPrice: 60807.21, netUnitPrice: 69928.2915, vatCode: 'HIGH' },
      { description: 'Timer', quantity: 10.5, unitPrice: 1090, netUnitPrice: 1090, vatCode: 'HIGH' },
    ],
  }, { customerId: 1, productCodes: { HIGH: 'P1' }, ref: 'protop:x' });
  assert.equal(order.ok, true);
  assert.equal(order.order.SalesOrderLines[0].ProductUnitPrice, 69928.2915);
  assert.equal(order.order.SalesOrderLines[1].ProductUnitPrice, 1090);
}

// ZIP med én deflate-fil og én lagret fil, med databeskrivelse (størrelse 0 i lokalt hode).
function zipOf(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data, store } of files) {
    const body = store ? data : deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 6);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

{
  const pdf = Buffer.from('%PDF-1.4 faktura 10000 '.repeat(50));
  const zip = zipOf([{ name: 'docs/10000.pdf', data: pdf }, { name: 'info.txt', data: Buffer.from('hei'), store: true }]);
  const entries = readZipEntries(zip);
  assert.deepEqual(entries.map((row) => row.name), ['docs/10000.pdf', 'info.txt']);
  assert.ok(entries[0].data.equals(pdf));
  assert.equal(entries[1].data.toString(), 'hei');
  assert.throws(() => readZipEntries(Buffer.from('ikke zip')), /ikke gyldig/);

  // Fakturadokumentet fra Go: ZIP pakkes ut, PDF-en får fakturanummeret i navnet.
  const asked = [];
  const client = {
    download: async (path, query) => {
      asked.push({ path, ...query });
      return query.documentationType === 'Pdf' ? { bytes: zip, contentType: 'application/zip', fileName: 'x.zip' } : null;
    },
  };
  const doc = await fetchInvoiceDocument(client, { outgoingInvoiceId: 'abc-1', invoiceNo: 10000 });
  assert.deepEqual(asked[0], { path: '/VoucherDocumentation/Download', id: 'abc-1', documentationType: 'Pdf' });
  assert.equal(doc.name, 'Faktura-10000.pdf');
  assert.equal(doc.mime, 'application/pdf');
  assert.ok(Buffer.from(doc.base64, 'base64').equals(pdf));
  await assert.rejects(fetchInvoiceDocument(client, { outgoingInvoiceId: 'abc-1', kind: 'ehf' }), /ingen EHF/);
  await assert.rejects(fetchInvoiceDocument(client, { outgoingInvoiceId: '' }), /ikke sendt/);
  // PDF rett (ikke ZIP) godtas. Annet innhold er ikke fakturaen.
  const plain = { download: async () => ({ bytes: pdf, contentType: 'application/pdf', fileName: '' }) };
  assert.equal((await fetchInvoiceDocument(plain, { outgoingInvoiceId: 'x' })).name, 'Faktura.pdf');
  const junk = { download: async () => ({ bytes: Buffer.from('<html>'), contentType: 'text/html', fileName: '' }) };
  await assert.rejects(fetchInvoiceDocument(junk, { outgoingInvoiceId: 'x' }), /Fant ikke/);
}

{
  // download: binært svar med filnavn, 404 gir null, 403 gir feil med status.
  const fetchImpl = async (url) => {
    if (url.includes('OAuth')) return jsonResponse(200, { access_token: 't', expires_in: 1200 });
    const id = new URL(url).searchParams.get('id');
    if (id === 'none') return jsonResponse(404, null);
    if (id === 'denied') return jsonResponse(403, { title: 'Missing privilege' });
    return {
      status: 200,
      ok: true,
      headers: { get: (name) => ({ 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="Faktura 1.zip"' })[name.toLowerCase()] ?? null },
      arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer,
    };
  };
  const clock = fakeClock();
  const client = createPowerOfficeClient({
    applicationKey: 'a', clientKey: 'c', subscriptionKey: 's', fetchImpl, now: clock.now, sleep: clock.sleep,
  });
  const file = await client.download('/VoucherDocumentation/Download', { id: 'ok', documentationType: 'Pdf' });
  assert.equal(file.fileName, 'Faktura 1.zip');
  assert.equal(file.contentType, 'application/zip');
  assert.deepEqual([...file.bytes], [80, 75, 3, 4]);
  assert.equal(await client.download('/VoucherDocumentation/Download', { id: 'none' }), null);
  await assert.rejects(client.download('/VoucherDocumentation/Download', { id: 'denied' }), (err) => err.status === 403);
}

{
  // Endringsloggen: hver bevegelse i PowerOffice blir en hendelse.
  const at = '2026-10-29T10:00:00.000Z';
  const draft = { id: 'inv1', status: 'draft', invoiceNumber: '' };
  const transferred = mergedInvoice(draft, invoicePatchAfterTransfer(draft, { Id: 'so1', SalesOrderNo: 3 }, {
    env: 'demo', ref: 'ProTop-inv1', customer: { Id: 9, Number: 10018 }, at,
  }));
  assert.deepEqual(powerOfficeEvents(draft, transferred), [
    { type: 'poweroffice', user: true, text: 'overførte utkastet til PowerOffice (testklient) som utkast nr. 3' },
  ]);
  const attached = mergedInvoice(transferred, { poweroffice: { attachmentsAddedAt: at, attachments: 2, attachmentErrors: 'kvittering.heic: for stor' } });
  assert.deepEqual(powerOfficeEvents(transferred, attached).map((row) => row.text), [
    'la ved 2 filer på utkastet i PowerOffice',
    'Vedlegg kom ikke med i PowerOffice: kvittering.heic: for stor',
  ]);
  const failed = mergedInvoice(attached, sendFailedPatch(attached, 'Missing privilege', { at }));
  const failedEvents = powerOfficeEvents(attached, failed);
  assert.equal(failedEvents.length, 1);
  assert.equal(failedEvents[0].user, false);
  assert.match(failedEvents[0].text, /^Sendingen fra PowerOffice feilet: Missing privilege/);
  // Samme feil på nytt gir ikke ny hendelse.
  assert.deepEqual(powerOfficeEvents(failed, failed), []);

  const sent = mergedInvoice(failed, invoicePatchFromOutgoing(failed, {
    Id: 'oi1', InvoiceNo: 10000, Cid: '8951100666', InvoiceDeliveryType: 'PdfByEmail', Balance: 215678.75,
    TotalAmount: 215678.75, NetAmount: 172543, VoucherDate: '2026-10-29', DueDate: '2026-11-12',
    SentDateTimeOffset: '2026-10-29T12:00:00+01:00',
  }, { at }));
  assert.deepEqual(powerOfficeEvents(failed, sent).map((row) => row.text), [
    'PowerOffice (testklient) sendte faktura 10000 som E-post (PDF) 29.10.2026 (KID 8951100666, fakturadato 29.10.2026, forfall 12.11.2026, 215 678,75 kr)',
  ]);
  const part = mergedInvoice(sent, { poweroffice: { balance: 100000 } });
  assert.deepEqual(powerOfficeEvents(sent, part).map((row) => row.text), ['Innbetaling registrert i PowerOffice, restbeløp 100 000,00 kr']);
  const paid = mergedInvoice(part, { status: 'paid', poweroffice: { state: 'paid', balance: 0 } });
  assert.deepEqual(powerOfficeEvents(part, paid).map((row) => row.type), ['payment']);
  // Sendt og betalt før første synk: begge hendelsene.
  assert.deepEqual(powerOfficeEvents(failed, paid).map((row) => row.type), ['delivery', 'payment']);

  const missing = mergedInvoice(transferred, invoicePatchMissing(transferred, { at }));
  assert.match(powerOfficeEvents(transferred, missing)[0].text, /finnes ikke lenger i PowerOffice/);
  const again = mergedInvoice(missing, invoicePatchAfterTransfer(missing, { Id: 'so2', SalesOrderNo: 4 }, {
    env: 'prod', ref: 'ProTop-inv1-2', customer: { Id: 9 }, at: '2026-10-29T11:00:00.000Z',
  }));
  assert.equal(powerOfficeEvents(missing, again)[0].text, 'overførte utkastet til PowerOffice på nytt som utkast nr. 4');
  assert.deepEqual(powerOfficeEvents({}, {}), []);
}

{
  // Automatisk synk: en bedrift som feiler, stopper ikke de andre, og feilen lagres på statusen.
  const { syncAllCompanies } = await import('./powerOffice.js');
  const writes = [];
  const db = {
    collection(path) {
      assert.equal(path, 'powerOfficeClients');
      return {
        where: () => ({
          get: async () => ({
            docs: [
              { id: 'uten-nokkel', data: () => ({ connected: true }) },
              { id: 'ogsa-uten', data: () => ({ connected: true }) },
            ],
          }),
        }),
      };
    },
    doc(path) {
      return { set: async (data) => { writes.push({ path, data }); } };
    },
  };
  const result = await syncAllCompanies(db);
  assert.deepEqual(result, { companies: 2, updated: 0, failed: 2 });
  assert.deepEqual(writes.map((row) => row.path), ['powerOfficeClients/uten-nokkel', 'powerOfficeClients/ogsa-uten']);
  assert.match(writes[0].data.lastAutoSyncError, /ikke koblet til/);
}
