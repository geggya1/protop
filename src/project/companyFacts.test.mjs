import assert from 'node:assert/strict';
import { companyFactGroups, factColumns } from './companyFacts.js';

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

const groups = companyFactGroups(consult1, { parentLabel: '' });
assert.deepEqual(groups.map((g) => g.id), ['register', 'numbers', 'contact', 'industry']);
const register = Object.fromEntries(groups[0].rows.map((r) => [r.label, r.value]));
assert.equal(register.Organisasjonsnummer, '916 538 804');
assert.equal(register.Organisasjonsform, 'Aksjeselskap');
assert.equal(register.Sektor, '2100 · Private aksjeselskaper mv.');
assert.equal('Overordnet enhet' in register, false, 'tomme felt tas ikke med');
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

console.log('companyFacts.test.mjs ok');
