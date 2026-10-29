import test from 'node:test';
import assert from 'node:assert/strict';
import { RATE_SOURCES, fetchRate, pageText, refreshRates } from './mileageRates.js';

const today = new Date('2026-10-29T12:00:00Z');

function fakeFetch(body, type = 'text/html') {
  return async () => ({
    ok: true,
    headers: { get: () => type },
    text: async () => body,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  });
}

test('satssider: tekst rundt kilometer, uten skript og merking', () => {
  const text = pageText('<script>x()</script><h1>Bilgodtgjørelse</h1><p>Sats: <b>3,50</b> kr per km</p>');
  assert.match(text, /Sats: 3,50 kr per km/);
  assert.doesNotMatch(text, /script|<b>/);
});

test('henter trekkfri sats via AI og godtar den når den er rimelig', async () => {
  const hit = await fetchRate('taxFree', {
    fetchImpl: fakeFetch('<p>Trekkfri sats er 3,50 kr per km</p>'),
    callModel: async (prompt, parts) => {
      assert.match(parts[0].text, /3,50 kr per km/);
      return { rate: '3,50', year: 2026, quote: 'Trekkfri sats er 3,50 kr per km' };
    },
    today,
  });
  assert.deepEqual({ rate: hit.rate, year: hit.year, source: hit.source }, { rate: 3.5, year: 2026, source: RATE_SOURCES.taxFree[0] });
});

test('statens sats leses fra PDF-en, og feillest sats avvises', async () => {
  const pdf = await fetchRate('state', {
    fetchImpl: fakeFetch('%PDF', 'application/pdf'),
    callModel: async (prompt, parts) => {
      assert.equal(parts[0].inline_data.mime_type, 'application/pdf');
      return { rate: 5.3, year: 2026 };
    },
    today,
  });
  assert.equal(pdf.rate, 5.3);
  await assert.rejects(fetchRate('state', { fetchImpl: fakeFetch('%PDF', 'application/pdf'), callModel: async () => ({ rate: 53, year: 2026 }), today }), /urimelig/);
});

test('en kilde som feiler, beholder forrige lagrede sats', async () => {
  const stored = { rates: { 2026: { state: 5.3, taxFree: 3.5 } } };
  const { rates, errors } = await refreshRates(stored, {
    fetchImpl: async (url) => {
      if (/skatteetaten/.test(url)) throw new Error('nede');
      return { ok: true, headers: { get: () => 'application/pdf' }, arrayBuffer: async () => new ArrayBuffer(4) };
    },
    callModel: async () => ({ rate: 5.3, year: 2026 }),
    today,
  });
  assert.equal(rates['2026'].state, 5.3);
  assert.equal(rates['2026'].taxFree, 3.5);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /taxFree/);
});
