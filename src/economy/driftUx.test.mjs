/**
 * UX-funn fra drift-testboten: EHF-dialogen sier hvorfor den bytter til e-post, og
 * sletting av prosjektutlegg krever bekreftelse og har merket «⋮»-knapp.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ehfUnavailableText } from './ehf.js';
import { expenseStatusLabel } from './expenseList.js';

test('EHF: tydelig grunn når aksesspunkt ikke er koblet', () => {
  assert.match(ehfUnavailableText({ orgnr: '948243113' }, { connected: false }), /ikke koblet til et aksesspunkt/);
  assert.match(ehfUnavailableText({ orgnr: '' }, { connected: true }), /mangler org\.nr/);
  assert.match(ehfUnavailableText({ orgnr: '948243113' }, { connected: true, receiver: { found: false } }), /Peppol-katalogen/);
  const dialog = readFileSync(new URL('../../screens/economy/invoice/InvoiceDialogs.jsx', import.meta.url), 'utf8');
  const effect = dialog.slice(dialog.indexOf('// Når EHF ikke kan brukes'), dialog.indexOf('const totals = invoiceTotals'));
  assert.ok(effect.indexOf('setEhfFallback(') < effect.indexOf("setChannel('email')"), 'grunnen settes før byttet');
  assert.match(dialog, /nativeID="invoice-ehf-fallback"/);
  assert.match(dialog, /Sendes på e-post fordi EHF ikke kan brukes/);
});

test('prosjektutlegg: sletting krever bekreftelse, og «⋮» har navn', () => {
  const tab = readFileSync(new URL('../../components/project/ProjectExpensesTab.jsx', import.meta.url), 'utf8');
  const remove = tab.slice(tab.indexOf('function remove(id)'), tab.indexOf('function exportCsv'));
  assert.ok(remove.indexOf('setConfirmId(id)') < remove.indexOf('deleteExpense('), 'første trykk spør');
  assert.match(tab, /accessibilityLabel=\{`Valg for utlegget \$\{row\.description \|\| ''\}`\.trim\(\)\}/);
  assert.match(tab, /Ja, slett/);
});

test('utleggsstatus vises på norsk', () => {
  assert.equal(expenseStatusLabel('draft'), 'Venter på godkjenning');
  assert.equal(expenseStatusLabel('submitted'), 'Venter på godkjenning');
  assert.equal(expenseStatusLabel('reimbursed'), 'Utbetalt');
});
