/**
 * Medlemskapet følger ansettelsen (FL-01 / SEC-08 / DS-06).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  EMPLOYMENT_CHANGE_DENIED,
  canChangeEmployment,
  employmentChangeBlocked,
  employmentChangeNeedsServer,
  inviteBelongsTo,
  inviteEmailsToRevoke,
  membershipEndedNotice,
  membershipPlan,
  membershipUid,
} from './membership.js';
import { claimEmployeeSeatPlan } from './invite.js';
import { allows, resolveActorAccess } from '../access/companyAccess.js';

const family = { ownerUid: 'own', members: ['own', 'kari', 'per'], adminUids: ['own'] };

function emp(id, uid, company = {}, invite = {}) {
  return {
    id,
    personUid: uid,
    person: { firstName: id, email: `${id}@firma.no` },
    company: { status: 'active', accessLevel: 'ansatt', ...company },
    invite,
  };
}

test('hvilken konto ansettelsen gjelder', () => {
  assert.equal(membershipUid(family, emp('k', 'kari')), 'kari');
  // personUid tømt av en gammel kopi: den som godtok, når hen fortsatt er medlem.
  assert.equal(membershipUid(family, emp('k', '', {}, { status: 'accepted', acceptedUid: 'kari' })), 'kari');
  assert.equal(membershipUid(family, emp('k', '', {}, { status: 'sent', parentKey: 'per' })), 'per');
  // Plassholdernøkkel for ny bruker er ingen konto.
  assert.equal(membershipUid(family, emp('k', '', {}, { status: 'sent', parentKey: 'karifirmano' })), '');
});

test('avsluttet ansettelse fjerner medlemskapet, men aldri eierens', () => {
  for (const company of [{ status: 'inactive' }, { status: 'deleted' }, { status: 'active', periodTo: '2001-01-01' }]) {
    assert.deepEqual(membershipPlan({ family, employee: emp('k', 'kari', company) }), { action: 'remove', uid: 'kari', listed: true });
  }
  assert.equal(membershipPlan({ family, employee: emp('o', 'own', { status: 'inactive' }) }).action, 'owner');
  assert.equal(membershipPlan({ family, employee: emp('x', '', { status: 'inactive' }) }).action, 'none');
});

test('en annen aktiv ansettelse for samme person holder medlemskapet', () => {
  const old = emp('gammel', 'kari', { status: 'deleted' });
  const plan = membershipPlan({ family, employee: old, employees: [old, emp('ny', 'kari')] });
  assert.equal(plan.action, 'keep');
  assert.equal(plan.reason, 'other-employment');
});

test('aktiv igjen: medlemskapet legges tilbake, administrator bare med nivået', () => {
  const removed = { ...family, members: ['own', 'per'] };
  assert.deepEqual(membershipPlan({ family: removed, employee: emp('k', 'kari') }), {
    action: 'restore', uid: 'kari', listed: false, admin: false,
  });
  const admin = emp('k', 'kari', { accessLevel: 'administrator', accessLevels: ['administrator'] });
  assert.equal(membershipPlan({ family: removed, employee: admin }).admin, true);
  assert.equal(membershipPlan({ family, employee: emp('k', 'kari') }).action, 'keep');
});

test('bare endringer som berører tilgangen går via serveren', () => {
  const active = emp('k', 'kari');
  assert.equal(employmentChangeNeedsServer(active, emp('k', 'kari', { status: 'inactive' })), true);
  assert.equal(employmentChangeNeedsServer(emp('k', 'kari', { status: 'inactive' }), active), true);
  assert.equal(employmentChangeNeedsServer(emp('k', 'kari', { status: 'inactive' }), emp('k', 'kari', { status: 'deleted' })), true);
  assert.equal(employmentChangeNeedsServer(active, emp('k', 'kari', { periodTo: '2001-01-01' })), true);
  assert.equal(employmentChangeNeedsServer(active, emp('k', 'kari', { status: 'leave' })), false);
  assert.equal(employmentChangeNeedsServer(active, emp('k', 'kari', { title: 'Bas' })), false);
  assert.equal(employmentChangeNeedsServer(null, active), false);
});

test('ventende invitasjoner som trekkes tilbake', () => {
  const kari = emp('k', '', {}, { status: 'sent', email: 'kari@firma.no' });
  const dup = emp('k2', '', {}, { status: 'sent', email: 'kari@firma.no' });
  assert.deepEqual(inviteEmailsToRevoke(kari, [kari]), ['k@firma.no', 'kari@firma.no']);
  // En annen åpen ansettelse har sendt invitasjon på samme e-post: den røres ikke.
  assert.deepEqual(inviteEmailsToRevoke(kari, [kari, dup]), ['k@firma.no']);
  assert.equal(inviteBelongsTo({ status: 'pending', inviteeUid: 'kari' }, { uid: 'kari' }), true);
  assert.equal(inviteBelongsTo({ status: 'pending', inviteeEmail: 'Kari@firma.no' }, { emails: ['kari@firma.no'] }), true);
  assert.equal(inviteBelongsTo({ status: 'accepted', inviteeUid: 'kari' }, { uid: 'kari' }), false);
});

test('varselet forklarer hva som har skjedd', () => {
  const notice = membershipEndedNotice('Rådgiver AS', 'Ola Eier');
  assert.equal(notice.title, 'Kontoen din er avsluttet');
  assert.match(notice.body, /Kontoen din i «Rådgiver AS» er avsluttet.*Kontakt Ola Eier/);
});

test('ved hver økt: avsluttet ansettelse knyttes ikke på nytt og gir ikke admin tilbake', () => {
  const closed = emp('k', 'kari', { status: 'inactive', accessLevel: 'administrator' }, { status: 'accepted', email: 'k@firma.no' });
  const plan = claimEmployeeSeatPlan({ employees: [closed], uid: 'kari', authEmail: 'k@firma.no' });
  assert.equal(plan.skipped, true);
  assert.equal(plan.closed, true);
  const ended = emp('k', 'kari', { periodTo: '2001-01-01' }, { status: 'sent', email: 'k@firma.no' });
  assert.equal(claimEmployeeSeatPlan({ employees: [ended], uid: 'kari', authEmail: 'k@firma.no' }).ok, false);
});

test('REV-07: avslutte og aktivere en ansettelse krever Admin på Ansatte, som på serveren', () => {
  // Samme beregning som serveren (actorRights i functions/companyMembership.js).
  const accessFor = (level) => {
    const actor = resolveActorAccess({ policy: null, employees: [emp(`e_${level}`, level, { accessLevels: [level] })], uid: level });
    return { ready: true, canAdmin: (resource) => allows(actor.grants, resource, 'write') };
  };
  const server = (level) => {
    const { grants } = resolveActorAccess({ policy: null, employees: [emp(`e_${level}`, level, { accessLevels: [level] })], uid: level });
    return allows(grants, 'employees', 'write') || allows(grants, 'accessControl', 'write');
  };
  for (const level of ['avdelingsleder', 'leder', 'hr_ansvarlig', 'administrator', 'ansatt']) {
    assert.equal(canChangeEmployment(accessFor(level)), server(level), level);
  }
  // Avdelingsleder (Begrenset redigering på Ansatte) kan ikke; Øverste leder og HR kan.
  assert.equal(canChangeEmployment(accessFor('avdelingsleder')), false);
  assert.equal(canChangeEmployment(accessFor('leder')), true);
  assert.equal(canChangeEmployment(accessFor('hr_ansvarlig')), true);
  assert.equal(canChangeEmployment({ ready: false, canAdmin: () => true }), false);

  const active = emp('k', 'kari');
  const ended = emp('k', 'kari', { periodTo: '2001-01-01' });
  assert.equal(employmentChangeBlocked({ before: active, after: ended, canChange: false }), true);
  assert.equal(employmentChangeBlocked({ before: active, after: emp('k', 'kari', { status: 'inactive' }), canChange: false }), true);
  assert.equal(employmentChangeBlocked({ before: active, after: ended, canChange: true }), false);
  // Vanlige endringer og nye poster stoppes ikke.
  assert.equal(employmentChangeBlocked({ before: active, after: emp('k', 'kari', { title: 'Bas' }), canChange: false }), false);
  assert.equal(employmentChangeBlocked({ before: null, after: ended, canChange: false }), false);
  assert.match(EMPLOYMENT_CHANGE_DENIED, /Admin på Ansatte/);
});
