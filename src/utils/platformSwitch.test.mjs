import assert from 'node:assert/strict';
import {
  companySwitchLabel,
  companyWorkspaces,
  liveWorkspaces,
  personalWorkspace,
  platformSegmentActive,
  platformSwitchSegments,
  platformSwitchSide,
  preferHovedenhetWorkspace,
  resolveLoginLanding,
  resolvePlatformSwitch,
  resolveWorkspaceId,
  visibleCompanyWorkspaces,
  workspacePickerItems,
  aliasFamilyIds,
} from './platformSwitch.js';
import { mergeRowsById } from '../project/companyAlias.js';

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
// To org.nr med samme navn er alltid ett selskap, også når begge har data.
assert.equal(resolveLoginLanding([child, parent], child.id, child.id)?.id, 'parent-as');
assert.equal(resolveLoginLanding([child, parent], 'parent-as', 'parent-as')?.id, 'parent-as');
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
assert.equal(resolveLoginLanding([filledChild, parent], filledChild.id)?.id, 'parent-as');
assert.equal(resolveLoginLanding([filledChild], filledChild.id)?.id, 'filled-bedr');
const named = platformSwitchSegments([personal, parent, child]);
assert.deepEqual(named.map((s) => s.label), ['Privat', 'Bedrift']);
assert.equal(named[1].groupId, 'parent-as');

const oneCompany = platformSwitchSegments([personal, company]);
assert.deepEqual(oneCompany.map((s) => s.label), ['Privat', 'Bedrift']);
assert.equal(oneCompany[1].groupId, 'org-1');
const many = platformSwitchSegments([personal, company, extra]);
assert.deepEqual(many.map((s) => [s.label, s.groupId]), [
  ['Privat', 'home-1'],
  ['Bedrift', null],
]);
assert.equal(platformSegmentActive(many[0], personal), true);
assert.equal(platformSegmentActive(many[0], extra), false);
assert.equal(platformSegmentActive(many[1], extra), true);
assert.equal(platformSegmentActive(many[1], personal), false);
assert.equal(platformSegmentActive(oneCompany[1], company), true);
assert.equal(platformSegmentActive(oneCompany[1], personal), false);
assert.equal(
  platformSwitchSegments([personal, company, extra]).some((s) => s.label === 'Privat' && s.groupId === 'home-1'),
  true,
);

const sor = {
  id: 'org-sor',
  type: 'organization',
  name: 'CONSULT1 SØR',
  active: true,
  company: { navn: 'CONSULT1 SØR', organisasjonsnummer: '999000001' },
};
const ost = {
  id: 'org-ost',
  type: 'organization',
  name: 'CONSULT1 ØST',
  active: true,
  company: { navn: 'CONSULT1 ØST', organisasjonsnummer: '999000002' },
};
const families = [personal, parent, child, sor, ost];
const picker = workspacePickerItems(families);
assert.deepEqual(picker.map((item) => item.label), [
  'CONSULT1 AS · 916538804',
  'CONSULT1 SØR · 999000001',
  'CONSULT1 ØST · 999000002',
]);
assert.equal(picker.filter((item) => item.label.includes('CONSULT1 AS')).length, 1);
assert.equal(picker.some((item) => item.label.includes('916570783')), false);
assert.equal(picker.find((item) => item.label.startsWith('CONSULT1 AS')).groupId, 'parent-as');
assert.equal(new Set(picker.map((item) => item.groupId)).size, picker.length);
assert.deepEqual(visibleCompanyWorkspaces(families).map((group) => group.id), ['parent-as', 'org-sor', 'org-ost']);
assert.equal(workspacePickerItems(families).filter((item) => item.label.includes('CONSULT1 AS')).length, 1);
assert.deepEqual(companyWorkspaces([child, parent]).map((group) => group.id), ['parent-as', 'child-bedr']);
assert.deepEqual(
  workspacePickerItems([{ id: 'personal', side: 'personal', label: 'Privat', groupId: null }]).map((item) => item.label),
  [],
);

