import assert from 'node:assert/strict';
import test from 'node:test';
import { saveIndexCache, slimIndexCache } from './storage.js';

function memoryStorage(options = {}) {
  const data = new Map();
  return {
    data,
    async getItem(key) { return data.has(key) ? data.get(key) : null; },
    async removeItem(key) { data.delete(key); },
    async setItem(key, value) {
      if (options.fail?.has(value.length)) {
        options.fail.delete(value.length);
        const error = new Error("Failed to execute 'setItem' on 'Storage': Setting the value of 'protop.indeksregulering.ssb.v1' exceeded the quota.");
        error.name = 'QuotaExceededError';
        throw error;
      }
      if (options.max != null && value.length > options.max) {
        const error = new Error('quota');
        error.name = 'QuotaExceededError';
        throw error;
      }
      data.set(key, value);
    },
  };
}

test('indekscachen kutter gamle punkt og kaster ikke når kvoten er full', async () => {
  const points = [];
  for (let year = 1990; year <= 2026; year += 1) points.push({ period: `${year}M01`, value: year });
  const bundle = {
    fetchedAt: '2026-10-20T12:00:00.000Z',
    series: {
      kpi: { id: 'kpi', name: 'KPI', table: '14710', points, latest: points.at(-1), source: 'lang tekst', url: 'https://www.ssb.no' },
    },
    history: Array.from({ length: 80 }, (_, index) => ({ id: index, note: 'x'.repeat(40) })),
  };
  const full = slimIndexCache(bundle);
  assert.equal(full.series.kpi.points[0].period, '1990M01');
  assert.equal(full.series.kpi.source, undefined);
  const recent = slimIndexCache(bundle, { minYear: 2021, historyLimit: 8 });
  assert.equal(recent.series.kpi.points[0].period, '2021M01');
  assert.equal(recent.history.length, 8);

  const huge = {
    series: Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`s${index}`, {
      id: `s${index}`,
      name: `Serie ${index}`,
      points: Array.from({ length: 800 }, (__, point) => ({ period: `${1900 + (point % 120)}M${String((point % 12) + 1).padStart(2, '0')}`, value: point })),
    }])),
  };
  const store = memoryStorage();
  const saved = await saveIndexCache(huge, store);
  assert.equal(saved.ok, true);
  const parsed = JSON.parse(store.data.get('protop.indeksregulering.ssb.v1'));
  assert.ok(parsed.series.s0.points.length < 800);
  assert.ok(saved.bytes <= 900_000);

  const blocked = memoryStorage({ max: 1 });
  const refused = await saveIndexCache(bundle, blocked);
  assert.equal(refused.ok, false);
  assert.equal(blocked.data.has('protop.indeksregulering.ssb.v1'), false);
});
