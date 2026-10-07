import assert from 'node:assert/strict';
import { draftFromRegisteredContract, knownIndexFacts, missingIndexFields } from './fromContract.js';

const madla = {
  id: 'a1',
  title: 'Madlalia - Anleggsleder',
  buyer: 'Igang Totalentreprenør As',
  supplier: 'Consult1 AS',
  kind: 'oppdrag',
  value: 1080,
  start: '2025-11-17',
  end: '2028-12-31',
  fields: {
    standard: 'NS 8403',
    indexId: 'ppi-byggeteknisk',
    honorar: 'Honoreres etter medgått tid.',
    orgnr: '922987106',
    contactName: 'Øyvind Lerbrekk',
    email: 'oyvind@igang.no',
    phone: '92082276',
    contractDate: '2025-10-09',
    offerDate: '2025-09-15',
    sharePercent: '100',
    place: 'Stavanger',
    address: 'Haakon VIIs gate 8',
    description: 'Anleggsleder',
    surchargePercent: '10',
    supplierOrgnr: '916538804',
  },
};

const draft = draftFromRegisteredContract(madla, {
  company: { navn: 'CONSULT1 AS', organisasjonsnummer: '916538804' },
});
assert.equal(draft.title, 'Madlalia - Anleggsleder');
assert.equal(draft.buyer, 'Igang Totalentreprenør As');
assert.equal(draft.orgnr, '922987106');
assert.equal(draft.standard, 'NS 8403');
assert.equal(draft.model, 'engang');
assert.equal(draft.indexId, 'ppi-byggeteknisk');
assert.equal(draft.contactName, 'Øyvind Lerbrekk');
assert.equal(draft.email, 'oyvind@igang.no');
assert.equal(draft.lines[0].rate, '1080');
assert.equal(draft.offerDate, '2025-09-15');
assert.equal(draft.sharePercent, '100');
assert.notEqual(draft.standard, 'NS 8407');
assert.notEqual(draft.orgnr, '916538804');

const facts = knownIndexFacts(draft);
assert.ok(facts.some((row) => row.label === 'Avtale' && row.value.includes('Madlalia')));
assert.ok(facts.some((row) => row.label === 'Modell' && row.value.includes('Engangsregulering')));
assert.ok(facts.some((row) => row.label === 'Kontakt' && row.value.includes('Øyvind')));
assert.equal(facts.some((row) => row.value === 'Ikke oppgitt'), false);
assert.equal(facts.some((row) => /Geir|post@consult1/i.test(row.value)), false);

const gaps = missingIndexFields(draft);
assert.equal(gaps.some((row) => row.id === 'sharePercent'), false);
assert.equal(gaps.some((row) => row.id === 'indexId'), false);
assert.equal(gaps.some((row) => row.id === 'contractDate'), false);

const empty = draftFromRegisteredContract({ id: 'x', title: 'Tom' });
assert.equal(empty.standard, '');
assert.equal(empty.indexId, '');
assert.equal(empty.model, '');
assert.ok(missingIndexFields(empty).some((row) => row.id === 'indexId'));

const noShare = draftFromRegisteredContract({
  ...madla,
  fields: { ...madla.fields, sharePercent: '' },
});
assert.ok(missingIndexFields(noShare).some((row) => row.id === 'sharePercent'));

const companyMustNotBecomeBuyer = draftFromRegisteredContract(madla, {
  company: {
    navn: 'CONSULT1 AS',
    organisasjonsnummer: '916538804',
    epostadresse: 'post@consult1.no',
    kontaktperson: 'Geir Ove Seldal',
  },
});
assert.equal(companyMustNotBecomeBuyer.orgnr, '922987106');
assert.equal(companyMustNotBecomeBuyer.contactName, 'Øyvind Lerbrekk');
assert.equal(companyMustNotBecomeBuyer.email, 'oyvind@igang.no');
assert.equal(companyMustNotBecomeBuyer.supplierOrgnr, '916538804');
assert.equal(companyMustNotBecomeBuyer.senderEmail, 'post@consult1.no');
assert.equal(companyMustNotBecomeBuyer.senderContact, 'Geir Ove Seldal');
assert.equal(companyMustNotBecomeBuyer.email, 'oyvind@igang.no');

const companyMailOnClient = draftFromRegisteredContract({
  ...madla,
  oppdragId: '12',
  fields: { ...madla.fields, email: 'post@consult1.no', phone: '51888888' },
}, {
  company: {
    navn: 'CONSULT1 AS',
    organisasjonsnummer: '916538804',
    epostadresse: 'post@consult1.no',
    telefon: '51888888',
    poststed: 'Sandnes',
    kontaktperson: 'Geir Ove Seldal',
  },
  customer: { name: 'Igang Totalentreprenør As', email: 'oyvind@igang.no', phone: '92082276', orgnr: '922987106' },
  projectNumber: '01',
});
assert.equal(companyMailOnClient.buyer, 'Igang Totalentreprenør As');
assert.equal(companyMailOnClient.supplier, 'Consult1 AS');
assert.equal(companyMailOnClient.email, 'oyvind@igang.no');
assert.equal(companyMailOnClient.phone, '92082276');
assert.equal(companyMailOnClient.senderPlace, 'Sandnes');
assert.equal(companyMailOnClient.place, 'Stavanger');
assert.equal(companyMailOnClient.reference, '01');
assert.equal(companyMailOnClient.senderContact, 'Geir Ove Seldal');

const described = knownIndexFacts(draft);
assert.ok(described.some((row) => row.label === 'Honorar' && /medgått tid/.test(row.value)));
assert.ok(described.some((row) => row.label === 'Avtalt pris' && /1\s?080/.test(row.value) && /eks mva/.test(row.value)));
assert.equal(described.some((row) => row.label === 'Avtalt honorar pris'), false);

const duplicate = draftFromRegisteredContract({
  ...madla,
  fields: { ...madla.fields, honorar: '1 080 kr inklusiv mva' },
});
const collapsed = knownIndexFacts(duplicate);
assert.equal(collapsed.some((row) => row.label === 'Honorar'), false);
const onlyPrice = collapsed.find((row) => row.label === 'Avtalt pris');
assert.match(onlyPrice.value, /1\s?080/);
assert.match(onlyPrice.value, /inkl\. mva/);
assert.equal(collapsed.filter((row) => /1\s?080|1080/.test(row.value)).length, 1);

console.log('fromContract ok');
