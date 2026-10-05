import assert from 'node:assert/strict';
import {
  filterContracts,
  inputFromInterpretation,
  contractValueFromDraft,
  draftFromContract,
  openIndexIntentFromContract,
} from './directContract.js';
import { interpretContract } from '../indeksregulering/interpret.js';

const NS8403 = `
Consult1 AS - Ledelsessystem
Oppdragsbekreftelse
Oppdrag Madlalia Eksternt PO. nr: Oppdrags nummer:
Oppdragssted Adresse: Haakon VIIs gate 8, 4005 Sted: Stavanger
Oppstart: 17.11.2025 Sluttdato: 31.12.2028
Beskrivelse av oppdraget Anleggsleder
Oppdragsgiver Igang Totalentreprenør As Organisasjons nr: 922 98 7106
Kontakt person Øyvind Lerbrekk
Epost: oyvind@igang.no Telefon nr: 920 82 276
Oppdragstaker Consult1 AS Organisasjons nr: 916 538 804
Generelle bestemmelser NS8403 : Alminnelig kontrakts bestemmelser for byggeleder oppdrag
Avtalte honorar Honoreres etter medgått tid.
Regulering av pris. Timesats reguleres etter SSB prisindeks for 71.121. Byggeteknisk konsulentvirksomhet
Tabell: 14335 Start indeks: K2 2025
Avtalt honorar pris 1080,- eks mva.
Påslagsprosent: 10%
Timepriser reguleres kvartalsvis i henhold til SSBs prisindeks for konsulentvirksomhet (tabell 14335).
Sted: Klepp Dato: 09.10.2025 Sted: Sandnes Dato: 09.10.2025
`;

const draft = interpretContract(NS8403);
assert.equal(draft.standard, 'NS 8403');
assert.equal(draft.indexId, 'ppi-byggeteknisk');
assert.equal(draft.model, 'engang');
assert.equal(draft.buyer, 'Igang Totalentreprenør As');
assert.equal(draft.supplier, 'Consult1 AS');
assert.match(draft.title, /Madlalia/);
assert.match(draft.title, /Anleggsleder/);
assert.equal(draft.startDate, '2025-11-17');
assert.equal(draft.endDate, '2028-12-31');
assert.equal(draft.contractDate, '2025-10-09');
assert.equal(draft.contactName, 'Øyvind Lerbrekk');
assert.equal(draft.orgnr, '922987106');
assert.equal(draft.place, 'Stavanger');
assert.equal(draft.address, 'Haakon VIIs gate 8');
assert.equal(draft.description, 'Anleggsleder');
assert.equal(draft.email, 'oyvind@igang.no');
assert.equal(draft.phone, '92082276');
assert.equal(draft.supplierOrgnr, '916538804');
assert.equal(draft.surchargePercent, '10');
assert.equal(draft.kind, 'oppdrag');
assert.equal(draft.firstRegulationDate, '2025-04-01');
assert.equal(draft.terms.frequency, 'quarter');
assert.equal(String(contractValueFromDraft(draft)), '1080');

const input = inputFromInterpretation(draft, {
  documents: [{ id: 'dok-1', name: 'C1-H-03-001.pdf', text: NS8403 }],
});
assert.equal(input.buyer, 'Igang Totalentreprenør As');
assert.equal(input.start, '2025-11-17');
assert.equal(input.indexDraft.standard, 'NS 8403');
assert.equal(input.fields.indexId, 'ppi-byggeteknisk');
assert.equal(input.documents[0].name, 'C1-H-03-001.pdf');

const rows = [
  { id: 'a', title: 'Madlalia', buyer: 'Igang Totalentreprenør As', projectName: 'Madlalia', start: '2025-11-17', fields: { standard: 'NS 8403' } },
  { id: 'b', title: 'Skolebygg', buyer: 'Eidsvoll kommune', projectName: 'Skole', start: '2026-10-01', fields: {} },
];
assert.equal(filterContracts(rows, { buyer: 'igang' }).map((row) => row.id).join(), 'a');
assert.equal(filterContracts(rows, { project: 'skole' }).map((row) => row.id).join(), 'b');
assert.equal(filterContracts(rows, { from: '2026-01-01' }).map((row) => row.id).join(), 'b');
assert.equal(filterContracts(rows, { query: '8403' }).map((row) => row.id).join(), 'a');

const contract = {
  id: 'ctr-1',
  title: input.title,
  buyer: input.buyer,
  supplier: input.supplier,
  start: input.start,
  end: input.end,
  fields: input.fields,
  indexDraft: input.indexDraft,
  documents: input.documents,
};
const fromContract = draftFromContract(contract, { supplier: 'Consult1 AS' });
assert.equal(fromContract.buyer, 'Igang Totalentreprenør As');
assert.match(fromContract.title, /Madlalia/);
assert.equal(fromContract.standard, 'NS 8403');
const intent = openIndexIntentFromContract(contract);
assert.equal(intent.type, 'openIndexDraft');
assert.equal(intent.caseId, 'ir-ctr-1');
assert.ok(intent.draft.sourceText.includes('NS8403'));

const unnamed = draftFromContract({ id: 'x', buyer: 'Kari', title: '' });
assert.equal(unnamed.title, '');
assert.equal(unnamed.buyer, 'Kari');
assert.equal(unnamed.standard, '');
assert.equal(unnamed.indexId, '');
assert.equal(unnamed.model, '');

const fromDocs = draftFromContract({
  id: 'd1',
  title: '',
  documents: [{ id: '1', name: 'C1.pdf', text: NS8403 }],
});
assert.equal(fromDocs.standard, 'NS 8403');
assert.equal(fromDocs.indexId, 'ppi-byggeteknisk');
assert.equal(fromDocs.buyer, 'Igang Totalentreprenør As');

console.log('directContract ok');
