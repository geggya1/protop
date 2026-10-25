import test from 'node:test';
import assert from 'node:assert/strict';
import { canGrantLevel, canSetGrant, checkPersonChange, grantableLevels } from './accessCeiling.js';
import { grantsForEmployee, standardGrants, withToggledLevel } from './companyAccess.js';

const policy = {};
const emp = (id, uid, level) => ({ id, personUid: uid, company: { accessLevel: level, accessLevels: [level], status: 'active' } });

const leaderRow = emp('e1', 'leder-uid', 'leder');
const leader = { uid: 'leder-uid', grants: grantsForEmployee(policy, leaderRow), bypass: false };
const adminRow = emp('e2', 'admin-uid', 'administrator');
const admin = { uid: 'admin-uid', grants: grantsForEmployee(policy, adminRow), bypass: false };
const staff = emp('e3', 'staff-uid', 'ansatt');

test('øverste leder har Begrenset redigering på Tilgangsstyring som standard', () => {
  assert.equal(standardGrants('leder').accessControl, 'read');
});

test('ingen kan endre sin egen tilgang', () => {
  const up = withToggledLevel(leaderRow, 'administrator', true);
  assert.equal(checkPersonChange({ actor: leader, policy, before: leaderRow, after: up }).ok, false);
  const adminUp = { ...adminRow, company: { ...adminRow.company, accessOverrides: { iso: 'write' } } };
  assert.equal(checkPersonChange({ actor: admin, policy, before: adminRow, after: adminUp }).ok, false);
});

test('eieren kan alt', () => {
  const up = withToggledLevel(staff, 'administrator', true);
  assert.equal(checkPersonChange({ actor: { uid: 'own', bypass: true }, policy, before: staff, after: up }).ok, true);
});

test('øverste leder kan endre ansatte, men aldri over eget nivå', () => {
  const toLeader = withToggledLevel(staff, 'leder', true);
  assert.equal(checkPersonChange({ actor: leader, policy, before: staff, after: toLeader }).ok, true);
  const toAdmin = withToggledLevel(staff, 'administrator', true);
  const res = checkPersonChange({ actor: leader, policy, before: staff, after: toAdmin });
  assert.equal(res.ok, false);
  assert.match(res.reason, /høyere tilgang enn du har selv/);
  assert.equal(canGrantLevel({ actor: leader, policy, levelId: 'administrator' }), false);
  assert.equal(canGrantLevel({ actor: leader, policy, levelId: 'avdelingsleder' }), true);
  assert.ok(!grantableLevels({ actor: leader, policy }).some((l) => l.id === 'administrator'));
});

test('kan ikke endre noen som har mer tilgang enn en selv', () => {
  const down = withToggledLevel(adminRow, 'administrator', false);
  assert.equal(checkPersonChange({ actor: leader, policy, before: adminRow, after: down }).ok, false);
});

test('administrator kan gi administrator til andre (selskapet velger selv)', () => {
  const toAdmin = withToggledLevel(staff, 'administrator', true);
  assert.equal(checkPersonChange({ actor: admin, policy, before: staff, after: toAdmin }).ok, true);
});

test('avvik i matrisen: heve bare opp til eget trinn, senke alltid', () => {
  assert.equal(canSetGrant({ actor: leader, resourceId: 'iso', grant: 'write', current: 'see' }), true);
  assert.equal(canSetGrant({ actor: leader, resourceId: 'companyProfile', grant: 'write', current: 'see' }), false);
  assert.equal(canSetGrant({ actor: leader, resourceId: 'accessControl', grant: 'write', current: 'none' }), false);
  assert.equal(canSetGrant({ actor: leader, resourceId: 'companyProfile', grant: 'none', current: 'write' }), true);
  const withOverride = { ...staff, company: { ...staff.company, accessOverrides: { companyProfile: 'write' } } };
  assert.equal(checkPersonChange({ actor: leader, policy, before: staff, after: withOverride }).ok, false);
});
