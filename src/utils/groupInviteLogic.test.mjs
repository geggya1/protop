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

test('FL-23: plassholdernøkkelen er en hash av hele e-posten', async () => {
  const { invitePlaceholderKey } = await import('./groupInviteLogic.js');
  const a = invitePlaceholderKey({ email: 'ola.n@firma.no' });
  const b = invitePlaceholderKey({ email: 'olan@firma.no' });
  assert.notEqual(a, b);
  assert.equal(a, invitePlaceholderKey({ email: 'OLA.N@firma.no ' }));
  assert.match(a, /^inv_[0-9a-z]+$/);
  assert.notEqual(invitePlaceholderKey({ phone: '+4799887766' }), invitePlaceholderKey({ phone: '+4799887767' }));
});

test('FL-10: invitasjonen utløper etter 30 dager', async () => {
  const { inviteExpired, inviteExpiresAt, INVITE_TTL_DAYS } = await import('./groupInviteLogic.js');
  const now = new Date('2026-10-27T12:00:00.000Z');
  assert.equal(INVITE_TTL_DAYS, 30);
  assert.equal(inviteExpiresAt(now), '2026-11-26T12:00:00.000Z');
  assert.equal(inviteExpired({ expiresAt: '2026-10-27T11:59:00.000Z' }, now), true);
  assert.equal(inviteExpired({ expiresAt: '2026-11-01T00:00:00.000Z' }, now), false);
  // Eldre invitasjoner uten frist: 30 dager etter opprettelsen.
  assert.equal(inviteExpired({ createdAt: '2026-09-01T00:00:00.000Z' }, now), true);
  assert.equal(inviteExpired({ createdAt: { toMillis: () => Date.parse('2026-10-20T00:00:00.000Z') } }, now), false);
  assert.equal(inviteExpired({}, now), false);
  const invite = inviteFromPlaceholder({ placeholder: {}, family: {}, uid: 'x', now: '2026-10-27T12:00:00.000Z' });
  assert.equal(invite.expiresAt, '2026-11-26T12:00:00.000Z');
});

test('FL-05: invitasjoner som ikke lenger gjelder, lukkes i innboksen', async () => {
  const { isStaleInviteCode, staleInboxStatus } = await import('./groupInviteLogic.js');
  for (const code of ['not-found', 'gone', 'already-handled', 'expired', 'revoked', 'no-employee', 'forbidden']) {
    assert.equal(isStaleInviteCode(code), true, code);
  }
  assert.equal(isStaleInviteCode('email-not-verified'), false);
  assert.equal(staleInboxStatus('accepted'), 'accepted');
  assert.equal(staleInboxStatus('pending'), 'expired');
  assert.match(inviteResponseMessage('expired'), /utløpt/);
  assert.match(inviteResponseMessage('no-employee'), /trukket tilbake/);
});
