import assert from 'node:assert/strict';
import {
  availableYears,
  branchesFrom,
  buildGroupChart,
  entityCountLabel,
  entityFacts,
  formatCompactAmount,
  formatDelta,
  formatOwnership,
  formatShare,
  majorityCorporateOwner,
  normalizeGroupChartSettings,
  stakesFromInvestments,
  yoyPercent,
} from './groupChart.js';

const parentAccounts = [
  statement('SELSKAP', '2024-12-31', 44758279, 4117596, true),
  statement('SELSKAP', '2025-12-31', 50613141, 4178408, true),
];
const sorAccounts = [
  statement('SELSKAP', '2024-12-31', 6277827, -355196, false),
  statement('SELSKAP', '2025-12-31', 5558590, -198513, false),
];
const ostAccounts = [
  statement('SELSKAP', '2024-12-31', 8774586, 576171, false),
  statement('SELSKAP', '2025-12-31', 9828718, 113021, false),
];

function statement(type, til, revenue, result, morselskap) {
  return {
    regnskapstype: type,
    regnskapsperiode: { fraDato: `${til.slice(0, 4)}-01-01`, tilDato: til },
    virksomhet: { morselskap },
    resultatregnskapResultat: {
      aarsresultat: result,
      driftsresultat: { driftsinntekter: { sumDriftsinntekter: revenue } },
    },
  };
}

function investment(orgnr, name, year, held, total) {
  return {
    orgnr,
    shareholderOrgnr: '916538804',
    holdings: { [year]: { total: held } },
    investment: {
      orgnr,
      name,
      shares: { [year]: { total } },
    },
  };
}

const investments = [
  investment('916538804', 'CONSULT1 AS', '2025', 10, 100),
  investment('826514302', 'CONSULT1 SØR AS', '2025', 850, 1000),
  investment('922336601', 'CONSULT1 ØST AS', '2025', 1000, 1000),
  investment('999999999', 'LITE AS', '2025', 150, 1000),
];

assert.deepEqual(normalizeGroupChartSettings(null), { minOwnership: 50, showUnits: false });
assert.equal(normalizeGroupChartSettings({ minOwnership: 20, showUnits: false }).minOwnership, 20);
assert.equal(normalizeGroupChartSettings({ showUnits: true }).showUnits, true);
assert.equal(normalizeGroupChartSettings({ showUnits: false }).showUnits, false);
assert.equal(formatCompactAmount(50613141), '50,6\u00a0MNOK');
assert.equal(formatCompactAmount(-198513).replace(/\u00a0/g, ' '), '−198 513 kr');
assert.equal(formatCompactAmount(null), '–');
assert.deepEqual(formatDelta(13.08), { text: '+13 %', direction: 'up' });
assert.equal(formatDelta(yoyPercent(-198513, -355196)).direction, 'up');
assert.equal(formatOwnership(85), '85 %');
assert.equal(formatOwnership(100), '100 %');
assert.equal(formatOwnership(20.24), '20,2 %');

const stakes = stakesFromInvestments(investments, { ownerOrgnr: '916538804', year: 2025 });
assert.deepEqual(stakes.map((row) => row.organisasjonsnummer), ['826514302', '922336601', '999999999']);
assert.equal(stakes.find((row) => row.organisasjonsnummer === '826514302').percent, 85);
assert.equal(stakes.find((row) => row.organisasjonsnummer === '922336601').percent, 100);
assert.equal(stakesFromInvestments(investments, { ownerOrgnr: '916538804', year: 2024 }).length, 0);

const model = buildGroupChart({
  entity: {
    organisasjonsnummer: '916538804',
    navn: 'CONSULT1 AS',
    antallAnsatte: 18,
    harRegistrertAntallAnsatte: true,
    erIKonsern: true,
  },
  unitPayload: {
    _embedded: {
      underenheter: [
        {
          organisasjonsnummer: '916570783',
          navn: 'CONSULT1 AS',
          beliggenhetsadresse: { adresse: ['Svanholmen 7'], postnummer: '4313', poststed: 'SANDNES' },
        },
        { organisasjonsnummer: '111111111', navn: 'Nedlagt', nedleggelsesdato: '2020-01-01' },
      ],
    },
  },
  accountPayload: parentAccounts,
  investmentRows: investments,
  childBundles: [
    {
      organisasjonsnummer: '826514302',
      entity: { organisasjonsnummer: '826514302', navn: 'CONSULT1 SØR AS', antallAnsatte: 5, harRegistrertAntallAnsatte: true },
      accountPayload: sorAccounts,
    },
    {
      organisasjonsnummer: '922336601',
      entity: { organisasjonsnummer: '922336601', navn: 'CONSULT1 ØST AS', antallAnsatte: 9, harRegistrertAntallAnsatte: true },
      accountPayload: ostAccounts,
    },
  ],
  year: 2025,
  settings: { minOwnership: 50 },
});

assert.equal(model.parent.role, 'Morselskap');
assert.equal(model.parent.revenueLabel, '50,6\u00a0MNOK');
assert.equal(model.parent.employeesLabel, '18');
assert.equal(model.parent.revenueDelta.text, '+13 %');
assert.deepEqual(model.children.map((row) => row.navn), ['CONSULT1 SØR AS', 'CONSULT1 ØST AS']);
assert.equal(model.children[0].ownershipLabel, '85 %');
assert.equal(model.children[0].role, 'Datterselskap');
assert.equal(model.children[1].ownershipLabel, '100 %');
assert.equal(model.children[1].employeesLabel, '9');
assert.equal(model.units.length, 0);
assert.equal(model.totals.countLabel, '3 enheter (2 datterselskaper)');
assert.equal(model.totals.source, 'Sum av selskapsregnskapene');
assert.equal(model.totals.employeesLabel, '32');
assert.equal(model.totals.revenueLabel, '66,0\u00a0MNOK');
assert.equal(model.year, 2025);
assert.equal(model.years[0].label, 'Siste regnskapsår');
assert.equal(model.emptyOwnership, '');

