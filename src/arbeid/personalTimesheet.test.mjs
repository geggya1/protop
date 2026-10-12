import assert from 'node:assert/strict';
import {
  companyTimesheetLabel,
  personalTimesheetCompanies,
} from './personalTimesheet.js';

const personal = { id: 'me', isPersonal: true, type: 'family', name: 'Geir', active: true };
const consult = { id: 'c1', type: 'organization', name: 'CONSULT1 AS', company: { navn: 'CONSULT1 AS' }, active: true };
const other = { id: 'c2', type: 'organization', name: 'Annet AS', active: true };

{
  const list = personalTimesheetCompanies([personal, consult, other], personal);
  assert.deepEqual(list.map((row) => row.id), ['c1', 'c2']);
}

{
  const list = personalTimesheetCompanies([personal, consult, other], consult);
  assert.deepEqual(list.map((row) => row.id), ['c1', 'c2']);
  assert.equal(companyTimesheetLabel(list[0]), 'CONSULT1 AS');
}

{
  const list = personalTimesheetCompanies([personal], personal);
  assert.deepEqual(list, []);
  assert.equal(companyTimesheetLabel(null), 'Bedrift');
}

console.log('personalTimesheet.test.mjs: ok');
