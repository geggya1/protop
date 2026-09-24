/**
 * Microsoft identity platform helpers for Outlook calendar OAuth.
 *
 * Confidential Web clients (redirect URI type "Web" + client secret) issue
 * refresh tokens that Cloud Functions can renew without a daily sign-in.
 * SPA redirect URIs still need an Origin header and max out at 24h
 * (AADSTS700084 / AADSTS9002327).
 *
 * @see https://github.com/AzureAD/microsoft-authentication-library-for-js/issues/2482
 */

export const MS_OAUTH_SCOPES = 'openid offline_access User.Read Calendars.Read Calendars.Read.Shared';
/**
 * Incremental mail consent — do not include calendar scopes here.
 * Requesting Calendars.* again makes Microsoft's consent UI look like a calendar login,
 * and the returned token.scope may omit Mail.Read (exchange then looked like a calendar connect).
 */
export const MS_MAIL_OAUTH_SCOPES = 'openid offline_access User.Read Mail.Read Mail.ReadWrite Mail.Send';

/** Firebase account sign-in — reuse the Azure-registered /oauth/calendar redirect. */
export const MS_SIGNIN_OAUTH_SCOPES = 'openid profile email offline_access User.Read';

/**
 * Only allow token exchange for Weekplan redirect URIs (account sign-in).
 * Azure already has /oauth/calendar; Firebase's /__/auth/handler is often missing.
 */
export function isAllowedMicrosoftSignInRedirectUri(redirectUri) {
  try {
    const u = new URL(String(redirectUri || ''));
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'))) {
      return false;
    }
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/\/$/, '') || '/';
    if (path !== '/oauth/calendar') return false;
    if (host === 'protop.no' || host === 'www.protop.no') return true;
    if (host === 'protop-c189c.web.app' || host === 'protop-c189c.firebaseapp.com') return true;
    if (host === 'localhost' || host === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}

/** Union of OAuth scope strings without dropping previously granted ones. */
export function mergeOauthScopes(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const raw of String(part || '').split(/\s+/)) {
      const scope = raw.trim();
      if (!scope) continue;
      const key = scope.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(scope);
    }
  }
  return out.join(' ');
}
export const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
export const DEFAULT_OAUTH_ORIGIN = 'https://protop.no';

export function originFromRedirectUri(redirectUri, fallback = DEFAULT_OAUTH_ORIGIN) {
  try {
    const u = new URL(String(redirectUri || ''));
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin;
  } catch {
    // ignore
  }
  return fallback;
}

export function microsoftTokenHeaders(origin) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (origin) headers.Origin = origin;
  return headers;
}

/** Web + client secret: no Origin. SPA/public: spoof the app origin. */
export function microsoftTokenRequestHeaders({ confidential, redirectUri, oauthOrigin } = {}) {
  if (confidential) {
    return { 'Content-Type': 'application/x-www-form-urlencoded' };
  }
  const origin = oauthOrigin || originFromRedirectUri(redirectUri, DEFAULT_OAUTH_ORIGIN);
  return microsoftTokenHeaders(origin);
}

export function isSpaTokenRestrictionError(raw) {
  const s = String(raw || '');
  return /AADSTS9002327|cross-origin requests|SPA client-type/i.test(s);
}

/** Shown when Azure still has the redirect URI as SPA while we have a client secret. */
export const AZURE_WEB_REDIRECT_MESSAGE = [
  'Outlook-redirect i Azure er fortsatt SPA, og da varer innloggingen bare 24 timer.',
  'Flytt https://www.protop.no/oauth/calendar til plattform Web (ikke SPA),',
  'fjern den fra SPA, og trykk «Koble til på nytt».',
].join(' ');

export function confidentialExchangeFailureMessage(raw) {
  if (isSpaTokenRestrictionError(raw)) return AZURE_WEB_REDIRECT_MESSAGE;
  return friendlyMicrosoftAuthMessage(raw);
}

export function microsoftGrantedCalendarAccess(tokenResponse) {
  const granted = String(tokenResponse?.scope || '');
  if (!granted) return true;
  return /calendars\.read/i.test(granted);
}

export function microsoftGrantedMailAccess(tokenOrScope) {
  const granted = String(tokenOrScope?.scope || tokenOrScope || '');
  return /mail\.read/i.test(granted);
}

/**
 * Map Microsoft identity error codes to short Norwegian copy.
 * Raw Azure dumps should never reach the UI.
 */
export function friendlyMicrosoftAuthMessage(raw) {
  const s = String(raw || '');
  if (/AADSTS9002327|cross-origin requests/i.test(s)) {
    return AZURE_WEB_REDIRECT_MESSAGE;
  }
  if (/AADSTS70008|AADSTS700084|AADSTS700082|AADSTS9002313/i.test(s)) {
    return 'Outlook-økten utløp. Trykk «Koble til på nytt» under kalenderinnstillinger.';
  }
  if (/token utløpt|fornyelse feilet/i.test(s) && /outlook|microsoft|aadsts/i.test(s)) {
    return 'Outlook-økten utløp. Trykk «Koble til på nytt» under kalenderinnstillinger.';
  }
  if (/AADSTS/i.test(s)) {
    return 'Outlook-innloggingen feilet. Trykk «Koble til på nytt» under kalenderinnstillinger.';
  }
  return s;
}

export function isMicrosoftAuthExpiredMessage(raw) {
  const s = String(raw || '');
  if (/delt kalender|kunne ikke leses|ICS-henting/i.test(s)) return false;
  return /AADSTS70008|AADSTS700084|AADSTS700082|AADSTS9002313|AADSTS9002327|Outlook-økten utløp|Outlook-token utløpt|fornyelse feilet/i.test(s);
}
