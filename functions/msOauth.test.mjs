import assert from 'node:assert/strict';
import {
  AZURE_WEB_REDIRECT_MESSAGE,
  confidentialExchangeFailureMessage,
  friendlyMicrosoftAuthMessage,
  isAllowedMicrosoftSignInRedirectUri,
  isMicrosoftAuthExpiredMessage,
  isSpaTokenRestrictionError,
  microsoftTokenRequestHeaders,
  microsoftGrantedMailAccess,
  mergeOauthScopes,
  MS_MAIL_OAUTH_SCOPES,
  MS_SIGNIN_OAUTH_SCOPES,
  originFromRedirectUri,
} from './msOauth.js';

assert.equal(originFromRedirectUri('https://www.protop.no/oauth/calendar'), 'https://www.protop.no');
assert.equal(isSpaTokenRestrictionError('AADSTS9002327: The request is a cross-origin request'), true);
assert.equal(isSpaTokenRestrictionError('AADSTS700084'), false);

assert.match(confidentialExchangeFailureMessage('AADSTS9002327: SPA'), /plattform Web/);
assert.equal(confidentialExchangeFailureMessage('AADSTS9002327'), AZURE_WEB_REDIRECT_MESSAGE);
assert.match(friendlyMicrosoftAuthMessage('AADSTS700084: SPA refresh expired'), /Outlook-økten utløp/);
assert.equal(friendlyMicrosoftAuthMessage('AADSTS9002327'), AZURE_WEB_REDIRECT_MESSAGE);
assert.equal(
  isMicrosoftAuthExpiredMessage('En delt kalender i goa@invest-as.no kunne ikke leses. Koble til på nytt og godkjenn kalenderlesing.'),
  false,
);
assert.equal(isMicrosoftAuthExpiredMessage('Outlook-økten utløp. Trykk «Koble til på nytt» under kalenderinnstillinger.'), true);

const webHeaders = microsoftTokenRequestHeaders({
  confidential: true,
  redirectUri: 'https://www.protop.no/oauth/calendar',
});
assert.equal(webHeaders.Origin, undefined);
assert.equal(webHeaders['Content-Type'], 'application/x-www-form-urlencoded');

const spaHeaders = microsoftTokenRequestHeaders({
  confidential: false,
  redirectUri: 'https://www.protop.no/oauth/calendar',
});
assert.equal(spaHeaders.Origin, 'https://www.protop.no');

assert.equal(microsoftGrantedMailAccess('openid Mail.Read Mail.Send'), true);
assert.equal(microsoftGrantedMailAccess('openid Calendars.Read'), false);
assert.equal(microsoftGrantedMailAccess(''), false);
assert.equal(
  mergeOauthScopes('Calendars.Read User.Read', 'Mail.Read Mail.Send User.Read'),
  'Calendars.Read User.Read Mail.Read Mail.Send',
);
assert.ok(!/calendars/i.test(MS_MAIL_OAUTH_SCOPES));
assert.ok(/mail\.read/i.test(MS_MAIL_OAUTH_SCOPES));
assert.ok(/openid/i.test(MS_SIGNIN_OAUTH_SCOPES));
assert.ok(!/calendars/i.test(MS_SIGNIN_OAUTH_SCOPES));

assert.equal(isAllowedMicrosoftSignInRedirectUri('https://www.protop.no/oauth/calendar'), true);
assert.equal(isAllowedMicrosoftSignInRedirectUri('https://protop.no/oauth/calendar'), true);
assert.equal(isAllowedMicrosoftSignInRedirectUri('https://www.protop.no/__/auth/handler'), false);
assert.equal(isAllowedMicrosoftSignInRedirectUri('https://evil.example/oauth/calendar'), false);

console.log('msOauth ok');
