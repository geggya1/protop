import assert from 'node:assert/strict';
import {
  companyContextLabel,
  dedupePersonalShells,
  companyOfferHiddenKey,
  dismissCompanyOffer,
  shouldOfferCompany,
} from './companyOffer.js';
import { readFileSync } from 'node:fs';

const personal = (id, createdAt) => ({
  id, isPersonal: true, type: 'family', name: 'Geirs hjem', active: true, createdAt,
});
const org = (id) => ({ id, type: 'organization', name: 'ProTop AS', active: true });

assert.equal(shouldOfferCompany({ uid: 'u1', families: [personal('a')] }), true);
assert.equal(shouldOfferCompany({ uid: 'u1', families: [personal('a'), org('b')] }), false);
assert.equal(shouldOfferCompany({ uid: 'u1', families: [personal('a')], isChild: true }), false);
dismissCompanyOffer('u1');
assert.equal(shouldOfferCompany({ uid: 'u1', families: [personal('a')] }), false);

const dupes = dedupePersonalShells([
  personal('late', 20),
  personal('early', 10),
  org('firm'),
]);
assert.deepEqual(dupes.map((g) => g.id), ['early', 'firm']);
assert.deepEqual(
  dedupePersonalShells([personal('late', 20), personal('early', 10)], 'late').map((g) => g.id),
  ['late'],
);

assert.equal(companyContextLabel({ type: 'family', isPersonal: true, name: 'Geirs hjem' }), '');
assert.equal(companyContextLabel({
  type: 'organization',
  name: 'Gammelt',
  company: { navn: 'ProTop AS' },
}), 'Bedrift · ProTop AS');
assert.equal(companyContextLabel({ type: 'company', name: 'Kai AS' }), 'Bedrift · Kai AS');

// Kortet på Hjem vises med en gang; ingen modal etter to minutter (UX-29).
assert.equal(companyOfferHiddenKey('u1'), 'protop.companyOffer.hidden.v1.u1');
const overlays = readFileSync(new URL('../../components/SessionOverlays.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(overlays, /CompanyOfferModal/);
const desk = readFileSync(new URL('../../components/DeskHomeDashboard.jsx', import.meta.url), 'utf8');
assert.match(desk, /<CompanyOfferCard/);
const phoneHome = readFileSync(new URL('../../components/parentHome/ParentHomeThemeHost.jsx', import.meta.url), 'utf8');
assert.match(phoneHome, /<CompanyOfferCard/);

console.log('companyOffer.test.mjs ok');
