import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { companyFieldChanges } from './companyFields.js';

// Bare feltene som er endret skrives. Tilgangsmatrisen følger ikke med når noe annet lagres.
const stored = { navn: 'CONSULT1 AS', modules: { disabled: [] }, accessPolicy: { levels: { ansatt: { employees: 'see' } } }, logo: { uri: 'x' } };
const next = { ...stored, modules: { disabled: ['hr'] } };
assert.deepEqual(companyFieldChanges(stored, next), { set: { modules: { disabled: ['hr'] } }, remove: [] });

// Fjernet felt (logo slettet) blir fjernet, ikke hele selskapet skrevet på nytt.
const withoutLogo = { ...stored };
delete withoutLogo.logo;
assert.deepEqual(companyFieldChanges(stored, withoutLogo), { set: {}, remove: ['logo'] });

// En eldre kopi bygd fra samme grunnlag endrer ikke tilgangsmatrisen.
assert.equal('accessPolicy' in companyFieldChanges(stored, { ...stored, telefon: '1' }).set, false);
assert.deepEqual(companyFieldChanges(stored, { ...stored, accessPolicy: { levels: {} } }).set, { accessPolicy: { levels: {} } });
assert.deepEqual(companyFieldChanges(null, { navn: 'A' }), { set: { navn: 'A' }, remove: [] });

// Selskapsinnstillingene, underenheter og forsiden lagrer felt for felt.
const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const platform = read('../../screens/project/ProjectPlatformScreen.jsx');
assert.match(platform, /if \(nextCompany\) await updateGroupCompany\(id, company, nextCompany, rest\);/);
assert.match(read('../../screens/project/CompanyUnitsScreen.jsx'), /await updateGroupCompany\(familyId, company, next\);/);
assert.match(read('../../screens/project/CompanyDesktopLanding.jsx'), /await updateGroupCompany\(familyId, stored, company\);/);
assert.match(read('../utils/groups.js'), /patch\[`company\.\$\{key\}`\] = deleteField\(\);/);

console.log('companyFields.test.mjs: ok');
