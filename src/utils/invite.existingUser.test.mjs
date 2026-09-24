import assert from 'node:assert/strict';
import { buildInviteSms } from '../../functions/sms.js';

/**
 * Existing-user invites must ask to accept — never say "Registrer deg".
 */

function familyInviteAcceptUrl({ familyId, inviteId }) {
  const fid = encodeURIComponent(String(familyId || ''));
  const iid = encodeURIComponent(String(inviteId || ''));
  return `https://www.protop.no/family-invite/${fid}/${iid}`;
}

const acceptUrl = familyInviteAcceptUrl({ familyId: 'fam1', inviteId: 'inv2' });
assert.equal(acceptUrl, 'https://www.protop.no/family-invite/fam1/inv2');

const existingSms = buildInviteSms({
  name: 'Vigdis',
  familyName: 'Andersen',
  groupType: 'family',
  registerUrl: acceptUrl,
  existingUser: true,
});
assert.match(existingSms, /godta invitasjonen/i);
assert.doesNotMatch(existingSms, /Registrer deg/i);
assert.match(existingSms, /Andersen/);

const newSms = buildInviteSms({
  name: 'Ny',
  familyName: 'Andersen',
  groupType: 'family',
  registerUrl: 'https://www.protop.no/register?email=a%40b.no',
  existingUser: false,
});
assert.match(newSms, /Registrer deg/);

console.log('invite.existingUser.test.mjs: ok');
