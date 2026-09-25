import assert from 'node:assert/strict';
import {
  fetchPublicCompany,
  nbDate,
  nok,
  registerRows,
  shapePublicAccounts,
  shapePublicCompany,
  shapePublicRoles,
  shapePublicSignature,
  shapePublicUnits,
  weatherQuery,
} from './companyPublic.js';

const enhet = {
  organisasjonsnummer: '916538804',
  navn: 'CONSULT1 AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  hjemmeside: 'www.consult1.no',
  epostadresse: 'post@consult1.no',
  telefon: '52 05 52 10',
  stiftelsesdato: '2016-01-01',
  registreringsdatoEnhetsregisteret: '2016-01-11',
  maalform: 'Bokmål',
  institusjonellSektorkode: { kode: '2100', beskrivelse: 'Private aksjeselskaper mv.' },
  erIKonsern: true,
  vedtektsfestetFormaal: ['Eiendom og investering.'],
  aktivitet: ['Byggteknisk konsulentvirksomhet.'],
  naeringskode1: { kode: '71.121', beskrivelse: 'Byggeteknisk konsulentvirksomhet' },
  antallAnsatte: 19,
  harRegistrertAntallAnsatte: true,
  registrertIMvaregisteret: true,
  registrertIForetaksregisteret: true,
  konkurs: false,
  underAvvikling: false,
  sisteInnsendteAarsregnskap: '2025',
  forretningsadresse: {
    land: 'Norge',
    postnummer: '4313',
    poststed: 'SANDNES',
    adresse: ['2 Etasje', 'Svanholmen 7'],
    kommune: 'SANDNES',
  },
  kapital: { belop: 100000, antallAksjer: 3000, type: 'Aksjekapital', valuta: 'NOK' },
};

const company = shapePublicCompany(enhet);
assert.equal(company.navn, 'CONSULT1 AS');
assert.equal(company.organisasjonsform, 'Aksjeselskap');
assert.equal(company.ansatte, 19);
assert.equal(company.naeringer[0].kode, '71.121');
const several = shapePublicCompany({
  organisasjonsnummer: '123456789',
  navn: 'Flere AS',
  naeringskode1: { kode: '71.121', beskrivelse: 'Bygg' },
  naeringskode2: { kode: '41.200', beskrivelse: 'Oppføring av bygninger' },
  naeringskoder: [{ kode: '71.121', beskrivelse: 'Bygg' }, { kode: '43.210', beskrivelse: 'Elektrisk installasjon' }],
});
assert.deepEqual(several.naeringer.map((row) => row.kode), ['71.121', '41.200', '43.210']);
assert.equal(company.forretning.poststed, 'SANDNES');
assert.equal(company.kapital.aksjer, 3000);
assert.equal(company.formaal[0], 'Eiendom og investering.');
assert.equal(weatherQuery(company), 'Svanholmen 7 4313 SANDNES');
assert.equal(nbDate('2016-01-11'), '11. januar 2016');
assert.match(nok(100000), /100[\s\u00a0]?000/);
assert.ok(registerRows(company).some((row) => row.label === 'Foretaksregisteret'));
assert.equal(registerRows(company).some((row) => row.label === 'Konkurs'), false);

const roles = shapePublicRoles({
  rollegrupper: [
    {
      type: { beskrivelse: 'Styre' },
      roller: [
        { type: { beskrivelse: 'Styrets leder' }, person: { navn: { fornavn: 'Torbjørn', etternavn: 'Øgreid' } } },
        { type: { beskrivelse: 'Styremedlem' }, fratraadt: true, person: { navn: { fornavn: 'Ut', etternavn: 'Av' } } },
      ],
    },
    {
      type: { beskrivelse: 'Revisor' },
      roller: [{ type: { beskrivelse: 'Revisor' }, enhet: { navn: ['ERGA REVISJON AS'], organisasjonsnummer: '999999999' } }],
    },
  ],
});
assert.equal(roles.length, 2);
assert.equal(roles[0].navn, 'Torbjørn Øgreid');
assert.equal(roles[1].navn, 'ERGA REVISJON AS');