assert.equal(preferHovedenhetWorkspace(child, [child, parent]).id, 'parent-as');
assert.equal(preferHovedenhetWorkspace(parent, [child, parent]).id, 'parent-as');
assert.equal(resolveWorkspaceId([personal, child, parent], child.id), 'parent-as');
assert.equal(resolvePlatformSwitch([child, parent], child, 'company').group.id, 'parent-as');
assert.equal(preferHovedenhetWorkspace(child, [child]).id, 'child-bedr');
assert.equal(workspacePickerItems([child])[0].label, 'CONSULT1 AS · 916570783');

const bedrTwin = {
  id: 'bedr-twin',
  type: 'organization',
  name: 'CONSULT1 AS',
  active: true,
  parentCompanyId: '',
  company: {
    navn: 'CONSULT1 AS',
    organisasjonsnummer: '916570783',
    organisasjonsformKode: 'BEDR',
    kind: 'underenhet',
    organisasjonsform: 'Underenhet til næringsdrivende og offentlig forvaltning',
  },
};
assert.equal(preferHovedenhetWorkspace(bedrTwin, [bedrTwin, parent]).id, 'parent-as');
assert.equal(workspacePickerItems([personal, bedrTwin, parent]).some((item) => item.label.includes('916570783')), false);

const parentWithUnit = {
  ...parent,
  company: {
    ...parent.company,
    subUnits: [{ id: 'u1', kind: 'underenhet', name: 'Sandnes', organisasjonsnummer: '916570783' }],
  },
};
const sandnes = {
  id: 'sandnes',
  type: 'organization',
  name: 'CONSULT1 AS AVD SANDNES',
  active: true,
  company: {
    navn: 'CONSULT1 AS AVD SANDNES',
    organisasjonsnummer: '916570783',
    organisasjonsformKode: 'BEDR',
  },
};
assert.equal(resolveWorkspaceId([sandnes, parentWithUnit], sandnes.id), 'sandnes');
assert.equal(workspacePickerItems([sandnes]).map((item) => item.groupId).join(','), 'sandnes');

const overordnet = {
  ...child,
  id: 'overordnet-link',
  parentCompanyId: '',
  company: { ...child.company, overordnetEnhet: '916538804' },
};
assert.equal(preferHovedenhetWorkspace(overordnet, [overordnet, parent]).id, 'parent-as');

const sorLinked = { ...sor, parentCompanyId: 'parent-as' };
const ostUnit = {
  ...ost,
  company: {
    navn: 'CONSULT1 ØST AS',
    organisasjonsnummer: '922362343',
    organisasjonsformKode: 'BEDR',
    organisasjonsform: 'Underenhet til næringsdrivende og offentlig forvaltning',
    overordnetEnhet: '922336601',
  },
};
const kept = workspacePickerItems([parent, child, sorLinked, ostUnit]);
assert.deepEqual(kept.map((item) => item.groupId), ['parent-as', 'org-sor', 'org-ost']);
assert.equal(kept.some((item) => String(item.label).includes('916570783')), false);
assert.equal(kept.some((item) => String(item.label).includes('922362343')), true);
assert.equal(platformSwitchSegments([personal, parent, child, sor, ost])[0].label, 'Privat');
assert.equal(preferHovedenhetWorkspace(child, [child, parent]).id, 'parent-as');
assert.deepEqual(workspacePickerItems([parent, child]).map((item) => item.groupId), ['parent-as']);
assert.deepEqual(aliasFamilyIds(parent, [parent, child, sor, ost]), ['child-bedr']);
assert.deepEqual(aliasFamilyIds(sor, [parent, child, sor, ost]), []);
assert.deepEqual(mergeRowsById(
  [{ id: 'a', name: 'hoved' }, { id: 'b', name: 'bare hoved' }],
  [{ id: 'a', name: 'alias' }, { id: 'c', name: 'bare alias' }],
).map((row) => row.name), ['hoved', 'bare hoved', 'bare alias']);

console.log('platformSwitch.test.mjs ok');
