import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acceptedNotice,
  inviteFromPlaceholder,
  inviteResponseMessage,
  isCompanyGroupType,
  isConfirmedMember,
  isPendingPlaceholder,
} from './groupInviteLogic.js';

test('bare ventende e-postplassholdere blir til en invitasjon som må godtas', () => {
  const row = { email: 'Nina@Firma.no', placeholder: true, inviteStatus: 'pending' };
  assert.equal(isPendingPlaceholder(row, 'nina@firma.no'), true);
  assert.equal(isPendingPlaceholder(row, 'annen@firma.no'), false);
  assert.equal(isPendingPlaceholder({ ...row, inviteStatus: 'accepted' }, 'nina@firma.no'), false);
  assert.equal(isPendingPlaceholder({ ...row, inviteStatus: 'declined' }, 'nina@firma.no'), false);
  assert.equal(isPendingPlaceholder({ ...row, deleted: true }, 'nina@firma.no'), false);
  assert.equal(isPendingPlaceholder({ ...row, inviteKind: 'existing' }, 'nina@firma.no'), false);
});

test('invitert er ikke medlem før Godta', () => {
  assert.equal(isConfirmedMember({ members: ['own'] }, 'nina'), false);
  assert.equal(isConfirmedMember({ members: ['own', 'nina'] }, 'nina'), true);
  assert.equal(isConfirmedMember({ activeUsers: ['nina'] }, 'nina'), true);
  assert.equal(isConfirmedMember({}, ''), false);
});

test('invitasjonen arver administrator og rolle fra plassholderen, men aldri for besteforeldre', () => {
  const invite = inviteFromPlaceholder({
    placeholder: { name: 'Nina', createdBy: 'own', admin: true },
    placeholderId: 'ninafirmano',
    family: { name: 'Rådgiver AS', type: 'organization' },
    familyId: 'A',
    uid: 'nina',
    authEmail: 'NINA@firma.no',
    now: 'nå',
  });
  assert.equal(invite.status, 'pending');
  assert.equal(invite.inviteKind, 'existing');
  assert.equal(invite.inviteeUid, 'nina');
  assert.equal(invite.inviteeEmail, 'nina@firma.no');
  assert.equal(invite.invitedBy, 'own');
  assert.equal(invite.asAdmin, true);
  assert.equal(invite.groupType, 'organization');
  const grandparent = inviteFromPlaceholder({
    placeholder: { admin: true, adultRole: 'grandparent' }, family: { type: 'family' }, uid: 'x',
  });
  assert.equal(grandparent.asAdmin, false);
  assert.equal(grandparent.asGrandparent, true);
});

test('tekster for bedrift og feilkoder', () => {
  assert.equal(isCompanyGroupType('organization'), true);
  assert.equal(isCompanyGroupType('company'), true);
  assert.equal(isCompanyGroupType('family'), false);
  assert.equal(acceptedNotice('organization', 'Rådgiver AS'), 'Du er med i bedriften «Rådgiver AS».');
  assert.match(inviteResponseMessage('email-not-verified'), /Bekreft e-posten/);
  assert.equal(inviteResponseMessage('ukjent'), '');
});
