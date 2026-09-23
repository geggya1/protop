import assert from 'node:assert/strict';
import {
  VEHICLE_TYPES,
  isVehicleHolding,
  isHomeItemHolding,
  vehicleSummaryLine,
  vehicleDeadlines,
  vehicleLogTotal,
  dueTone,
  vehicleFormConfig,
  HOLDING_DOC_KINDS,
  cleanHoldingDocuments,
} from './familyHoldingsLogic.js';

assert.ok(VEHICLE_TYPES.some((t) => t.id === 'car'));
assert.ok(VEHICLE_TYPES.some((t) => t.id === 'bicycle'));
assert.ok(VEHICLE_TYPES.some((t) => t.id === 'boat'));
assert.ok(VEHICLE_TYPES.some((t) => t.id === 'escooter'));
assert.equal(VEHICLE_TYPES.find((t) => t.id === 'bicycle')?.label, 'Sykkel');
assert.equal(VEHICLE_TYPES.find((t) => t.id === 'boat')?.label, 'Båt');

assert.equal(isVehicleHolding({ kind: 'vehicle' }), true);
assert.equal(isVehicleHolding({ kind: 'item' }), false);
assert.equal(isVehicleHolding({ kind: 'home' }), false);
assert.equal(isVehicleHolding({ make: 'Volvo', model: 'XC60' }), true);
assert.equal(isHomeItemHolding({ kind: 'item', title: 'Vaskemaskin' }), true);
assert.equal(isHomeItemHolding({ kind: 'vehicle' }), false);
assert.equal(isHomeItemHolding({ kind: 'home' }), false);

assert.equal(
  vehicleSummaryLine({ make: 'Volvo', model: 'V90', year: '2019', regNumber: 'EL12345' }),
  'Volvo V90 · 2019 · EL12345',
);
assert.match(
  vehicleSummaryLine({ vehicleType: 'escooter', make: 'Xiaomi' }),
  /El-sparkesykkel/,
);

assert.equal(dueTone('2020-01-01', '2026-09-08'), 'overdue');
assert.equal(dueTone('2026-09-20', '2026-09-08'), 'soon');
assert.equal(dueTone('2027-01-01', '2026-09-08'), 'ok');

const deadlines = vehicleDeadlines({
  vehicleType: 'car',
  euControlKey: '2026-10-01',
  insuranceKey: '2026-08-01',
  nextServiceKey: '2026-12-01',
}, '2026-09-08');
assert.equal(deadlines[0].id, 'insurance');
assert.equal(deadlines[0].tone, 'overdue');
assert.equal(deadlines.find((d) => d.id === 'eu').tone, 'soon');

const bikeDeadlines = vehicleDeadlines({
  vehicleType: 'bicycle',
  euControlKey: '2026-10-01',
  insuranceKey: '2026-08-01',
}, '2026-09-08');
assert.ok(!bikeDeadlines.some((d) => d.id === 'eu'));
assert.ok(bikeDeadlines.some((d) => d.id === 'insurance'));

const bike = vehicleFormConfig('bicycle');
assert.equal(bike.showEu, false);
assert.equal(bike.showFuel, false);
assert.equal(bike.showMileage, false);
assert.equal(bike.showRegLookup, false);
assert.equal(bike.showPurchaseDate, true);
assert.ok(bike.logKinds.every((k) => k.id !== 'fuel'));

const boat = vehicleFormConfig('boat');
assert.equal(boat.showEu, false);
assert.equal(boat.showFuel, true);
assert.equal(boat.showPurchaseDate, true);
assert.equal(boat.defaultTitle, 'Båt');

const car = vehicleFormConfig('car');
assert.equal(car.showFuel, true);
assert.ok(car.fuels.some((f) => f.id === 'petrol'));
assert.ok(car.fuels.some((f) => f.id === 'diesel'));
assert.ok(String(car.formHint).length > 10);
assert.equal(car.mileageLabel, 'Kilometerstand');

assert.ok(String(bike.formHint).toLowerCase().includes('sykkel') || String(bike.formHint).toLowerCase().includes('ramme'));
assert.equal(bike.showRegLookup, false);
assert.match(bike.titlePlaceholder, /sykkel/i);

assert.equal(boat.mileageLabel, 'Motortimer (valgfritt)');
assert.equal(boat.showMileage, true);

const escooter = vehicleFormConfig('escooter');
assert.equal(escooter.showFuel, true);
assert.ok(escooter.fuels.every((f) => f.id === 'electric' || f.id === 'other'));
assert.equal(escooter.showMileage, false);


assert.ok(HOLDING_DOC_KINDS.some((d) => d.id === 'receipt'));
assert.ok(HOLDING_DOC_KINDS.some((d) => d.id === 'purchase'));

const docs = cleanHoldingDocuments([
  { kind: 'receipt', name: 'kvittering.pdf', downloadUrl: 'https://example/x', storagePath: 'a/b' },
  { kind: 'x', name: '', downloadUrl: '' },
]);
assert.equal(docs.length, 1);
assert.equal(docs[0].kind, 'receipt');

assert.equal(vehicleLogTotal([
  { kind: 'fuel', amount: 800 },
  { kind: 'cost', amount: 200 },
  { kind: 'fuel', amount: 50 },
], 'fuel'), 850);
assert.equal(vehicleLogTotal([{ amount: 10 }, { amount: 5 }]), 15);

console.log('familyHoldings.test.mjs ok');
