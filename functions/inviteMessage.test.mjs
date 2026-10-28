import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildInviteMessage } from './inviteMessage.js';
import { buildInviteSms } from './sms.js';

const base = {
  to: 'nina@bygg.no',
  name: 'Nina Nyansatt',
  familyId: 'co',
  familyName: 'Eva Bygg AS',
  groupType: 'organization',
  registerUrl: 'https://www.protop.no/register?email=nina%40bygg.no&familyId=co',
};

test('bedriftsinvitasjonen sier hvem som inviterte (ANSATT-05)', () => {
  const mail = buildInviteMessage({ ...base, inviterName: 'Eva Eiersen' });
  assert.equal(mail.subject, 'Eva Eiersen inviterer deg til bedriften Eva Bygg AS på ProTop');
  assert.match(mail.text, /Eva Eiersen har invitert deg inn i bedriften «Eva Bygg AS» på ProTop\./);
  assert.match(mail.html, /<strong>Eva Eiersen<\/strong> har invitert deg inn i bedriften <strong>Eva Bygg AS<\/strong>/);
  const existing = buildInviteMessage({ ...base, inviterName: 'Eva Eiersen', existingUser: true });
  assert.match(existing.text, /Eva Eiersen har invitert deg inn i bedriften/);
  assert.match(buildInviteSms({ ...base, inviterName: 'Eva Eiersen' }), /Eva Eiersen har invitert deg inn i bedriften «Eva Bygg AS»/);
});

test('uten kjent avsender er teksten som før, og navnet escapes i HTML', () => {
  const plain = buildInviteMessage(base);
  assert.equal(plain.subject, 'Invitasjon til bedriften Eva Bygg AS på ProTop');
  assert.match(plain.text, /Du er invitert inn i bedriften «Eva Bygg AS» på ProTop\./);
  const odd = buildInviteMessage({ ...base, inviterName: 'Eva <b>' });
  assert.equal(odd.html.includes('<b>'), false);
});

test('navnet kommer fra den innloggede avsenderen, ikke fra klienten', () => {
  const src = readFileSync(new URL('./authCallables.js', import.meta.url), 'utf8');
  const v2 = src.slice(src.indexOf('export const sendInviteV2'), src.indexOf('export const sendEmailVerificationV2'));
  assert.match(v2, /const inviterName = await loadSenderName\(db, callerUid, \{ familyId, tokenName: req\.auth\?\.token\?\.name \}\)/g);
  assert.equal((v2.match(/loadSenderName\(/g) || []).length, 2, 'e-post og SMS');
  assert.doesNotMatch(v2, /req\.data[^\n]*inviterName|inviterName[^\n]*req\.data/);
});
