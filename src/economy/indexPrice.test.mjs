import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBillingProposals, draftPriceWarnings } from './billingFromHours.js';

test('godkjent indekspris brukes på timer i perioden og ikke før', () => {
  const state = {
    projects: [{ id: 'p', name: 'Breitorget', pricingSettings: { hourlyRate: 1350 } }],
    timeEntries: [
      { id: 'old', projectId: 'p', date: '2026-03-01', hours: 2, status: 'godkjent' },
      { id: 'new', projectId: 'p', date: '2026-04-02', hours: 2, status: 'godkjent' },
    ],
  };
  const contracts = [{
    id: 'c',
    projectId: 'p',
    priceVersions: [{ id: 'pv', caseId: 'ir1', validFrom: '2026-04-01', validTo: '', rateExVat: 1388.41 }],
  }];
  const [group] = buildBillingProposals(state, { contracts });
  const byId = Object.fromEntries(group.entries.map((row) => [row.id, row._rate]));
  assert.equal(byId.old, 1350);
  assert.equal(byId.new, 1388.41);
});

test('sendt faktura får ikke prisvarsel, utkast gjør det', () => {
  const contracts = [{
    id: 'c',
    projectId: 'p',
    priceVersions: [{ id: 'pv', validFrom: '2026-04-01', validTo: '', rateExVat: 1388.41 }],
  }];
  const notes = draftPriceWarnings([
    {
      id: 'sent',
      status: 'sent',
      sentAt: '2026-04-02',
      projectId: 'p',
      invoiceDate: '2026-04-02',
      lines: [{ unit: 't', unitPrice: 1350 }],
    },
    {
      id: 'draft',
      status: 'draft',
      projectId: 'p',
      invoiceDate: '2026-04-02',
      invoiceNumber: '100',
      lines: [{ unit: 't', unitPrice: 1350 }],
    },
  ], contracts);
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /100/);
  assert.match(notes[0].message, /1388\.41/);
});