const accounts = shapePublicAccounts([{
  regnskapsperiode: { fraDato: '2025-01-01', tilDato: '2025-12-31' },
  valuta: 'NOK',
  virksomhet: { morselskap: true },
  revisjon: { ikkeRevidertAarsregnskap: false, fravalgRevisjon: false },
  resultatregnskapResultat: {
    aarsresultat: 4178408,
    driftsresultat: { driftsresultat: 6512469, driftsinntekter: { sumDriftsinntekter: 50613141 } },
  },
  egenkapitalGjeld: { egenkapital: { sumEgenkapital: 4298523 }, gjeldOversikt: { sumGjeld: 16891593 } },
  eiendeler: { sumEiendeler: 21190117 },
}]);
assert.equal(accounts.driftsinntekter, 50613141);
assert.equal(accounts.morselskap, true);
assert.equal(accounts.revidert, true);

const units = shapePublicUnits({
  _embedded: {
    underenheter: [
      { organisasjonsnummer: '916570783', navn: 'CONSULT1 AS', naeringskode1: { beskrivelse: 'Bygg' }, beliggenhetsadresse: { adresse: ['Svanholmen 7'], poststed: 'SANDNES' } },
      { organisasjonsnummer: '111111111', navn: 'Nedlagt', nedleggelsesdato: '2020-01-01' },
    ],
  },
});
assert.equal(units.length, 1);
assert.match(units[0].adresse, /Svanholmen 7/);

const fetched = await fetchPublicCompany('916538804', {
  fetchImpl: async (url) => {
    if (String(url).endsWith('/roller')) return { ok: true, status: 200, json: async () => ({ rollegrupper: [] }) };
    if (String(url).includes('underenheter')) return { ok: true, status: 200, json: async () => ({ _embedded: { underenheter: [] } }) };
    if (String(url).includes('regnskapsregisteret')) return { ok: false, status: 404, json: async () => null };
    return { ok: true, status: 200, json: async () => enhet };
  },
});
assert.equal(fetched.ok, true);
assert.equal(fetched.company.navn, 'CONSULT1 AS');
assert.equal(fetched.accounts, null);
assert.equal(fetched.signature, null);

const signature = shapePublicSignature({
  signeringsGrunnlag: {
    signaturProkuraRoller: { signaturProkuraFritekst: 'Daglig leder alene. Styrets leder alene.' },
  },
  signeringsKombinasjon: {
    kombinasjon: [
      {
        tekstforklaring: 'Styret i fellesskap',
        personRolleKombinasjon: [
          { navn: 'Torbjørn Øgreid Coll', rolle: { tekstforklaring: 'Styrets leder' } },
          { navn: 'Anders Rolandsen', rolle: { tekstforklaring: 'Styremedlem' } },
        ],
      },
      {
        tekstforklaring: 'Daglig leder eller styrets leder hver for seg',
        personRolleKombinasjon: [{ navn: 'Anders Rolandsen', rolle: { tekstforklaring: 'Daglig leder' } }],
      },
      {
        tekstforklaring: 'Daglig leder eller styrets leder hver for seg',
        personRolleKombinasjon: [{ navn: 'Anders Rolandsen', rolle: { tekstforklaring: 'Daglig leder' } }],
      },
    ],
  },
});
assert.equal(signature.fritekst, 'Daglig leder alene. Styrets leder alene.');
assert.equal(signature.kombinasjoner.length, 2);
assert.equal(signature.kombinasjoner[1].personer[0].rolle, 'Daglig leder');
assert.match(fetched.brregUrl, /916538804/);

const missing = await fetchPublicCompany('123', { fetchImpl: async () => { throw new Error('skal ikke kalles'); } });
assert.equal(missing.ok, false);

console.log('companyPublic.test.mjs ok');
