import assert from 'node:assert/strict';
import { COMPANY_DRAWER_GROUPS } from './shellModules.js';
import {
  companyNavGroupId,
  companyNavTrail,
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
// Prosjektutlegg har rute arbeid/utlegg, men ligger under Økonomi i menyen.
assert.equal(companyNavGroupId('arbeid', 'utlegg'), 'company-finance');
assert.equal(navTrailText('arbeid', 'utlegg', { compact: true }), 'Økonomi › Prosjektutlegg');
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

console.log('navTrail.test.mjs ok');
