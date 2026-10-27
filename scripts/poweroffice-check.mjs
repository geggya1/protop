/**
 * Sjekk mot PowerOffice Go med de ekte nøklene, uten å gå via appen.
 * Bruker samme klient og mapping som Cloud Functions (functions/powerOffice*.js).
 *
 *   POWEROFFICE_APPLICATION_KEY=… POWEROFFICE_CLIENT_KEY=… POWEROFFICE_SUBSCRIPTION_KEY=… \
 *     node scripts/poweroffice-check.mjs [--env demo|prod] [--transfer] [--keep]
 *
 * Uten --transfer leses bare data. Med --transfer lages et testutkast hos første kunde
 * med første produkt. Utkastet leses tilbake og slettes etterpå (ikke med --keep).
 * Nøklene skrives aldri ut.
 */
import { createPowerOfficeClient } from '../functions/powerOfficeApi.js';
import { salesOrderFromInvoice } from '../functions/powerOfficeMap.js';

const args = process.argv.slice(2);
const env = args.includes('--env') ? args[args.indexOf('--env') + 1] : 'demo';
const transfer = args.includes('--transfer');
const keep = args.includes('--keep');

function need(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    console.error(`Mangler ${name}.`);
    process.exit(2);
  }
  return value;
}

const client = createPowerOfficeClient({
  env,
  applicationKey: need('POWEROFFICE_APPLICATION_KEY'),
  clientKey: need('POWEROFFICE_CLIENT_KEY'),
  subscriptionKey: need('POWEROFFICE_SUBSCRIPTION_KEY'),
});

let failed = false;
async function step(label, task) {
  try {
    const out = await task();
    console.log(`✅ ${label}${out ? `: ${out}` : ''}`);
    return true;
  } catch (err) {
    failed = true;
    console.log(`❌ ${label}: ${err?.message || err}${err?.status ? ` (HTTP ${err.status})` : ''}`);
    if (err?.problem && typeof err.problem === 'object') console.log(JSON.stringify(err.problem, null, 2).slice(0, 1500));
    return false;
  }
}

let info = null;
let products = [];
let customers = [];

await step(`Token (${env})`, async () => {
  await client.accessToken();
  return 'ok';
});
await step('ClientIntegrationInformation', async () => {
  info = await client.request('GET', '/ClientIntegrationInformation');
  const invalid = info?.InvalidPrivileges?.length ? ` · mangler: ${info.InvalidPrivileges.join(', ')}` : '';
  return `${info?.ClientName || '?'} · abonnementer: ${(info?.ActiveClientSubscriptions || []).join(', ') || '—'}${invalid}`;
});
await step('Produkter', async () => {
  products = (await client.request('GET', '/Products', { query: { isArchived: false, PageNumber: 1, PageSize: 100 } })) || [];
  return `${products.length} stk. ${products.slice(0, 8).map((row) => `${row.Code} ${row.Name}`).join(' | ')}`;
});
await step('Kunder', async () => {
  customers = (await client.request('GET', '/Customers', { query: { PageNumber: 1, PageSize: 100 } })) || [];
  return `${customers.length} stk. ${customers.slice(0, 5).map((row) => `${row.Number} ${row.Name}`).join(' | ')}`;
});
await step('Kundeoppslag på kundenummer (customerNos)', async () => {
  const first = customers.find((row) => row?.Number);
  if (!first) return 'ingen kunder å slå opp';
  const hit = await client.request('GET', '/Customers', { query: { customerNos: String(first.Number) } });
  if (!Array.isArray(hit) || !hit.some((row) => row.Id === first.Id)) throw new Error('fant ikke kunden igjen');
  return `${first.Number} → id ${first.Id}`;
});
await step('Utgående fakturaer (balanceLastChangedDateTimeOffsetGreaterThan)', async () => {
  const rows = await client.request('GET', '/OutgoingInvoices', {
    query: { balanceLastChangedDateTimeOffsetGreaterThan: '2000-01-01T00:00:00Z', PageNumber: 1, PageSize: 20 },
  });
  const row = Array.isArray(rows) ? rows[0] : null;
  return `${Array.isArray(rows) ? rows.length : 0} på første side${row ? ` · f.eks. nr ${row.InvoiceNo}, KID ${row.Cid || '—'}, ${row.InvoiceDeliveryType || '—'}, rest ${row.Balance}` : ''}`;
});

if (transfer) {
  const customer = customers.find((row) => row?.Id);
  const product = products.find((row) => row?.Code);
  if (!customer || !product) {
    console.log('❌ Testutkast: trenger minst én kunde og ett produkt i klienten.');
    failed = true;
  } else {
    const ref = `ProTop-test-${Date.now().toString(36)}`;
    const built = salesOrderFromInvoice({
      id: 'test',
      invoiceDate: new Date().toISOString().slice(0, 10),
      customerReference: 'ProTop test',
      lines: [
        { description: 'ProTop testlinje', quantity: 2, unitPrice: 100, vatCode: 'HIGH' },
        { description: 'Tekstlinje uten beløp' },
      ],
    }, { customerId: customer.Id, productCodes: { HIGH: product.Code }, ref });
    let orderId = '';
    await step(`Testutkast (POST /SalesOrders/Complete, kunde ${customer.Number}, produkt ${product.Code})`, async () => {
      const order = await client.request('POST', '/SalesOrders/Complete', { body: built.order });
      orderId = order?.Id || '';
      if (!orderId) throw new Error('svaret mangler Id');
      return `id ${orderId}, nr ${order.SalesOrderNo ?? '—'}, ref ${order.ExternalImportReference}`;
    });
    if (orderId) {
      await step('Linjene har vår referanse (GET /SalesOrders/{id}/Lines)', async () => {
        const lines = await client.request('GET', `/SalesOrders/${orderId}/Lines`);
        const refs = (Array.isArray(lines) ? lines : []).map((row) => row.ExternalImportReference);
        if (!refs.includes(`${ref}-L1`)) throw new Error(`fant ikke ${ref}-L1 (${refs.join(', ')})`);
        return refs.join(', ');
      });
      await step('Ikke sendt ennå (GET /OutgoingInvoices?invoiceIds=…)', async () => {
        const rows = await client.request('GET', '/OutgoingInvoices', { query: { invoiceIds: orderId } });
        const hit = (Array.isArray(rows) ? rows : []).find((row) => row.Id === orderId);
        if (hit) throw new Error('utkastet står allerede som faktura');
        return `ingen faktura med id ${orderId}`;
      });
      if (!keep) {
        await step('Slett testutkastet (DELETE /SalesOrders/{id})', async () => {
          await client.request('DELETE', `/SalesOrders/${orderId}`);
          const gone = await client.request('GET', `/SalesOrders/${orderId}`);
          if (gone?.Id) throw new Error('finnes fortsatt');
          return 'slettet';
        });
      } else {
        console.log(`ℹ️  Testutkastet ${orderId} er beholdt. Send det fra PowerOffice Go for å teste synk.`);
      }
    }
  }
}

process.exit(failed ? 1 : 0);
