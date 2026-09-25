import assert from 'node:assert/strict';
import {
  companyContextLabel,
  dedupePersonalShells,
  dismissCompanyOffer,
  shouldOfferCompany,
} from './companyOffer.js';

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

console.log('companyOffer.test.mjs ok');
