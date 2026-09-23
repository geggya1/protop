import assert from 'node:assert/strict';
import {
  pantryKey,
  pantryExpiryStatus,
  pantryLocationForShoppingCategory,
  findMergeablePantryItem,
  PANTRY_LOCATIONS,
} from './pantryLogic.js';

assert.equal(pantryKey(' Melk ', 'L'), 'melk|l');
assert.equal(pantryKey('Melk', 'L'), pantryKey('  melk ', 'l'));

assert.equal(pantryExpiryStatus(null, '2026-09-07'), null);
assert.equal(pantryExpiryStatus('2026-09-01', '2026-09-07').kind, 'expired');
assert.equal(pantryExpiryStatus('2026-09-07', '2026-09-07').kind, 'today');
assert.equal(pantryExpiryStatus('2026-09-09', '2026-09-07').kind, 'soon');
assert.equal(pantryExpiryStatus('2026-10-01', '2026-09-07').kind, 'ok');

assert.equal(pantryLocationForShoppingCategory('frozen'), 'freezer');
assert.equal(pantryLocationForShoppingCategory('dairy'), 'fridge');
assert.equal(pantryLocationForShoppingCategory('bread'), 'pantry');
assert.equal(pantryLocationForShoppingCategory('household'), 'other');

const stock = [
  { id: '1', name: 'Melk', amountUnit: 'L', barcode: '123' },
  { id: '2', name: 'Brød', amountUnit: '' },
];
assert.equal(findMergeablePantryItem(stock, { name: 'Annet', barcode: '123' }).id, '1');
assert.equal(findMergeablePantryItem(stock, { name: 'Brød' }).id, '2');
assert.equal(findMergeablePantryItem(stock, { name: 'Ost' }), null);

assert.ok(PANTRY_LOCATIONS.some((l) => l.id === 'fridge'));

console.log('pantryLogic ok');
