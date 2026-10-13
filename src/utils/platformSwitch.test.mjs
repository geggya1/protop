import assert from 'node:assert/strict';
import {
  companySwitchLabel,
  companyWorkspaces,
  liveWorkspaces,
  personalWorkspace,
  platformSegmentActive,
  platformSwitchSegments,
  platformSwitchSide,
  resolveLoginLanding,
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
assert.deepEqual(companyWorkspaces([personal, company, extra]).map((g) => g.id), ['org-2', 'org-1']);

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

assert.equal(resolveLoginLanding([personal], personal.id)?.id, 'home-1');
assert.equal(resolveLoginLanding([personal, company], personal.id)?.id, 'org-1');
assert.equal(resolveLoginLanding([personal, company, extra], personal.id, 'org-1')?.id, 'org-1');
assert.equal(resolveLoginLanding([personal, company, extra], 'org-1')?.id, 'org-1');
assert.equal(resolveLoginLanding([company, extra], '')?.id, 'org-2');
assert.equal(resolveLoginLanding([], ''), null);

const parent = {
  id: 'parent-as',
  type: 'organization',
  name: 'CONSULT1 AS',
  active: true,
  company: {
    navn: 'CONSULT1 AS',
    organisasjonsnummer: '916538804',
    organisasjonsform: 'Aksjeselskap',
    subUnits: [{ id: 'u1', kind: 'underenhet', name: 'Avdeling' }],
  },
};
const child = {
  id: 'child-bedr',
  type: 'organization',
  name: 'CONSULT1 AS',
  active: true,
  parentCompanyId: 'parent-as',
  company: {
    navn: 'CONSULT1 AS',
    organisasjonsnummer: '916570783',
    organisasjonsform: 'Underenhet til næringsdrivende og offentlig forvaltning',
    organisasjonsformKode: 'BEDR',
  },
};
assert.deepEqual(companyWorkspaces([child, parent]).map((g) => g.id), ['parent-as', 'child-bedr']);
assert.equal(companySwitchLabel(parent), 'CONSULT1 AS · 916538804');
assert.equal(companySwitchLabel(child), 'CONSULT1 AS · 916570783');
assert.equal(resolveLoginLanding([child, parent], child.id, child.id)?.id, 'parent-as');
assert.equal(resolveLoginLanding([child, parent], '')?.id, 'parent-as');
assert.equal(resolveLoginLanding([personal, child, parent], personal.id)?.id, 'parent-as');
const filledChild = {
  ...child,
  id: 'filled-bedr',
  parentCompanyId: '',
  company: {
    ...child.company,
    subUnits: [{ id: 'own', kind: 'avdeling', name: 'Egen' }],
  },
};
assert.equal(resolveLoginLanding([filledChild, parent], filledChild.id)?.id, 'filled-bedr');
const named = platformSwitchSegments([personal, parent, child]);
assert.deepEqual(named.filter((s) => s.side === 'company').map((s) => s.label), [
  'CONSULT1 AS · 916538804',
  'CONSULT1 AS · 916570783',
]);

const oneCompany = platformSwitchSegments([personal, company]);
assert.deepEqual(oneCompany.map((s) => s.label), ['Privat', 'Bedrift']);
assert.equal(oneCompany[1].groupId, 'org-1');
const many = platformSwitchSegments([personal, company, extra]);
assert.deepEqual(many.map((s) => [s.label, s.groupId]), [
  ['Privat', 'home-1'],
  ['Annet AS', 'org-2'],
  ['CONSULT1 AS', 'org-1'],
]);
assert.equal(platformSegmentActive(many[0], personal), true);
assert.equal(platformSegmentActive(many[1], extra), true);
assert.equal(platformSegmentActive(many[2], extra), false);
assert.equal(platformSegmentActive(oneCompany[1], company), true);

console.log('platformSwitch.test.mjs ok');
