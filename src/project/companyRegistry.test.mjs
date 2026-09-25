import assert from 'node:assert/strict';
import {
  buildJoinRequest,
  companyRegistrationDecision,
  manualCompany,
  organizationByOrgnr,
} from './companyRegistry.js';

const existing = {
  id: 'fam1',
  name: 'ProTop AS',
  company: { organisasjonsnummer: '917103801', navn: 'ProTop AS' },
};

assert.equal(organizationByOrgnr([existing], '917 103 801')?.id, 'fam1');
assert.equal(organizationByOrgnr([existing], '111111111'), null);
assert.equal(companyRegistrationDecision(existing).kind, 'join');
assert.equal(companyRegistrationDecision(null).kind, 'create');

const request = buildJoinRequest({ uid: 'u1', name: 'Geir', email: 'A@B.NO', at: '2026-09-25T10:00:00.000Z' });
assert.equal(request.status, 'pending');
assert.equal(request.email, 'a@b.no');
assert.equal(request.createdAt, '2026-09-25T10:00:00.000Z');

assert.equal(manualCompany({ name: '  ' }).ok, false);
const manual = manualCompany({ name: 'Kai ENK', address: 'Bodø' });
assert.equal(manual.ok, true);
assert.equal(manual.company.navn, 'Kai ENK');
assert.equal(manual.company.manual, true);
assert.equal(manual.company.organisasjonsnummer, '');

console.log('companyRegistry.test.mjs ok');
