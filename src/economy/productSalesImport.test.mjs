import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildProductSalesImportReview,
  companyProductSaleRow,
  importProductSales,
  linkSaleImportPlanCustomer,
  linkSaleImportPlanProject,
  parseProductLabel,
  planProductSalesImport,
  productSaleColumnField,
  readProductSalesTable,
  saleFingerprint,
  saleStatusFromImport,
} from './productSalesImport.js';

assert.equal(productSaleColumnField('Dato'), 'date');
assert.equal(productSaleColumnField('Produkt'), 'product');
assert.equal(productSaleColumnField('Produktgruppe'), 'productGroup');
assert.equal(productSaleColumnField('Prosjektnummer'), 'projectNumber');
assert.equal(productSaleColumnField('Kundenummer'), 'customerNumber');
assert.equal(productSaleColumnField('Medarbeider'), 'employeeName');
assert.equal(productSaleColumnField('Salgspris (pr. enhet)'), 'unitPrice');
assert.equal(productSaleColumnField('Kjøpspris (pr. enhet)'), 'purchaseUnitPrice');
assert.equal(productSaleColumnField('Salgsbeløp eks. mva'), 'amountExVat');
assert.equal(productSaleColumnField('Salgs-MVA'), 'vatAmount');
assert.equal(productSaleColumnField('Regnskapskonto'), 'account');
assert.equal(productSaleColumnField('Inkludert i totalprisen'), 'includedInTotal');
assert.equal(parseProductLabel('#104 Fremleie').sku, '104');
assert.equal(parseProductLabel('#104 Fremleie').name, 'Fremleie');
assert.equal(saleStatusFromImport('Fakturert'), 'invoiced');

const customers = [
  { id: 'c-loy', customerNumber: '10226', name: 'RÅDGIVENDE INGENIØRER LØYNING AS' },
];
const projects = [
  { id: 'p-10844', number: '10844', name: 'Fremleie kontor Consult1 AS(Svanholmen 7) - Løyning', customerId: 'c-loy' },
];
const employees = [
  { id: 'e-geir', person: { firstName: 'Geir', lastName: 'Andersen' }, company: { status: 'active', externalEmployeeNumber: '7' } },
];

const raw = {
  date: '46310',
  period: '10.2026',
  title: 'Fremleie - oktober',
  product: '#104 Fremleie',
  projectNumber: '10844',
  projectName: 'Fremleie kontor Consult1 AS(Svanholmen 7) - Løyning',
  customerNumber: '10226',
  customerName: 'RÅDGIVENDE INGENIØRER LØYNING AS',
  employeeName: 'Geir Andersen',
  activityName: 'Hovedaktivitet',
  quantity: '3',
  unitPrice: '8500',
  amountExVat: '25500',
  vatAmount: '6375',
  amountInclVat: '31875',
  vat: '0.25',
  account: '3002 - Leieinntekter lokaler m/mva 25%',
  invoiced: 'Fakturert',
  includedInTotal: 'Nei',
  comment: 'Kopi og nett',
  _sourceValues: { Dato: '46310', Produkt: '#104 Fremleie' },
};

const planned = planProductSalesImport([], employees, customers, projects, [raw], []);
assert.equal(planned.rows.length, 1);
const row = planned.rows[0];
assert.equal(row.severity, 'ok', row.issues.join(' | '));
assert.equal(row.sale.date, '2026-10-15');
assert.equal(row.sale.sku, '104');
assert.equal(row.sale.name, 'Fremleie');
assert.equal(row.sale.customerId, 'c-loy');
assert.equal(row.sale.projectId, 'p-10844');
assert.equal(row.sale.employeeId, 'e-geir');
assert.equal(row.sale.account, '3002');
assert.equal(row.sale.vatCode, 'HIGH');
assert.equal(row.sale.amountExVat, 25500);
assert.equal(row.sale.amountInclVat, 31875);
assert.equal(row.sale.status, 'invoiced');
assert.equal(row.sale.comment, 'Kopi og nett');
assert.equal(row.sale.source.values.Produkt, '#104 Fremleie');

const saved = importProductSales({ products: [], sales: [], members: [], projects }, [row.sale]);
assert.equal(saved.added.length, 1);
assert.equal(saved.productsAdded.length, 1);
assert.equal(saved.productsAdded[0].sku, '104');
assert.equal(saved.productsAdded[0].trackStock, false);
assert.equal(saved.state.products[0].priceExVat, 8500);
assert.equal(saved.state.members.length, 1);
assert.equal(saved.state.members[0].employeeId, 'e-geir');
assert.equal(saved.added[0].importFingerprint, saleFingerprint(saved.added[0]));

const again = planProductSalesImport(saved.state.sales, employees, customers, projects, [raw], saved.state.products);
assert.equal(again.rows[0].severity, 'existing');
assert.equal(again.rows[0].duplicate, true);
const second = importProductSales(saved.state, [again.rows[0].sale]);
assert.equal(second.added.length, 0);
assert.equal(second.skipped.length, 1);

const unknown = companyProductSaleRow({
  ...raw,
  projectNumber: '99999',
  projectName: 'Ukjent prosjekt',
  customerNumber: '88888',
  customerName: 'Ukjent kunde AS',
  employeeName: '',
}, { employees, customers, projects, products: [] });
assert.equal(unknown.severity, 'review');
assert.equal(unknown.projectId, '');
assert.equal(unknown.customerId, '');
const linkedProject = linkSaleImportPlanProject({ rows: [unknown] }, 0, projects[0], { customers });
assert.equal(linkedProject.rows[0].projectId, 'p-10844');
const linkedCustomer = linkSaleImportPlanCustomer(linkedProject, 0, customers[0]);
assert.equal(linkedCustomer.rows[0].severity, 'ok', linkedCustomer.rows[0].issues.join(' | '));
assert.equal(linkedCustomer.rows[0].customerId, 'c-loy');

const review = buildProductSalesImportReview(again);
assert.equal(review.existingCount, 1);
assert.equal(review.readyCount, 0);

const fixture = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/productSales.xlsx');
const bytes = new Uint8Array(readFileSync(fixture));
const table = await readProductSalesTable(bytes, 'productSales.xlsx');
assert.equal(table.length, 182);
assert.equal(table[0].product, '#104 Fremleie');
assert.equal(table[0].customerNumber, '10226');
assert.equal(table[0].quantity, '3.00');
assert.ok(table[0]._sourceValues['Salgsbeløp ink. mva']);
const fromFile = planProductSalesImport([], [], [], [], table, []);
assert.equal(fromFile.rows.length, 182);
assert.equal(fromFile.rows[0].sale.name, 'Fremleie');
assert.equal(fromFile.rows[0].sale.sku, '104');
assert.equal(fromFile.rows[0].sale.quantity, 3);
assert.equal(fromFile.rows[0].sale.unitPrice, 8500);
assert.equal(fromFile.rows[0].sale.amountInclVat, 31875);
assert.equal(fromFile.rows[0].sale.status, 'invoiced');
assert.equal(fromFile.rows[0].sale.account, '3002');
const drone = fromFile.rows.find((item) => item.sale?.sku === '103');
assert.equal(drone.sale.name, 'Dronefotografering');
assert.equal(drone.sale.purchaseUnitPrice, 800);
assert.equal(drone.sale.salesCurrency, 'NOK');
