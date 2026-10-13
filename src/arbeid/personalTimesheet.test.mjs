import assert from 'node:assert/strict';
import {
  canLogOwnHoursInCompany,
  companyTimesheetLabel,
  personalTimesheetCompanies,
} from './personalTimesheet.js';

const personal = { id: 'me', isPersonal: true, type: 'family', name: 'Geir', active: true };
const consult = {
  id: 'c1',
  type: 'organization',
  name: 'CONSULT1 AS',
  company: { navn: 'CONSULT1 AS' },
  active: true,
};
const subsidiary = {
  id: 'c2',
  type: 'organization',
  name: 'CONSULT1 SØR AS',
  company: { navn: 'CONSULT1 SØR AS' },
  active: true,
};
const other = { id: 'c3', type: 'organization', name: 'Annet AS', active: true };

const uid = 'user-1';
const employee = {
  id: 'emp-1',
  personUid: uid,
  company: { status: 'active', accessLevel: 'ansatt' },
};
const inactive = {
  id: 'emp-2',
  personUid: uid,
  company: { status: 'inactive', accessLevel: 'ansatt' },
};
const noHours = {
  id: 'emp-3',
  personUid: uid,
  company: { status: 'active', accessLevel: 'regnskap_ekstern' },
};

{
  assert.equal(
    canLogOwnHoursInCompany(consult, [employee], { uid }),
    true,
  );
  assert.equal(
    canLogOwnHoursInCompany(subsidiary, [], { uid }),
    false,
    'admin uten ansettelse skal ikke kunne føre timer',
  );
  assert.equal(
    canLogOwnHoursInCompany(subsidiary, [inactive], { uid }),
    false,
  );
  assert.equal(
    canLogOwnHoursInCompany(other, [noHours], { uid }),
    false,
    'regnskap uten egne timer skal ikke få timeliste',
  );
}

{
  const list = personalTimesheetCompanies(
    [personal, consult, subsidiary, other],
    personal,
    {
      uid,
      employeesByCompanyId: {
        c1: [employee],
        c2: [],
        c3: [],
      },
    },
  );
  assert.deepEqual(list.map((row) => row.id), ['c1']);
}

{
  const list = personalTimesheetCompanies(
    [personal, consult, subsidiary],
    consult,
    {
      uid,
      employeesByCompanyId: {
        c1: [employee],
        c2: [{ ...employee, id: 'emp-s', personUid: uid }],
      },
    },
  );
  assert.deepEqual(list.map((row) => row.id), ['c1', 'c2']);
  assert.equal(companyTimesheetLabel(list[0]), 'CONSULT1 AS');
}

{
  const list = personalTimesheetCompanies(
    [personal, consult, subsidiary],
    consult,
    { uid, employeesByCompanyId: {} },
  );
  assert.deepEqual(list, [], 'uten lastede ansettelser: ingen selskaper');
}

{
  const list = personalTimesheetCompanies([personal], personal, { uid, employeesByCompanyId: {} });
  assert.deepEqual(list, []);
  assert.equal(companyTimesheetLabel(null), 'Bedrift');
}

console.log('personalTimesheet.test.mjs: ok');
