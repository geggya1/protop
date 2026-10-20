import assert from 'node:assert/strict';
import { saveCompanyInvoiceDefaults } from '../company/setupState.js';
import { emptyProjectState } from './engine.js';
import {
  effectiveCreditDays,
  normalizeProjectInvoiceSettings,
  resolveProjectInvoiceSettings,
  restoreProjectInvoiceDefaults,
  patchProjectInvoiceSetting,
} from './invoiceSettings.js';

const base = emptyProjectState();
const withCompany = saveCompanyInvoiceDefaults(base, {
  creditDays: 21,
  markupExpenseHourly: 15,
  introText: 'Takk for oppdraget.',
  ehfAlsoEmail: false,
}).state;

const project = {
  id: 'prj_1',
  name: 'Test',
  number: '100',
  invoiceSettings: {},
};

{
  const resolved = resolveProjectInvoiceSettings(withCompany, project);
  assert.equal(resolved.effective.creditDays, 21);
  assert.equal(resolved.effective.markupExpenseHourly, 15);
  assert.equal(resolved.effective.introText, 'Takk for oppdraget.');
  assert.equal(resolved.effective.ehfAlsoEmail, false);
  assert.equal(resolved.inheritsAll, true);
  assert.match(resolved.sourceLabel, /Økonomi/);
}

{
  const overridden = {
    ...project,
    invoiceSettings: normalizeProjectInvoiceSettings({
      creditDays: 14,
      theirReference: 'REF-9',
      markupExpenseHourly: null,
    }),
  };
  const resolved = resolveProjectInvoiceSettings(withCompany, overridden);
  assert.equal(resolved.effective.creditDays, 14);
  assert.equal(resolved.effective.markupExpenseHourly, 15);
  assert.equal(resolved.effective.theirReference, 'REF-9');
  assert.ok(resolved.overridden.includes('creditDays'));
  assert.equal(effectiveCreditDays(withCompany, overridden), 14);
}

{
  const patched = patchProjectInvoiceSetting(
    { creditDays: 10, theirReference: 'A' },
    'creditDays',
    'inherit',
  );
  assert.equal(patched.creditDays, null);
  assert.equal(patched.theirReference, 'A');
  const restored = restoreProjectInvoiceDefaults({
    creditDays: 10,
    introText: 'X',
    theirReference: 'Keep',
  });
  assert.equal(restored.creditDays, null);
  assert.equal(restored.introText, null);
  assert.equal(restored.theirReference, 'Keep');
}

console.log('invoiceSettings.test.mjs: ok');
