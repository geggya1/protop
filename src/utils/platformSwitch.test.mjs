import assert from 'node:assert/strict';
import {
  companyWorkspaces,
  liveWorkspaces,
  personalWorkspace,
  platformSwitchSide,
  resolvePlatformSwitch,
} from './platformSwitch.js';

const personal = {
  id: 'home-1',
  isPersonal: true,
  type: 'family',
  name: 'Geirs hjem',
  active: true,
};
const company = {
  id: 'org-1',
  type: 'organization',
  name: 'CONSULT1 AS',
  active: true,
};
const extra = {
  id: 'org-2',
  type: 'company',
  name: 'Annet AS',
  active: true,
};
const archived = {
  id: 'org-old',
  type: 'organization',
  name: 'Gammel',
  active: false,
};

assert.deepEqual(liveWorkspaces([personal, company, archived]).map((g) => g.id), ['home-1', 'org-1']);
assert.equal(personalWorkspace([personal, company]).id, 'home-1');
assert.deepEqual(companyWorkspaces([personal, company, extra]).map((g) => g.id), ['org-1', 'org-2']);

assert.equal(platformSwitchSide(personal), 'personal');
assert.equal(platformSwitchSide(company), 'company');
assert.equal(platformSwitchSide({ type: 'company', name: 'X' }), 'company');

assert.deepEqual(resolvePlatformSwitch([personal, company], personal, 'personal'), {
  kind: 'workspace',
  group: personal,
});
assert.equal(resolvePlatformSwitch([personal, company], personal, 'company').group.id, 'org-1');
assert.equal(resolvePlatformSwitch([personal, company, extra], extra, 'company').group.id, 'org-2');
assert.deepEqual(resolvePlatformSwitch([personal], personal, 'company'), { kind: 'overview' });
assert.deepEqual(resolvePlatformSwitch([company], company, 'personal'), { kind: 'overview' });

console.log('platformSwitch.test.mjs ok');
