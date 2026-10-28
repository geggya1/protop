/**
 * Microsoft-innlogging og bekreftet e-post (SEC-17).
 *
 * Firebase merker ikke e-post fra Microsoft som bekreftet, og i Entra ID kan `email` være
 * et felt administratoren i en annen tenant har skrevet inn (nOAuth). Invitasjoner knyttes
 * på e-post, så serveren regner bare e-posten som bekreftet når Microsofts eget ID-token
 * sier det:
 *   - personlig Microsoft-konto (tenant 9188040d-…): Microsoft har bekreftet adressen;
 *   - jobb- eller skolekonto: `xms_edov` (domeneeier bekreftet) eller `email_verified` er sann,
 *     eller adressen står i `verified_primary_email`/`verified_secondary_email` (valgfrie claims
 *     fra brukerens autoritative e-post i Entra ID).
 * Firebase-tokenet selv har ingen av disse: for microsoft.com gir det bare `email`,
 * `email_verified` (usann fra Microsoft) og `firebase.identities`. Derfor sjekkes Microsofts
 * ID-token rett etter innlogging. Uten bekreftelse derfra brukes lenken fra ProTop.
 * Da settes emailVerified på Firebase-kontoen, og invitasjonene virker som for andre.
 *
 * Tokenet sjekkes mot Microsofts nøkler (RS256), utsteder, mottaker (appens klient-id)
 * og utløp. Ren logikk her; nøklene hentes av kalleren (fetchMicrosoftKeys).
 */
import { createPublicKey, verify } from 'node:crypto';

/** Personlige Microsoft-kontoer (outlook.com, hotmail.com, live.com …). */
export const MICROSOFT_CONSUMER_TENANT = '9188040d-6c67-4c5b-b112-36a304b66dad';

/** Samme standard som klienten (src/utils/calendarIntegration.js) og kalenderfunksjonene. */
export const DEFAULT_MICROSOFT_CLIENT_ID = 'd641e51b-4503-43d8-b2f4-332acb296864';

export const MICROSOFT_KEYS_URL = 'https://login.microsoftonline.com/common/discovery/v2.0/keys';

const CLOCK_SKEW_SEC = 300;

/** Klient-id-ene tokenet kan være utstedt til: standard, MICROSOFT_CLIENT_ID og MICROSOFT_SIGNIN_CLIENT_IDS. */
export function microsoftAudiences(env = process.env) {
  const out = new Set([DEFAULT_MICROSOFT_CLIENT_ID]);
  for (const raw of [env?.MICROSOFT_CLIENT_ID, ...String(env?.MICROSOFT_SIGNIN_CLIENT_IDS || '').split(',')]) {
    const id = String(raw || '').trim();
    if (id) out.add(id);
  }
  return [...out];
}

function b64urlJson(part) {
  return JSON.parse(Buffer.from(String(part || ''), 'base64url').toString('utf8'));
}

/** Header og claims uten verifisering (for å finne nøkkelen). Kaster ved ugyldig format. */
export function decodeJwt(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('bad-token');
  return { header: b64urlJson(parts[0]), claims: b64urlJson(parts[1]), parts };
}

function truthy(value) {
  return value === true || value === 1 || value === 'true' || value === '1';
}

function emailList(value) {
  const list = Array.isArray(value) ? value : [value];
  return list.map((row) => String(row || '').trim().toLowerCase()).filter(Boolean);
}

/**
 * Signatur og standardfelt. keys = JWKS-nøklene ([{ kid, kty, n, e }]).
 * Svar: { ok: true, claims } eller { ok: false, error }.
 */
