import assert from 'node:assert/strict';
import { clearGroupChartCache, loadEntityFigures, loadGroupSources, mapPool } from './groupChartData.js';

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

console.log('groupChartData ok');
