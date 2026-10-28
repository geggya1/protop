/**
 * Vegvesen: 429 og uventet svar fra det offentlige endepunktet går videre til
 * enkeltoppslag når VEGVESEN_API_KEY finnes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { HttpsError } from 'firebase-functions/v2/https';
import { lookupPlate, publicLookupFallback } from './vegvesenLookup.js';

const RAW = { kjoretoyId: { kjennemerke: 'AB12345' }, godkjenning: {} };

function fakeFetch({ publicStatus = 200, publicBody = {}, keyBody = { kjoretoydataListe: [RAW] }, keyStatus = 200 }) {
  const calls = [];
  const impl = async (url) => {
    calls.push(String(url));
    if (String(url).includes('kjoretoyoppslag.atlas.vegvesen.no')) {
      return { status: publicStatus, ok: publicStatus >= 200 && publicStatus < 300, json: async () => publicBody };
    }
    return { status: keyStatus, ok: keyStatus >= 200 && keyStatus < 300, json: async () => keyBody };
  };
  return { impl, calls };
}

async function withKey(key, fn) {
  const prev = process.env.VEGVESEN_API_KEY;
  if (key) process.env.VEGVESEN_API_KEY = key;
  else delete process.env.VEGVESEN_API_KEY;
  try {
    return await fn();
  } finally {
    if (prev === undefined) delete process.env.VEGVESEN_API_KEY;
    else process.env.VEGVESEN_API_KEY = prev;
  }
}

test('hvilke feil som prøver API-nøkkelen', () => {
  assert.equal(publicLookupFallback(new HttpsError('resource-exhausted', '429')), true);
  assert.equal(publicLookupFallback(new HttpsError('not-found', 'nei')), false);
  assert.equal(publicLookupFallback(Object.assign(new Error('x'), { unexpectedFormat: true })), true);
  assert.equal(publicLookupFallback(new Error('public HTTP 500')), true);
});

test('429 faller tilbake til enkeltoppslag når nøkkelen finnes', async () => {
  const { impl, calls } = fakeFetch({ publicStatus: 429 });
  const res = await withKey('nokkel', () => lookupPlate('AB12345', 'u1', { fetchImpl: impl }));
  assert.equal(res.source, 'vegvesen.enkeltoppslag');
  assert.equal(calls.length, 2);
});

test('uventet svarformat faller tilbake til enkeltoppslag', async () => {
  const { impl } = fakeFetch({ publicBody: { noe: 'annet' } });
  const res = await withKey('nokkel', () => lookupPlate('AB12345', 'u1', { fetchImpl: impl }));
  assert.equal(res.source, 'vegvesen.enkeltoppslag');
});

test('uten nøkkel: 429 forblir resource-exhausted, tomt svar blir not-found', async () => {
  await withKey('', async () => {
    await assert.rejects(
      lookupPlate('AB12345', 'u1', { fetchImpl: fakeFetch({ publicStatus: 429 }).impl }),
      (err) => err.code === 'resource-exhausted',
    );
    await assert.rejects(
      lookupPlate('AB12345', 'u1', { fetchImpl: fakeFetch({ publicBody: {} }).impl }),
      (err) => err.code === 'not-found',
    );
  });
});

test('kjøretøy som ikke finnes, prøver ikke nøkkelen', async () => {
  const { impl, calls } = fakeFetch({ publicStatus: 404 });
  await withKey('nokkel', async () => {
    await assert.rejects(lookupPlate('AB12345', 'u1', { fetchImpl: impl }), (err) => err.code === 'not-found');
  });
  assert.equal(calls.length, 1);
  const meldt = fakeFetch({ publicBody: { feilmelding: 'Fant ikke kjøretøy' } });
  await withKey('nokkel', async () => {
    await assert.rejects(lookupPlate('AB12345', 'u1', { fetchImpl: meldt.impl }), (err) => err.code === 'not-found');
  });
  assert.equal(meldt.calls.length, 1);
});

test('offentlig treff brukes direkte', async () => {
  const { impl, calls } = fakeFetch({ publicBody: { kjoretoydataListe: [RAW] } });
  const res = await withKey('nokkel', () => lookupPlate('AB12345', 'u1', { fetchImpl: impl }));
  assert.equal(res.source, 'vegvesen.public');
  assert.equal(calls.length, 1);
});
