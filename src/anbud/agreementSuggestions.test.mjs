import assert from 'node:assert/strict';
import { interpretContract } from '../indeksregulering/interpret.js';
import { emptyCoverForm } from './agreementTemplate.js';
import { inputFromInterpretation } from './directContract.js';
import {
  brregSuggestion,
  lookupPostalCode,
  planAgreementSuggestions,
  suggestEmployee,
  suggestProject,
} from './agreementSuggestions.js';

const BREITORGET = `
Oppdragsbekreftelse
Oppdrag Breitorget
Beskrivelse av oppdraget Prosjektleder bistand ifm. ombyggingsarbeider.
Oppdragssted Adresse: Løkkeveien 22 Sted: Stavanger Postnr: 4006
Oppdragsgiver Consult1 AS Organisasjons nr: 916 538 804
Faktura mottak: EHF
Oppdragsleder: Kari Nordmann
Gnr / Bnr: 12/345
Generelle bestemmelser NS 8403
`;

const draft = interpretContract(BREITORGET);
assert.match(draft.title, /Breitorget/);
assert.equal(draft.place, 'Stavanger');
assert.equal(draft.address, 'Løkkeveien 22');
assert.equal(draft.postalCode, '4006');
assert.equal(draft.invoiceMethod, 'EHF');
assert.equal(draft.leaderName, 'Kari Nordmann');
assert.equal(draft.gnrBnr, '12/345');
assert.equal(draft.buyer, 'Consult1 AS');

const messy = interpretContract('Oppdragssted Adresse: Breitorget 10837 Sted: Stavanger Postnr: 4006 Oppdrag Breitorget');
assert.equal(messy.address, 'Breitorget');
assert.equal(messy.postalCode, '4006');

const listed = interpretContract('Faktura mottak: EPOST / EHF / POST. Oppdrag Testveien 1');
assert.equal(listed.invoiceMethod, '');
const mail = interpretContract('Faktura mottak: post@kunde.no Oppdrag Testveien 1');
assert.equal(mail.invoiceMethod, 'EPOST');

const input = inputFromInterpretation(draft, { documents: [{ text: BREITORGET }] });
const previous = emptyCoverForm();
const planned = planAgreementSuggestions({
  previous,
  next: {
    ...previous,
    ...input,
    value: input.value ? String(input.value) : '',
    supplier: 'Annen AS',
    supplierOrgnr: '999999999',
  },
  projects: [
    { id: 'p1', name: 'Breitorget', place: 'Stavanger' },
    { id: 'p2', name: 'Skolebygg', place: 'Oslo' },
  ],
  people: [
    { uid: 'u1', name: 'Kari Nordmann', email: 'kari@example.com' },
    { uid: 'u2', name: 'Ola Nordmann' },
  ],
  customers: [
    { id: 'c1', name: 'Consult1 AS', orgnr: '916538804', place: 'Stavanger', postalCode: '4006' },
  ],
  explicit: input.explicitSuggestions,
});

assert.equal(planned.form.customerId, 'c1');
assert.equal(planned.form.projectId, 'p1');
assert.equal(planned.form.leaderUid, 'u1');
assert.equal(planned.form.leaderEmail, 'kari@example.com');
assert.equal(planned.form.invoiceMethod, 'EHF');
assert.equal(planned.suggested.customerId, true);
assert.equal(planned.suggested.projectId, true);
assert.equal(planned.suggested.leaderUid, true);
assert.equal(planned.suggested.title, true);
assert.equal(planned.suggested.description, true);
assert.equal(planned.suggested.invoiceMethod, true);
assert.equal(planned.suggested.standard, undefined);
assert.equal(planned.projectChoices.some((row) => row.id === 'p1'), false);

const ambiguous = suggestProject([
  { id: 'a', name: 'Breitorget nord' },
  { id: 'b', name: 'Breitorget sør' },
], { title: 'Breitorget' });
assert.equal(ambiguous.best, null);
assert.equal(ambiguous.alternatives.length, 2);

assert.equal(suggestEmployee([{ uid: '1', name: 'Kari Nordmann' }, { uid: '2', name: 'Kari Berg' }], 'Kari'), null);
assert.equal(suggestEmployee([{ uid: '1', name: 'Kari Nordmann' }], 'Kari Nordmann').uid, '1');

const postalHit = await lookupPostalCode(
  { address: 'Løkkeveien 22', place: 'Stavanger' },
  async () => ({
    results: [
      { postnummer: '0150', poststed: 'Oslo' },
      { postnummer: '4006', poststed: 'Stavanger' },
    ],
  }),
);
assert.equal(postalHit.postalCode, '4006');
assert.equal(postalHit.source, 'kartverket');

const kept = await lookupPostalCode({ address: 'Løkkeveien 22', place: 'Stavanger', postalCode: '4008' }, async () => {
  throw new Error('skal ikke søke når postnummer finnes');
});
assert.equal(kept.postalCode, '4008');
assert.equal(kept.source, 'document');

const brreg = brregSuggestion([
  { navn: 'Consult1 AS', organisasjonsnummer: '916538804' },
  { navn: 'Consult2 AS', organisasjonsnummer: '123456789' },
], { name: 'Consult1', orgnr: '' });
assert.equal(brreg.confident.organisasjonsnummer, '916538804');

console.log('agreementSuggestions.test.mjs: ok');
