import assert from 'node:assert/strict';
import {
  buildFriendInviteMessage,
  buildFriendInviteSms,
} from './friendInviteCopy.js';

const existing = buildFriendInviteMessage({
  to: 'a@b.c',
  name: 'Ada',
  fromName: 'Geir',
  registerUrl: 'https://www.protop.no/friend-invite/x',
  existingUser: true,
});
assert.ok(existing.subject.includes('Geir'));
assert.ok(existing.text.includes('venneforespørsel'));

const neu = buildFriendInviteMessage({
  to: 'a@b.c',
  name: 'Ada',
  fromName: 'Ola Nordmann',
  registerUrl: 'https://www.protop.no/register?friendInvite=tok',
  existingUser: false,
});
// L-33: tydelig avsender, én melding uten purringer, ingen markedsføring.
assert.equal(neu.subject, 'Ola Nordmann inviterer deg til ProTop');
assert.ok(neu.text.includes('Se invitasjonen: https://www.protop.no/register?friendInvite=tok'));
assert.match(neu.text, /ingen purringer/);
assert.match(neu.text, /Sendt av ProTop \(protop\.no\) på vegne av Ola Nordmann\./);
for (const text of [neu.text, neu.html, existing.text, existing.html]) {
  assert.doesNotMatch(text, /gratis|tilbud|rabatt|famili/i);
}
assert.match(neu.html, /<strong>Ola Nordmann<\/strong> inviterer deg til ProTop/);

// Uten navn står det ikke «Noen».
assert.match(buildFriendInviteMessage({ to: 'a@b.c', registerUrl: 'https://x' }).subject, /^En ProTop-bruker inviterer deg/);

const sms = buildFriendInviteSms({
  name: 'Ada',
  fromName: 'Geir',
  registerUrl: 'https://www.protop.no/x',
  existingUser: false,
});
assert.ok(sms.includes('Geir inviterer deg til ProTop'));
assert.match(sms, /ingen purringer/);
assert.ok(sms.length <= 160 + 40, `SMS-en er for lang (${sms.length})`);

console.log('friendInvite.copy.test.mjs: ok');
