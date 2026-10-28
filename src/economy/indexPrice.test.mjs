import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReadyProjects } from './billingReady.js';

test('godkjent indekspris brukes på timer i perioden og ikke før', () => {
  const contracts = [{
    id: 'c',
    projectId: 'p',
    priceVersions: [{ id: 'pv', caseId: 'ir1', validFrom: '2026-04-01', validTo: '', rateExVat: 1388.41 }],
  }];
  const [ready] = buildReadyProjects({
    projects: [{ id: 'p', name: 'Breitorget', client: 'Kunde', pricingSettings: { hourlyRate: 1350 } }],
    timeEntries: [
      { id: 'old', projectId: 'p', employeeId: 'e1', date: '2026-03-01', hours: 2, status: 'godkjent' },
      { id: 'new', projectId: 'p', employeeId: 'e1', date: '2026-04-02', hours: 2, status: 'godkjent' },
    ],
    contracts,
    periodEnd: '2026-12-31',
    today: '2026-12-31',
  });
  const byId = Object.fromEntries(ready.hourGroups.flatMap((group) => group.entries.map((row) => [row.id, row._rate])));
  assert.equal(byId.old, 1350);
  assert.equal(byId.new, 1388.41);
  // Til fakturering viser hvor satsen kommer fra.
  const sources = Object.fromEntries(ready.hourGroups.flatMap((group) => group.entries.map((row) => [row.id, group.rateSource])));
  assert.deepEqual(sources, { old: 'project', new: 'contract' });
});
