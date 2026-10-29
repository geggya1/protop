import assert from 'node:assert/strict';
import {
  companyFactGroups, factColumns, roleRows, roleSummary, signatureRows,
} from './companyFacts.js';

const consult1 = {
  organisasjonsnummer: '916538804',
  organisasjonsform: 'Aksjeselskap',
  stiftelsesdato: '2016-01-01',
  registrert: '2016-01-11',
  maalform: 'Bokmål',
  sektorKode: '2100',
  sektor: 'Private aksjeselskaper mv.',
  ansatte: 18,
  kapital: { type: 'Aksjekapital', belop: 100000 },
  sisteRegnskap: '2025',
  forretning: { label: '2 Etasje, Svanholmen 7, 4313 SANDNES' },
  telefon: '52055210',
  epostadresse: 'post@consult1.no',
  hjemmeside: 'www.consult1.no',
  naeringer: [{ kode: '71.121', beskrivelse: 'Byggeteknisk konsulentvirksomhet' }],
};

const groups = companyFactGroups(consult1);
assert.deepEqual(groups.map((g) => g.id), ['register', 'numbers', 'contact', 'industry']);
const register = Object.fromEntries(groups[0].rows.map((r) => [r.label, r.value]));
assert.equal(register.Organisasjonsnummer, '916 538 804');
assert.equal(register.Organisasjonsform, 'Aksjeselskap');
assert.equal(register.Sektor, '2100 · Private aksjeselskaper mv.');
assert.equal('Tidligere navn' in register, false, 'tomme felt tas ikke med');
assert.equal('Oppstart' in register, false, 'stiftet vinner over oppstart');
assert.deepEqual(groups[1].rows.map((r) => r.label), ['Ansatte', 'Aksjekapital', 'Siste årsregnskap']);
assert.equal(groups[1].rows[0].value, '18');
const contact = groups[2].rows;
assert.equal(contact.find((r) => r.label === 'Telefon').value, '52 05 52 10');
assert.equal(contact.find((r) => r.label === 'E-post').link, 'mailto');
assert.equal(contact.find((r) => r.label === 'Hjemmeside').value, 'www.consult1.no');
assert.deepEqual(groups[3].rows, [{ label: '71.121', value: 'Byggeteknisk konsulentvirksomhet' }]);

// Uten stiftelsesdato vises oppstart; reserve fra bedriftens egne felt.
const young = companyFactGroups({ oppstart: '2020-05-01' }, { stored: { organisasjonsnummer: '912345678', telefon: '22000000' }, contact: { address: 'Gate 1' } });
const youngRegister = Object.fromEntries(young[0].rows.map((r) => [r.label, r.value]));
assert.equal(youngRegister.Organisasjonsnummer, '912 345 678');
assert.ok(youngRegister.Oppstart);
assert.equal(young.find((g) => g.id === 'contact').rows[0].value, 'Gate 1');
assert.equal(young.some((g) => g.id === 'numbers'), false, 'tom gruppe faller bort');

assert.deepEqual(companyFactGroups(null), []);

// Kolonner: registrering og bransje til venstre, resten til høyre; én kolonne på telefon.
assert.deepEqual(factColumns(groups).map((col) => col.map((g) => g.id)), [['register', 'industry'], ['numbers', 'contact']]);
assert.deepEqual(factColumns(groups, 1).map((col) => col.map((g) => g.id)), [['register', 'numbers', 'contact', 'industry']]);

// Register og status og konsern står i kortet, ikke i egne kort. Konsern står én gang.
const full = companyFactGroups({ ...consult1, navn: 'CONSULT1 AS', konsern: true }, {
  registers: [
    { label: 'Foretaksregisteret', value: '11. januar 2016' },
    { label: 'Merverdiavgift', value: '1. mars 2016' },
    { label: 'Konsern', value: 'Inngår i konsern' },
    { label: 'Konkurs', value: 'Konkurs åpnet' },
  ],
  overview: {
    inKonsern: true,
    isMorselskap: true,
    parentCompanyName: 'CONSULT1 AS',
    publicCount: 1,
    registeredCount: 2,
    preview: [{ name: 'CONSULT1 AS', organisasjonsnummer: '916570783' }],
    remaining: 0,
  },
});
const reg = full.find((g) => g.id === 'register').rows;
assert.equal(reg.find((r) => r.label === 'Foretaksregisteret').value, '11. januar 2016');
assert.equal(reg.some((r) => r.label === 'Konsern'), false);
assert.equal(reg.find((r) => r.label === 'Konkurs').tone, 'warn');
const konsern = full.find((g) => g.id === 'group');
assert.equal(konsern.action, 'units');
assert.deepEqual(konsern.rows.map((r) => [r.label, r.value]), [
  ['Konsern', 'Inngår i konsern'],
  ['Morselskap', 'Ja, i siste årsregnskap'],
  ['Underenheter', '1 i Enhetsregisteret · 2 registrert her'],
  ['916 570 783', 'CONSULT1 AS'],
], 'bedriften står ikke som overordnet selskap til seg selv');
assert.equal(
  companyFactGroups(consult1, { overview: { parentCompanyName: 'Morselskap Holding AS · 999888777', preview: [] } })
    .find((g) => g.id === 'group').rows.find((r) => r.label === 'Overordnet selskap').value,
  'Morselskap Holding AS · 999888777',
);
assert.deepEqual(factColumns(full).map((col) => col.map((g) => g.id)), [['register', 'industry'], ['numbers', 'contact', 'group']]);

// Signaturrett og roller som rader til skuffene.
assert.deepEqual(signatureRows({
  fritekst: 'Daglig leder alene.',
  kombinasjoner: [
    { tekst: 'Styret i fellesskap', personer: [{ navn: 'Torbjørn Øgreid Coll' }, { navn: 'Anders Rolandsen' }] },
    { tekst: '', personer: [] },
  ],
}), [{ label: 'Styret i fellesskap', value: 'Torbjørn Øgreid Coll, Anders Rolandsen' }]);
const roles = [
  { rolle: 'Daglig leder', navn: 'Anders Rolandsen' },
  { rolle: 'Styrets leder', navn: 'Torbjørn Øgreid Coll' },
  { rolle: 'Revisor', navn: 'ERGA REVISJON AS' },
];
assert.equal(roleRows(roles).length, 3);
assert.equal(roleSummary(roles), 'Daglig leder: Anders Rolandsen · Styrets leder: Torbjørn Øgreid Coll');
assert.equal(roleSummary([{ rolle: 'Revisor', navn: 'X' }]), '1 rolle i Enhetsregisteret');

console.log('companyFacts.test.mjs ok');
