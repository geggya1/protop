import assert from 'node:assert/strict';
import { COMPANY_DRAWER_GROUPS } from './shellModules.js';
import {
  companyNavGroupId,
  companyNavTrail,
  isModuleStartPage,
  navTrailParentText,
  navTrailSegments,
  navTrailText,
} from './navTrail.js';

const groupLabel = (id) => COMPANY_DRAWER_GROUPS.find((row) => row.id === id).label;

// Brødsmulen bygges fra menyen: gruppe › modul › side.
const approvals = companyNavTrail('arbeid', 'godkjenning');
assert.equal(approvals.group.id, 'company-people');
assert.equal(approvals.module.id, 'arbeid');
assert.equal(approvals.page.label, 'Godkjenninger');
assert.equal(
  navTrailText('arbeid', 'godkjenning'),
  `${groupLabel('company-people')} › ${approvals.module.label} › Godkjenninger`,
);
assert.equal(navTrailText('arbeid', 'godkjenning', { compact: true }), `${approvals.module.label} › Godkjenninger`);

// Fraværsrapport ligger under Fravær, ikke under «Arbeid».
assert.equal(navTrailText('arbeid', 'fravaersrapport'), `${groupLabel('company-people')} › Fravær › Fraværsrapport`);
// Utlegg (prosjekt og internt på én side, UX-17) ligger under Økonomi i menyen.
assert.equal(companyNavGroupId('okonomi', 'utlegg'), 'company-finance');
assert.equal(navTrailText('okonomi', 'utlegg', { compact: true }), 'Økonomi › Utlegg');
assert.equal(navTrailText('okonomi', 'faktura', { compact: true }), 'Økonomi › Faktura');
assert.equal(navTrailText('okonomi', 'faktura', { current: 'Faktura 1001' }),
  `${groupLabel('company-finance')} › Økonomi › Faktura › Faktura 1001`);
assert.equal(companyNavGroupId('arbeid', 'salg'), 'company-resources', 'Produktsalg ligger under Produkt');
assert.equal(companyNavGroupId('okonomi', 'inntjening'), 'company-productivity');
assert.equal(companyNavGroupId('kunder'), 'company-customers');
assert.equal(companyNavGroupId('iso', 'avvik'), 'company-quality');
assert.equal(companyNavGroupId('home'), '', 'personlige sider er ikke i bedriftsmenyen');
assert.equal(companyNavTrail('timeliste'), null);

// Et ledd med samme navn som forrige tas ikke med to ganger.
const customers = navTrailSegments(companyNavTrail('kunder'));
assert.deepEqual(customers.map((row) => row.label), [groupLabel('company-customers'), 'Kunder']);
assert.equal(customers[customers.length - 1].current, true);
assert.equal(customers[customers.length - 1].action, null, 'siden man står på er ikke en lenke');
const segs = navTrailSegments(approvals);
assert.equal(segs[0].action, null, 'menygruppen er ikke en side');
assert.deepEqual(segs[1].action, { type: 'tab', tab: 'arbeid', subView: 'timeliste' }, 'modulen lenker til startsiden');

// Startside eller underside.
assert.equal(isModuleStartPage('arbeid', 'timeliste'), true);
assert.equal(isModuleStartPage('arbeid', null), true);
assert.equal(isModuleStartPage('arbeid', 'godkjenning'), false);
assert.equal(isModuleStartPage('okonomi', 'oversikt'), true);
assert.equal(isModuleStartPage('okonomi', 'fakturagrunnlag'), false);
assert.equal(isModuleStartPage('arbeid', 'fravaer'), true, 'Fravær åpner fraværsoversikten');
assert.equal(isModuleStartPage('arbeid', 'planlagt'), false);
assert.equal(isModuleStartPage('hr', 'oversikt'), true);
assert.equal(isModuleStartPage('hr', 'lonn'), false);
assert.equal(isModuleStartPage('iso', 'avvik'), false);
assert.equal(isModuleStartPage('kunder'), true);
assert.equal(isModuleStartPage('selskap'), true);
assert.equal(isModuleStartPage('selskap', 'tilgang'), false);
assert.equal(isModuleStartPage('stars'), true, 'personlige sider beholder båndet');

// Linjen over sidetittelen på telefon (undersider uten bånd).
assert.equal(navTrailParentText('okonomi', 'utlegg'), `${groupLabel('company-finance')} › Økonomi`);
assert.equal(navTrailParentText('home'), '');

console.log('navTrail.test.mjs ok');
