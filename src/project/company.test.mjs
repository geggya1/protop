import assert from 'node:assert/strict';
import { companyFromBrreg, createProjectRecord, createTenderRecord } from './company.js';

assert.equal(companyFromBrreg({}), null);
const company = companyFromBrreg({
  organisasjonsnummer: '999999999',
  navn: 'ProTop AS',
  organisasjonsform: 'Aksjeselskap',
  addressLabel: 'Oslo',
});
assert.equal(company.navn, 'ProTop AS');
assert.equal(company.organisasjonsnummer, '999999999');
assert.equal('mva' in company, false, 'ukjent mva-registrering lagres ikke som et svar');

// Registreringene fra Brønnøysund følger med, så fakturaen får «MVA» og «Foretaksregisteret» riktig.
const fromRegister = companyFromBrreg({
  organisasjonsnummer: '916538804',
  navn: 'Consult1 AS',
  organisasjonsform: 'Aksjeselskap',
  registrertIForetaksregisteret: true,
  raw: { organisasjonsform: { kode: 'AS' }, registrertIMvaregisteret: true, registrertIForetaksregisteret: true },
});
assert.equal(fromRegister.mva, true);
assert.equal(fromRegister.foretak, true);
assert.equal(fromRegister.organisasjonsformKode, 'AS');
assert.equal(companyFromBrreg({ organisasjonsnummer: '1', navn: 'X', raw: { registrertIMvaregisteret: false } }).mva, false);

assert.equal(createProjectRecord({ name: '', number: '1' }).ok, false);
assert.equal(createProjectRecord({ name: 'Kai', number: '' }).ok, false);
const project = createProjectRecord({ name: 'Kai', number: 'P-1', place: 'Bodø', phase: 'produksjon' });
assert.equal(project.ok, true);
assert.equal(project.record.number, 'P-1');
assert.equal(project.record.phase, 'produksjon');

assert.equal(createTenderRecord({ title: '  ' }).ok, false);
const tender = createTenderRecord({ title: 'Skole', client: 'Kommune', status: 'sendt' });
assert.equal(tender.ok, true);
assert.equal(tender.record.status, 'sendt');
assert.equal(createTenderRecord({ title: 'X', status: 'nope' }).record.status, 'utkast');

console.log('company.test.mjs ok');
