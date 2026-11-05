import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerPricePatch, customerPriceSummary, customerPrices, hasCustomerPrices, withCustomerPrices,
} from './customerPrices.js';
import { resolveHourlyRate } from '../economy/hourlyRate.js';
import { customerInvoiceFields } from '../anbud/customers.js';
import { clonePricing, cloneRateMissing } from '../intercompany/model.js';

test('kundepriser: tomt er ikke satt, tall leses med komma', () => {
  assert.deepEqual(customerPrices({}), { hourlyRate: null, discountHours: null, discountProducts: null, discountRental: null });
  assert.equal(hasCustomerPrices({ hourlyRate: '' }), false);
  const p = customerPrices({ hourlyRate: '1 050,5', discountHours: '10', discountProducts: 0, discountRental: '150' });
  assert.equal(p.hourlyRate, 1050.5);
  assert.equal(p.discountHours, 10);
  assert.equal(p.discountProducts, 0);
  assert.equal(p.discountRental, 100);
  assert.equal(customerPricePatch({ hourlyRate: '' }).hourlyRate, '');
  assert.match(customerPriceSummary({ hourlyRate: 1050, discountHours: 10 }), /kr\/t · 10 % rabatt timer/);
});

test('kundepriser lagres på kunden, tomt felt fjernes', () => {
  assert.deepEqual(customerInvoiceFields({ hourlyRate: '990', discountHours: '' }), { hourlyRate: 990 });
});

test('timepris: prosjektet, så kunden, så selskapet', () => {
  const customer = { hourlyRate: 1000 };
  assert.deepEqual(resolveHourlyRate({ project: { pricingSettings: { hourlyRate: 1200 } }, customer }), { rate: 1200, source: 'project' });
  assert.deepEqual(resolveHourlyRate({ project: { pricingSettings: {} }, customer }), { rate: 1000, source: 'customer' });
  assert.deepEqual(
    resolveHourlyRate({ project: {}, customer: {}, earnings: { variables: { defaultBillableRate: 800 } } }),
    { rate: 800, source: 'company' },
  );
});

test('rabatter: prosjektets egne står, ellers kundens foran selskapets', () => {
  const company = { discountHours: 0, discountProducts: 5 };
  const customer = { discountHours: 10, discountProducts: 15, discountRental: 20 };
  const plain = withCustomerPrices(company, { project: {}, customer });
  assert.equal(plain.discountHours, 10);
  assert.equal(plain.discountProducts, 15);
  assert.equal(plain.discountRental, 20);
  const own = withCustomerPrices({ ...company, discountHours: 3 }, { project: { invoiceSettings: { discountHours: 3 } }, customer });
  assert.equal(own.discountHours, 3);
  assert.equal(withCustomerPrices(company, { project: {}, customer: null }).discountProducts, 5);
});

test('konsern: kundekortet hos leverandøren gjelder foran avtalens standardpriser', () => {
  const settings = { hours: { mode: 'discount', discountPercent: 10 }, products: { discountPercent: 5 }, rental: { discountPercent: 7 } };
  const ownerProject = { pricingSettings: { hourlyRate: 1000 } };
  const fromLink = clonePricing({ settings, ownerProject });
  assert.equal(fromLink.pricingSettings.hourlyRate, 1000);
  assert.equal(fromLink.invoiceSettings.discountHours, 10);
  assert.equal(fromLink.rentalDiscountPercent, 7);

  const customer = { hourlyRate: 900, discountRental: 12 };
  const fromCustomer = clonePricing({ settings, ownerProject, customer });
  assert.equal(fromCustomer.pricingSettings.hourlyRate, null, 'tomt på kopien, så kundens pris brukes');
  assert.equal(fromCustomer.invoiceSettings.discountHours, null);
  assert.equal(fromCustomer.invoiceSettings.discountProducts, 5, 'det kundekortet ikke har, tas fra avtalen');
  assert.equal(fromCustomer.rentalDiscountPercent, 12);
  assert.equal(cloneRateMissing({ settings, ownerProject: {}, customer }), false);
  assert.equal(cloneRateMissing({ settings, ownerProject: {} }), true);
});
