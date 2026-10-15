import assert from 'node:assert/strict';
import {
  applyContractFieldsToEmployee,
  mergeContractExtract,
  parseEmploymentContractText,
} from './contractOcr.js';

const sample = `
ARBEIDSAVTALE
Arbeidsgiver: CONSULT1 AS
Arbeidstaker: Ada Lovelace
Arbeidssted: Oslo
Stilling: Senior konsulent
Tiltrer: 01.03.2024
Stillingsprosent: 100
Årslønn: 850 000
Oppsigelsesfrist: 3 måneder
Prøvetid: 6 måneder
Arbeidstid: 37,5 timer per uke
`;

{
  const fields = parseEmploymentContractText(sample);
  assert.equal(fields.employerName, 'CONSULT1 AS');
  assert.equal(fields.employeeName, 'Ada Lovelace');
  assert.equal(fields.workplace, 'Oslo');
  assert.match(fields.title, /konsulent/i);
  assert.equal(fields.startDate, '2024-03-01');
  assert.equal(fields.workPercent, '100');
  assert.equal(fields.probationMonths, '6');
  assert.ok(fields.salaryAmount.includes('850'));
}

{
  const merged = mergeContractExtract({ title: 'Behold' }, { title: 'Ny', workplace: 'Bergen' });
  assert.equal(merged.title, 'Behold');
  assert.equal(merged.workplace, 'Bergen');
}

{
  const emp = applyContractFieldsToEmployee(
    { person: {}, company: {} },
    { employeeName: 'Ada Lovelace', title: 'Konsulent', startDate: '2024-03-01', workPercent: '80', roleDescription: 'Rådgivning' },
  );
  assert.equal(emp.person.firstName, 'Ada');
  assert.equal(emp.person.lastName, 'Lovelace');
  assert.equal(emp.company.title, 'Konsulent');
  assert.equal(emp.company.workPercent, '80');
  assert.match(emp.company.comment, /Rådgivning/);
}

console.log('hr/contractOcr.test.mjs ok');
