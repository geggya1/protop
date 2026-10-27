import assert from 'node:assert/strict';
import { FROM_NAME, sendMail } from './mail.js';
import { buildInviteMessage } from './inviteMessage.js';
import { SMS_SENDER, buildInviteSms, sendSms } from './sms.js';
import { buildVerifyEmailHtml } from './emailVerify.js';

// Invitasjonsflyten (e-post, SMS, bekreftelse) sendes fra protop.no og skal aldri si Weekplan.
const noWeekplan = (value, where) => {
  assert.doesNotMatch(JSON.stringify(value), /weekplan/i, `${where} nevner Weekplan`);
};

assert.equal(FROM_NAME, 'ProTop');
assert.equal(SMS_SENDER, 'ProTop');

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push({ url: String(url), body: JSON.parse(init.body) });
  return { ok: true, text: async () => '{}' };
};

const invite = buildInviteMessage({
  to: 'goa@consult1.no',
  name: 'Geir Ove Andersen',
  familyId: 'fam1',
  familyName: 'CONSULT1 AS',
  groupType: 'organization',
  registerUrl: 'https://www.protop.no/register?email=goa%40consult1.no&familyId=fam1',
});

await sendMail('xkeysib-test-key-123', invite);
const brevo = calls.at(-1).body;
assert.equal(brevo.sender.name, 'ProTop');
assert.equal(brevo.sender.email, 'noreply@protop.no');
assert.equal(brevo.replyTo.name, 'ProTop');
noWeekplan(brevo, 'Brevo-e-posten');

await sendMail('re_test-key-123456', invite);
const resend = calls.at(-1).body;
assert.equal(resend.from, 'ProTop <noreply@protop.no>');
noWeekplan(resend, 'Resend-e-posten');

await sendMail('SG.test-key-123456', invite);
const sendgrid = calls.at(-1).body;
assert.equal(sendgrid.from.name, 'ProTop');
assert.equal(sendgrid.reply_to.name, 'ProTop');
noWeekplan(sendgrid, 'SendGrid-e-posten');

for (const groupType of ['organization', 'company', 'family', 'team', 'class']) {
  for (const existingUser of [false, true]) {
    const message = buildInviteMessage({
      to: 'a@b.no', name: 'Ada', familyId: 'g1', familyName: 'Gruppa', groupType,
      registerUrl: 'https://www.protop.no/register', existingUser,
    });
    noWeekplan(message, `Invitasjonen (${groupType}, eksisterende=${existingUser})`);
    assert.match(message.subject, /ProTop/);
    assert.match(message.text, /Hilsen ProTop$/);

    const sms = buildInviteSms({
      name: 'Ada', familyName: 'Gruppa', groupType, registerUrl: 'https://www.protop.no/register', existingUser,
    });
    noWeekplan(sms, `Invitasjons-SMS (${groupType})`);
    assert.match(sms, /ProTop/);
  }
}

await sendSms('xkeysib-test-key-123', { to: '+4791234567', content: 'Hei' });
assert.equal(calls.at(-1).body.sender, 'ProTop');

const verifyHtml = buildVerifyEmailHtml('https://www.protop.no/verify-email?vt=abc');
noWeekplan(verifyHtml, 'Bekreftelses-e-posten');
assert.match(verifyHtml, /Hilsen ProTop/);

console.log('inviteBrand.test.mjs: ok');
