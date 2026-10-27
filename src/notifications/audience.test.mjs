import assert from 'node:assert/strict';
import test from 'node:test';
import { setLevelGrant } from '../access/companyAccess.js';
import { notificationAccess } from './prefs.js';
import {
  INVITE_ACCESS,
  audienceText,
  canInviteToCompany,
  companyAllows,
  companyRecipients,
  levelsReceiving,
  visibleNotificationGroups,
} from './audience.js';

function person(uid, accessLevel, extra = {}) {
  return {
    id: `emp-${uid}`,
    personUid: uid,
    company: { accessLevel, status: 'active', ...extra },
  };
}

const EMPLOYEES = [
  person('sjef', 'leder'),
  person('admin2', 'administrator'),
  person('avd', 'avdelingsleder'),
  person('ans', 'ansatt'),
  person('innleid', 'innleie_ekstern'),
  person('regnskap', 'regnskap_ekstern'),
  person('sluttet', 'leder', { status: 'inactive' }),
];

const COMPANY = {
  id: 'firma',
  type: 'company',
  ownerUid: 'eier',
  adminUids: ['eier'],
  members: ['eier', 'sjef', 'admin2', 'avd', 'ans', 'innleid', 'regnskap', 'sluttet', 'uten-rad'],
  company: {},
};

function ids(list) {
  return [...list].sort();
}

test('forespørsel om å bli med: bare eier, HR-ansvarlig, Øverste leder og Administrator (standard)', () => {
  const got = companyRecipients({ family: COMPANY, employees: EMPLOYEES, type: 'companyJoinRequest', exclude: ['ny'] });
  assert.deepEqual(ids(got), ['admin2', 'eier', 'sjef']);
  // HR-ansvarlig (fagansvar) har Admin på Ansatte og får også forespørslene.
  assert.deepEqual(levelsReceiving({ policy: undefined, type: 'companyJoinRequest' }), ['HR-ansvarlig', 'Øverste leder', 'Administrator']);
  assert.equal(audienceText({ policy: undefined, type: 'companyJoinRequest' }), 'HR-ansvarlig, Øverste leder og Administrator (styres i tilgangsstyringen)');
});

test('ferie og bedriftsveggen gjelder alle i bedriften', () => {
  for (const type of ['vacationPlan', 'companyWallPost']) {
    const got = companyRecipients({ family: COMPANY, employees: EMPLOYEES, type });
    assert.deepEqual(ids(got), ids(COMPANY.members), type);
  }
  assert.equal(audienceText({ type: 'vacationPlan' }), 'Alle ansatte');
});

test('tilgangsstyringen bestemmer: endret nivå og eget avvik på en person', () => {
  const policy = setLevelGrant(setLevelGrant(undefined, 'avdelingsleder', 'employees', 'write'), 'leder', 'employees', 'read');
  const family = { ...COMPANY, company: { accessPolicy: policy } };
  const got = companyRecipients({ family, employees: EMPLOYEES, type: 'companyJoinRequest' });
  assert.deepEqual(ids(got), ['admin2', 'avd', 'eier']);
  assert.deepEqual(levelsReceiving({ policy, type: 'companyJoinRequest' }), ['HR-ansvarlig', 'Avdelingsleder', 'Administrator']);

  const withOverride = EMPLOYEES.map((row) => (row.personUid === 'ans'
    ? { ...row, company: { ...row.company, accessOverrides: { employees: 'write' } } }
    : row));
  assert.equal(companyAllows({ family: COMPANY, employees: withOverride, uid: 'ans', type: 'companyJoinRequest' }), true);
  assert.equal(companyAllows({ family: COMPANY, employees: EMPLOYEES, uid: 'ans', type: 'companyJoinRequest' }), false);
});

test('gruppeadministrator får varselet selv uten ansattrad; sluttet leder får det ikke', () => {
  const family = { ...COMPANY, adminUids: ['eier', 'uten-rad'] };
  assert.equal(companyAllows({ family, employees: EMPLOYEES, uid: 'uten-rad', type: 'companyJoinRequest' }), true);
  assert.equal(companyAllows({ family: COMPANY, employees: EMPLOYEES, uid: 'uten-rad', type: 'companyJoinRequest' }), false);
  assert.equal(companyAllows({ family: COMPANY, employees: EMPLOYEES, uid: 'sluttet', type: 'companyJoinRequest' }), false);
  // Typer uten krav er alltid lov.
  assert.equal(companyAllows({ family: COMPANY, employees: EMPLOYEES, uid: 'ans', type: 'messageReceived' }), true);
});

function typeIds(groups) {
  return groups.flatMap((group) => group.types.map((type) => type.id));
}

test('innstillingssiden viser bare typene personen kan få', () => {
  const familyGroup = { family: { id: 'hjem', type: 'family' }, employees: [] };
  const ansatt = visibleNotificationGroups({ uid: 'ans', memberships: [{ family: COMPANY, employees: EMPLOYEES.filter((r) => r.personUid === 'ans') }] });
  assert.ok(!typeIds(ansatt).includes('companyJoinRequest'));
  assert.ok(typeIds(ansatt).includes('vacationPlan'));
  assert.ok(!typeIds(ansatt).includes('attestPending'), 'ikke i en familie');
  const vacation = ansatt.flatMap((g) => g.types).find((t) => t.id === 'vacationPlan');
  assert.equal(vacation.audience, 'Alle ansatte');

  const sjef = visibleNotificationGroups({ uid: 'sjef', memberships: [{ family: COMPANY, employees: EMPLOYEES.filter((r) => r.personUid === 'sjef') }, familyGroup] });
  const join = sjef.flatMap((g) => g.types).find((t) => t.id === 'companyJoinRequest');
  assert.equal(join.audience, 'HR-ansvarlig, Øverste leder og Administrator (styres i tilgangsstyringen)');
  assert.ok(typeIds(sjef).includes('attestPending'));

  const privat = visibleNotificationGroups({ uid: 'x', memberships: [familyGroup] });
  for (const id of ['companyJoinRequest', 'vacationPlan', 'companyWallPost']) assert.ok(!typeIds(privat).includes(id), id);
  assert.ok(typeIds(privat).includes('messageReceived'));
  assert.ok(privat.every((group) => group.types.length > 0));
});

test('samme regel for å få forespørselen og for å kunne invitere', () => {
  assert.deepEqual(notificationAccess('companyJoinRequest'), INVITE_ACCESS);
  for (const uid of ['eier', 'sjef', 'admin2', 'avd', 'ans', 'innleid', 'regnskap', 'sluttet', 'uten-rad']) {
    assert.equal(
      canInviteToCompany({ family: COMPANY, employees: EMPLOYEES, uid }),
      companyAllows({ family: COMPANY, employees: EMPLOYEES, uid, type: 'companyJoinRequest' }),
      uid,
    );
  }
  assert.equal(canInviteToCompany({ family: COMPANY, employees: EMPLOYEES, uid: 'sjef' }), true);
  assert.equal(canInviteToCompany({ family: COMPANY, employees: EMPLOYEES, uid: 'avd' }), false);
});