export function verifyMicrosoftIdToken(token, { keys = [], audiences = microsoftAudiences(), now = Date.now() } = {}) {
  let decoded;
  try {
    decoded = decodeJwt(token);
  } catch {
    return { ok: false, error: 'bad-token' };
  }
  const { header, claims, parts } = decoded;
  if (header?.alg !== 'RS256') return { ok: false, error: 'bad-alg' };
  const jwk = (Array.isArray(keys) ? keys : []).find((key) => key?.kid && key.kid === header.kid && key.kty === 'RSA');
  if (!jwk) return { ok: false, error: 'unknown-key' };
  let valid = false;
  try {
    const publicKey = createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
    valid = verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), publicKey, Buffer.from(parts[2], 'base64url'));
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, error: 'bad-signature' };
  const tid = String(claims?.tid || '');
  if (!tid || claims.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) return { ok: false, error: 'bad-issuer' };
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.some((id) => audiences.includes(id))) return { ok: false, error: 'bad-audience' };
  const sec = Math.floor(now / 1000);
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SEC < sec) return { ok: false, error: 'expired' };
  if (Number.isFinite(claims.nbf) && claims.nbf - CLOCK_SKEW_SEC > sec) return { ok: false, error: 'not-yet-valid' };
  return { ok: true, claims };
}

/**
 * Er e-posten i tokenet bekreftet av Microsoft, og er den den samme som Firebase-kontoen har?
 * Svar: { verified: boolean, email, reason }.
 */
export function microsoftEmailVerdict(claims, { accountEmail = '' } = {}) {
  const consumer = String(claims?.tid || '') === MICROSOFT_CONSUMER_TENANT;
  const email = String(claims?.email || (consumer ? claims?.preferred_username : '') || '').trim().toLowerCase();
  const account = String(accountEmail || '').trim().toLowerCase();
  const verifiedEmails = [...emailList(claims?.verified_primary_email), ...emailList(claims?.verified_secondary_email)];
  if (account && verifiedEmails.includes(account)) return { verified: true, email: account, reason: 'verified_email' };
  if (!email) return { verified: false, email: '', reason: 'no-email' };
  if (!account || email !== account) return { verified: false, email, reason: 'other-email' };
  if (consumer) return { verified: true, email, reason: 'consumer' };
  if (truthy(claims?.xms_edov)) return { verified: true, email, reason: 'xms_edov' };
  if (truthy(claims?.email_verified)) return { verified: true, email, reason: 'email_verified' };
  return { verified: false, email, reason: 'unverified' };
}

/**
 * Merk Firebase-kontoen som bekreftet når Microsofts token sier det.
 * auth = Admin SDK Auth (getUser/updateUser). loadKeys({ force }) henter nøklene.
 * Svar: { ok, verified, reason } eller { ok: false, error }.
 */
export async function confirmMicrosoftEmailFor(uid, idToken, {
  auth, loadKeys = fetchMicrosoftKeys, now = Date.now(), audiences = microsoftAudiences(),
} = {}) {
  const user = await auth.getUser(uid).catch(() => null);
  if (!user?.email) return { ok: false, error: 'no-email' };
  if (!(user.providerData || []).some((p) => p?.providerId === 'microsoft.com')) {
    return { ok: false, error: 'not-microsoft' };
  }
  if (user.emailVerified) return { ok: true, verified: true, already: true };
  let checked = verifyMicrosoftIdToken(idToken, { keys: await loadKeys({}), audiences, now });
  if (!checked.ok && checked.error === 'unknown-key') {
    // Microsoft roterer nøklene: hent på nytt én gang.
    checked = verifyMicrosoftIdToken(idToken, { keys: await loadKeys({ force: true }), audiences, now });
  }
  if (!checked.ok) return { ok: false, error: checked.error };
  const verdict = microsoftEmailVerdict(checked.claims, { accountEmail: user.email });
  if (!verdict.verified) return { ok: true, verified: false, reason: verdict.reason };
  await auth.updateUser(uid, { emailVerified: true });
  return { ok: true, verified: true, reason: verdict.reason };
}

let keyCache = { at: 0, keys: [] };

/** Microsofts offentlige nøkler, i minnet i en time. */
export async function fetchMicrosoftKeys({ fetchImpl = fetch, now = Date.now(), force = false } = {}) {
  if (!force && keyCache.keys.length && now - keyCache.at < 60 * 60 * 1000) return keyCache.keys;
  const res = await fetchImpl(MICROSOFT_KEYS_URL);
  if (!res?.ok) throw new Error(`microsoft-keys-${res?.status || 'failed'}`);
  const json = await res.json();
  const keys = Array.isArray(json?.keys) ? json.keys : [];
  keyCache = { at: now, keys };
  return keys;
}
