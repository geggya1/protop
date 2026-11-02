import assert from 'node:assert/strict';
import { clearGroupChartCache, loadEntityFigures, loadGroupSources, mapPool } from './groupChartData.js';
import { entitySnapshot } from './groupChart.js';

clearGroupChartCache();

const calls = [];
const fetchImpl = async (url, init = {}) => {
  calls.push({ url, method: init.method || 'GET' });
  const json = (body, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  });
  if (url.includes('/underenheter?')) {
    return json({ _embedded: { underenheter: [{ organisasjonsnummer: '916570783', navn: 'CONSULT1 AS' }] } });
  }
  if (url.includes('/regnskapsregisteret/regnskap/')) {
    return json([{
      regnskapstype: 'SELSKAP',
      regnskapsperiode: { tilDato: '2025-12-31' },
      virksomhet: { morselskap: true },
      resultatregnskapResultat: {
        aarsresultat: 10,
        driftsresultat: { driftsinntekter: { sumDriftsinntekter: 2000000 } },
      },
    }]);
  }
  if (url.includes('/investments?')) {
    return json([{
      shareholderOrgnr: '916538804',
      holdings: { 2025: { total: 850 } },
      investment: {
        orgnr: '826514302',
        name: 'CONSULT1 SØR AS',
        shares: { 2025: { total: 1000 } },
      },
    }]);
  }
  if (url.includes('/investors?')) return json([]);
  if (url.includes('/company/')) return json([{ orgnr: '916538804', shares: { 2025: { total: 3000 } } }]);
  if (url.includes('/enheter/')) {
    return json({
      organisasjonsnummer: url.slice(-9),
      navn: 'CONSULT1 AS',
      antallAnsatte: 18,
      harRegistrertAntallAnsatte: true,
    });
  }
  return json(null, 404);
};

const sources = await loadGroupSources('916 538 804', { fetchImpl });
assert.equal(sources.entity.navn, 'CONSULT1 AS');
assert.equal(sources.investmentRows.length, 1);
assert.equal(sources.accountPayload[0].resultatregnskapResultat.aarsresultat, 10);
assert.ok(calls.some((row) => row.url.includes('https://data.brreg.no/enhetsregisteret/api/enheter/916538804')));
assert.ok(calls.some((row) => row.url.includes('https://aksjegrafen.com/api/investments?shareholderOrgnr=916538804')));
assert.ok(calls.some((row) => row.url.includes('https://data.brreg.no/regnskapsregisteret/regnskap/916538804')));

const cachedCalls = calls.length;
const again = await loadGroupSources('916538804', { fetchImpl });
assert.equal(again, sources);
assert.equal(calls.length, cachedCalls);

const child = await loadEntityFigures('826514302', { fetchImpl });
assert.equal(child.organisasjonsnummer, '826514302');
assert.equal(child.accountPayload[0].regnskapstype, 'SELSKAP');

const pooled = await mapPool([1, 2, 3, 4], 2, async (value) => value * 2);
assert.deepEqual(pooled, [2, 4, 6, 8]);

clearGroupChartCache();
const browserCalls = [];
const previousWindow = globalThis.window;
globalThis.window = {};
try {
  const browserFetch = async (url, init = {}) => {
    browserCalls.push(String(url));
    if (String(url).includes('regnskapsregisteret')) {
      throw new Error('Nettleseren skal ikke kalle Regnskapsregisteret direkte');
    }
    if (String(url).includes('/api/tender-proxy')) {
      assert.equal(init.method, 'POST');
      const body = JSON.parse(init.body);
      assert.equal(body.action, 'register');
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, accounts: [{ regnskapstype: 'SELSKAP', id: body.orgnr }] }),
      };
    }
    return fetchImpl(url, init);
  };
  const browserSources = await loadGroupSources('922336601', { fetchImpl: browserFetch });
  assert.equal(browserSources.accountPayload[0].id, '922336601');
  assert.equal(browserCalls.some((url) => url.includes('regnskapsregisteret')), false);
  assert.equal(browserCalls.some((url) => url.includes('/api/tender-proxy')), true);

  const childCalls = [];
  const childFetch = async (url, init = {}) => {
    childCalls.push(String(url));
    if (String(url).includes('regnskapsregisteret')) {
      throw new Error('Nettleseren skal ikke kalle Regnskapsregisteret direkte');
    }
    if (String(url).includes('/api/tender-proxy')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ ok: true, accounts: [{ regnskapstype: 'SELSKAP' }] }),
      };
    }
    return fetchImpl(url, init);
  };
  const browserChild = await loadEntityFigures('826514302', { fetchImpl: childFetch });
  assert.equal(browserChild.accountPayload[0].regnskapstype, 'SELSKAP');
  assert.equal(childCalls.some((url) => url.includes('regnskapsregisteret')), false);

  // Registeret er nede: proxyen sender accounts: null, og lagret historikk tar over.
  clearGroupChartCache();
  const downFetch = async (url, init = {}) => {
    if (String(url).includes('/api/tender-proxy')) {
      const body = JSON.parse(init.body);
      const payload = body.action === 'account-history'
        ? { ok: true, years: [
          { aar: 2023, fra: '2023-01-01', til: '2023-12-31', driftsinntekter: 100, aarsresultat: 10 },
          { aar: 2024, fra: '2024-01-01', til: '2024-12-31', driftsinntekter: 150, aarsresultat: 20 },
        ] }
        : { ok: true, accounts: null };
      return { ok: true, status: 200, json: async () => payload };
    }
    return fetchImpl(url, init);
  };
  const down = await loadEntityFigures('826514302', { fetchImpl: downFetch });
  const snap = entitySnapshot(down.accountPayload, null);
  assert.equal(snap.year, 2024);
  assert.equal(snap.revenue, 150);
  assert.equal(snap.result, 20);
  assert.equal(snap.prevRevenue, 100);
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
}

console.log('groupChartData ok');
