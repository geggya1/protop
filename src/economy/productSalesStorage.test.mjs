/**
 * Importert produktsalg lagres utenfor prosjekt-monolitten og slås sammen
 * uten å duplisere fingeravtrykk.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { importProductSales } from './productSalesImport.js';
import {
  isExternalSale,
  mergeRowsById,
  mergeSaleLists,
  productSalesToStore,
  withoutExternalSales,
} from './productSalesStorage.js';

const result = importProductSales({ products: [], sales: [], members: [] }, [{
  date: '2026-03-01',
  name: 'Fremleie',
  sku: '104',
  quantity: 2,
  unitPrice: 500,
  projectNumber: '10844',
  customerName: 'Løyning',
}]);
assert.equal(result.added.length, 1);

const stored = productSalesToStore(result.added);
assert.equal(stored.length, 1);
assert.equal(isExternalSale(stored[0]), true);
assert.equal(withoutExternalSales(stored).length, 0, 'eksterne salg skal ikke tilbake i prosjektbloben');
assert.equal(stored[0].importFingerprint, result.added[0].importFingerprint);

const again = mergeSaleLists(stored, stored, [{ ...stored[0], id: 'sal-annen' }]);
assert.equal(again.length, 1, 'samme fingeravtrykk er ett salg');

const other = productSalesToStore([{
  id: 'sal-2',
  date: '2026-03-02',
  name: 'Konsulent',
  quantity: 1,
  unitPrice: 100,
}]);
assert.equal(mergeSaleLists(stored, other).length, 2);

const products = mergeRowsById(
  [{ id: 'var-1', name: 'Eksisterende' }],
  [{ id: 'var-1', name: 'Skal ikke overskrive' }, { id: 'var-2', name: 'Ny' }],
);
assert.equal(products.length, 2);
assert.equal(products[0].name, 'Eksisterende');

const screen = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../screens/arbeid/ProductSalesScreen.jsx'), 'utf8');
const saveAt = screen.indexOf('await saveProductSales');
const toastAt = screen.indexOf('produktsalg er lagret');
assert.ok(saveAt > 0, 'importen skal skrive til productSales');
assert.ok(toastAt > saveAt, 'bekreftelse kommer etter lagring');
assert.equal(screen.includes('workspace.setState(result.state)'), false);

console.log('productSalesStorage.test.mjs ok');
