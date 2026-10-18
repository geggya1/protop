import assert from 'node:assert/strict';
import test from 'node:test';
import { appendIndexHistory, indexIdsInDocument, nextSsbRecord } from './ledger.js';

test('daglig sjekk registrerer nytt punkt én gang', () => {
  const ids = indexIdsInDocument({
    contracts: [
      { fields: { indexId: 'ppi-byggeteknisk' } },
      { indexDraft: { indexId: 'kpi' } },
      { title: 'uten' },
    ],
  });
  assert.deepEqual(ids.sort(), ['kpi', 'ppi-byggeteknisk']);
  const first = nextSsbRecord(null, {
    series: {
      kpi: { name: 'KPI', table: '14710', latest: { period: '2026M08', value: 101 } },
    },
  }, '2026-10-17T05:00:00.000Z');
  assert.equal(first.news.length, 0);
  const second = nextSsbRecord(first, {
    series: {
      kpi: { name: 'KPI', table: '14710', latest: { period: '2026M09', value: 102 } },
    },
  }, '2026-10-18T05:00:00.000Z');
  assert.equal(second.news.length, 1);
  assert.equal(second.news[0].table, '14710');
  assert.equal(second.history.length, 1);
  assert.equal(appendIndexHistory(second.history, second.news, '2026-10-18T05:00:00.000Z').length, 1);
});