const withUnits = buildGroupChart({
  entity: {
    organisasjonsnummer: '916538804',
    navn: 'CONSULT1 AS',
    antallAnsatte: 18,
    harRegistrertAntallAnsatte: true,
  },
  unitPayload: {
    _embedded: {
      underenheter: [
        {
          organisasjonsnummer: '916570783',
          navn: 'CONSULT1 AS',
          beliggenhetsadresse: { adresse: ['Svanholmen 7'], postnummer: '4313', poststed: 'SANDNES' },
        },
      ],
    },
  },
  accountPayload: parentAccounts,
  investmentRows: investments,
  childBundles: [],
  year: 2025,
  settings: { minOwnership: 50, showUnits: true },
});
assert.equal(withUnits.units.length, 1);
assert.equal(withUnits.units[0].poststed, 'SANDNES');

const wide = buildGroupChart({
  entity: { organisasjonsnummer: '916538804', navn: 'CONSULT1 AS' },
  accountPayload: parentAccounts,
  investmentRows: investments,
  childBundles: [],
  year: 2025,
  settings: { minOwnership: 1, showUnits: false },
});
assert.equal(wide.children.length, 3);
assert.equal(wide.children[0].revenueLabel, '…');
assert.equal(wide.units.length, 0);
assert.equal(wide.totals.countLabel, '4 enheter (2 datterselskaper, 1 eierpost)');

const konsern = buildGroupChart({
  entity: { organisasjonsnummer: '1'.repeat(9), navn: 'Konsern AS', antallAnsatte: 4, harRegistrertAntallAnsatte: true },
  accountPayload: [
    statement('KONSERN', '2025-12-31', 100000000, 8000000, true),
    statement('KONSERN', '2024-12-31', 80000000, 4000000, true),
    statement('SELSKAP', '2025-12-31', 40000000, 2000000, true),
  ],
  investmentRows: [],
  year: 2025,
});
assert.equal(konsern.parent.revenueLabel, '40,0\u00a0MNOK');
assert.equal(konsern.totals.source, 'Konsernregnskap');
assert.equal(konsern.totals.revenueLabel, '100\u00a0MNOK');
assert.equal(konsern.totals.revenueDelta.text, '+25 %');
assert.equal(konsern.emptyOwnership, 'Ingen datterselskaper med over 50 % eierandel i Aksjonærregisteret.');

assert.equal(entityCountLabel([]), '1 enhet');
assert.deepEqual(availableYears(parentAccounts), [2025, 2024]);
assert.equal(branchesFrom({ _embedded: { underenheter: [] } }).length, 0);

const owner = majorityCorporateOwner([
  {
    shareholderOrgnr: '916538804',
    holdings: { 2025: { total: 850 } },
    investor: { shareholder: { name: 'CONSULT1 AS', orgnr: '916538804' } },
  },
  {
    shareholderOrgnr: '934057317',
    holdings: { 2025: { total: 150 } },
    investor: { shareholder: { name: 'G O TØRNKVIST AS', orgnr: '934057317' } },
  },
], { 2025: { total: 1000 } }, { year: 2025, selfOrgnr: '826514302' });
assert.equal(owner.navn, 'CONSULT1 AS');
assert.equal(formatOwnership(owner.percent), '85 %');

const unavailable = buildGroupChart({
  fallbackName: 'Uten tall',
  fallbackOrgnr: '123456789',
  investmentRows: null,
});
assert.equal(unavailable.ownershipKnown, false);
assert.equal(unavailable.parent.navn, 'Uten tall');
assert.equal(unavailable.emptyOwnership, '');

// Fakta ved siden av treet: adresse, bransje, stiftet og hjemmeside fra Enhetsregisteret.
const facts = entityFacts({
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  naeringskode1: { kode: '71.121', beskrivelse: 'Byggeteknisk konsulentvirksomhet' },
  stiftelsesdato: '2016-01-01',
  hjemmeside: 'www.consult1.no',
  forretningsadresse: { adresse: ['Svanholmen 7', ''], postnummer: '4313', poststed: 'SANDNES' },
});
assert.equal(facts.address, 'Svanholmen 7, 4313 SANDNES');
assert.equal(facts.orgForm, 'Aksjeselskap');
assert.equal(facts.industry, '71.121 Byggeteknisk konsulentvirksomhet');
assert.equal(facts.founded, '2016-01-01');
assert.equal(facts.websiteUrl, 'https://www.consult1.no');
assert.equal(entityFacts(null), null);
assert.equal(entityFacts({ hjemmeside: 'https://a.no' }).websiteUrl, 'https://a.no');
assert.equal(model.parent.facts.address, '');
assert.equal(model.parent.facts.orgForm, '');

assert.equal(formatShare(4178408, 50613141), '8,3 %');
assert.equal(formatShare(-198513, 5558590), '−3,6 %');
assert.equal(formatShare(5, 0), '–');
assert.equal(formatShare(null, 10), '–');
assert.equal(model.parent.marginLabel, '8,3 %');

console.log('groupChart ok');
