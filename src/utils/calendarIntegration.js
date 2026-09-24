import { httpsCallable } from 'firebase/functions';
import { OAuthProvider, onAuthStateChanged, signInWithCredential } from 'firebase/auth';
import { auth, functions } from '../../firebase';
import {
  clearOutlookGraphToken,
  fetchOutlookEventsFromGraph,
  saveOutlookGraphToken,
} from './outlookGraph';
import { applyExternalEventColors, colorForConnection, colorForExternalCalendar, isDefaultLayerCalendar } from './calendarColors';
import {
  CAL_FRESH_MS,
  clearExternalCalendarCache,
  loadExternalCalendarCache,
  padCalendarFetchRange,
  peekExternalCalendarCache,
  putExternalCalendarCache,
  sliceExternalEvents,
} from './externalCalendarCache';
import {
  loadCalendarConnectionsCache,
  peekCalendarConnectionsCache,
  putCalendarConnectionsCache,
} from './calendarConnectionsCache';
import { capturedCalendarOauth } from './calendarOAuthCapture';
import {
  clientEventsFillingGaps,
  combineExternalCalendarErrors,
  mergeExternalEvents,
} from './externalCalendarMerge';
import { assertClientCallableBudget, dedupeInflight } from './costGuards';

const OAUTH_REDIRECT_PATH = 'oauth/calendar';
const OAUTH_STORAGE_KEY = 'weekplan.calendar.oauth';
const OAUTH_STATE_PREFIX = 'wp1.';
const DEFAULT_MS_CLIENT_ID = 'd641e51b-4503-43d8-b2f4-332acb296864';

const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
};

const MICROSOFT_DISCOVERY = {
  authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
};

const MS_SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Calendars.Read', 'Calendars.Read.Shared'];
/** Mail-only incremental consent — calendar scopes stay on the existing connection. */
const MS_MAIL_SCOPES = ['openid', 'offline_access', 'User.Read', 'Mail.Read', 'Mail.ReadWrite', 'Mail.Send'];
/** Firebase account login — keep scopes minimal; reuse /oauth/calendar in Azure. */
const MS_SIGNIN_SCOPES = ['openid', 'profile', 'email', 'offline_access', 'User.Read'];

/** Match functions/msOauth.js — keep copy in sync. */
export const AZURE_WEB_REDIRECT_MESSAGE = [
  'Outlook-redirect i Azure er fortsatt SPA, og da varer innloggingen bare 24 timer.',
  'Flytt https://www.protop.no/oauth/calendar til plattform Web (ikke SPA),',
  'fjern den fra SPA, og trykk «Koble til på nytt».',
].join(' ');

export function friendlyMicrosoftAuthMessage(raw) {
  const s = String(raw || '');
  if (/AADSTS9002327|cross-origin requests|SPA client-type/i.test(s)) {
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

async function call(name, data) {
  const budget = assertClientCallableBudget(name);
  if (!budget.allowed) {
    const err = new Error(budget.reason || 'For mange forespørsler. Prøv igjen senere.');
    err.code = 'resource-exhausted';
    err.retryAfterMs = budget.retryAfterMs;
    throw err;
  }
  const payload = data || {};
  // Dedupe identical in-flight callables (login/home/plan stampede).
  const key = `${name}:${JSON.stringify(payload)}`;
  return dedupeInflight(key, async () => {
    const fn = httpsCallable(functions, name, { timeout: 60000 });
    const res = await fn(payload);
    return res.data;
  });
}

/**
 * Liste kalender-/mail-kontoer. Bruker minne+disk-cache (SWR) så Plan/Mail
 * ikke må vente på callable hver gang man bytter app.
 * @param {{ force?: boolean }} [opts]
 */
export async function listCalendarConnections(opts = {}) {
  const uid = auth.currentUser?.uid || 'anon';
  if (!opts.force) {
    const mem = peekCalendarConnectionsCache(uid);
    if (mem && !mem.stale) return mem.connections || [];
    const disk = await loadCalendarConnectionsCache(uid);
    if (disk?.connections && !disk.stale) {
      // Bakgrunns-refresh uten å blokkere
      call('listCalendarConnections')
        .then((data) => {
          putCalendarConnectionsCache(uid, data?.connections || []);
        })
        .catch(() => {});
      return disk.connections;
    }
    if (disk?.connections?.length) {
      call('listCalendarConnections')
        .then((data) => {
          putCalendarConnectionsCache(uid, data?.connections || []);
        })
        .catch(() => {});
      return disk.connections;
    }
  }
  const data = await call('listCalendarConnections');
  const connections = data?.connections || [];
  putCalendarConnectionsCache(uid, connections);
  return connections;
}

export const OPEN_CALENDAR_SETTINGS_KEY = 'weekplan.openCalendarSettings';
export const OPEN_MAIL_HUB_KEY = 'weekplan.openMailHub';
export const OAUTH_COMPLETE_MESSAGE = 'weekplan-oauth-complete';

function storageSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* ignore */ }
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

function storageRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* ignore */ }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

function storageHas(key) {
  try { if (sessionStorage.getItem(key) === '1') return true; } catch { /* ignore */ }
  try { if (localStorage.getItem(key) === '1') return true; } catch { /* ignore */ }
  return false;
}

export function markOpenMailHub() {
  storageSet(OPEN_MAIL_HUB_KEY, '1');
  storageRemove(OPEN_CALENDAR_SETTINGS_KEY);
}

export function consumeOpenMailHub() {
  const hit = storageHas(OPEN_MAIL_HUB_KEY);
  if (hit) storageRemove(OPEN_MAIL_HUB_KEY);
  return hit;
}

/** True when this /oauth/calendar return is a mail grant, not a calendar connect. */
export function peekOauthRedirectIsMail() {
  if (typeof window === 'undefined') return false;
  try {
    const query = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const state = query.get('state') || hash.get('state');
    const fromState = decodeOauthState(state);
    if (fromState?.mail) return true;
  } catch { /* ignore */ }
  try {
    const stored = readStoredOauth();
    if (stored?.mail) return true;
  } catch { /* ignore */ }
  return storageHas(OPEN_MAIL_HUB_KEY);
}

/** True when /oauth/calendar is finishing Microsoft *account* sign-in (not Outlook). */
export function peekOauthRedirectIsSignIn() {
  if (typeof window === 'undefined') return false;
  try {
    const query = new URLSearchParams(window.location.search || '');
    const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const state = query.get('state') || hash.get('state');
    const fromState = decodeOauthState(state);
    if (fromState?.signIn) return true;
  } catch { /* ignore */ }
  try {
    const stored = readStoredOauth();
    if (stored?.signIn) return true;
  } catch { /* ignore */ }
  return false;
}

export async function addIcsCalendar({ url, label }) {
  return call('addIcsCalendar', { url, label });
}

export async function removeCalendarConnection(id) {
  clearOutlookGraphToken();
  const uid = auth.currentUser?.uid;
  if (uid) clearExternalCalendarCache(uid);
  return call('removeCalendarConnection', { id });
}

function colorizeLayers(layers) {
  return (layers || []).map((pack) => {
    const type = pack.type || 'microsoft';
    const parentColor = colorForConnection(pack.connectionId, type);
    return {
      ...pack,
      color: parentColor,
      calendars: (pack.calendars || []).map((cal) => ({
        ...cal,
        color: isDefaultLayerCalendar(cal)
          ? parentColor
          : colorForExternalCalendar(pack.connectionId, cal.id, type),
      })),
    };
  });
}

function isRateLimitedCalendarError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || err || '');
  return code.includes('resource-exhausted')
    || /for mange kall|for mange forespørsler/i.test(msg);
}

function viewFromCache(cached, startDateKey, endDateKey, extra = {}) {
  if (!cached) return null;
  return {
    events: applyExternalEventColors(
      sliceExternalEvents(cached.events, startDateKey, endDateKey),
      cached.layers,
    ),
    layers: colorizeLayers(cached.layers),
    errors: extra.errors || cached.errors || [],
    ok: extra.ok !== false,
    source: extra.source || cached.source || 'cache',
    fromCache: true,
    stale: extra.stale != null ? extra.stale : !!cached.stale,
    partial: !!cached.partial,
  };
}

async function fetchExternalCalendarEventsNetwork(startDateKey, endDateKey) {
  let data = { events: [], errors: [], ok: true, layers: [] };
  let rateLimited = false;
  try {
    data = await call('fetchExternalCalendarEvents', { startDateKey, endDateKey });
  } catch (e) {
    rateLimited = isRateLimitedCalendarError(e);
    data = {
      events: [],
      errors: rateLimited ? [] : [{ message: e?.message || 'Klarte ikke hente eksterne kalendere' }],
      ok: false,
      layers: [],
      rateLimited,
    };
  }

  const serverEvents = Array.isArray(data?.events) ? data.events : [];
  const serverErrors = Array.isArray(data?.errors) ? data.errors : [];
  const failedConnIds = new Set(serverErrors.map((e) => e.connectionId).filter(Boolean));
  const needsClientFallback = !rateLimited
    && (!serverEvents.length || failedConnIds.size > 0 || data?.ok === false);

  let client = { events: [], errors: [], layers: [], diagnostics: null, usedClient: false };
  if (needsClientFallback) {
    client = await fetchOutlookEventsFromGraph(startDateKey, endDateKey);
  }

  const gapEvents = clientEventsFillingGaps(serverEvents, client.events);
  const errors = combineExternalCalendarErrors(
    serverErrors,
    gapEvents.length ? [] : (client.errors || []),
  );

  const layersById = new Map();
  for (const pack of [...(data?.layers || []), ...(client.layers || [])]) {
    if (!pack?.connectionId) continue;
    const prev = layersById.get(pack.connectionId) || {
      connectionId: pack.connectionId,
      type: pack.type || 'microsoft',
      email: pack.email || null,
      label: pack.label || null,
      calendars: [],
    };
    const seen = new Set((prev.calendars || []).map((c) => c.id));
    for (const cal of pack.calendars || []) {
      if (!cal?.id || seen.has(cal.id)) continue;
      seen.add(cal.id);
      prev.calendars.push(cal);
    }
    if (pack.email) prev.email = pack.email;
    if (pack.label) prev.label = pack.label;
    layersById.set(pack.connectionId, prev);
  }

  const layers = colorizeLayers([...layersById.values()]);
  const events = applyExternalEventColors(mergeExternalEvents(serverEvents, gapEvents), layers);

  return {
    events,
    errors,
    ok: data?.ok !== false,
    layers,
    source: gapEvents.length && !serverEvents.length ? 'graph-client' : 'server',
    diagnostics: client.diagnostics || null,
    fromCache: false,
    rateLimited,
  };
}

/**
 * Hent eksterne kalenderhendelser med stale-while-revalidate-cache.
 * @param {string} startDateKey
 * @param {string} endDateKey
 * @param {{ force?: boolean, uid?: string }} [opts]
 */
export async function fetchExternalCalendarEvents(startDateKey, endDateKey, opts = {}) {
  const uid = opts.uid || auth.currentUser?.uid || 'anon';
  if (!opts.force) {
    const cached = peekExternalCalendarCache(uid, startDateKey, endDateKey, {
      maxAgeMs: CAL_FRESH_MS,
    });
    if (cached && !cached.stale && !cached.partial) {
      return viewFromCache(cached, startDateKey, endDateKey, { stale: false, ok: true });
    }
  }

  const pad = padCalendarFetchRange(startDateKey, endDateKey);
  const result = await fetchExternalCalendarEventsNetwork(pad.start, pad.end);
  if (result.rateLimited || (result.ok === false && !(result.events || []).length)) {
    const cached = await loadExternalCalendarCache(uid, startDateKey, endDateKey);
    if (cached && (cached.events?.length || !cached.partial)) {
      return viewFromCache(cached, startDateKey, endDateKey, {
        stale: true,
        ok: true,
        errors: result.rateLimited ? [] : (result.errors || []),
        source: 'cache',
      });
    }
  }
  if (!result.rateLimited) {
    putExternalCalendarCache(uid, pad.start, pad.end, result);
  }
  return {
    ...result,
    events: sliceExternalEvents(result.events, startDateKey, endDateKey),
    errors: result.rateLimited ? [] : (result.errors || []),
    ok: result.rateLimited ? true : result.ok,
  };
}

/** Les cache synkront/async for umiddelbar UI (kan være stale). */
export async function hydrateExternalCalendarEvents(startDateKey, endDateKey, opts = {}) {
  const uid = opts.uid || auth.currentUser?.uid || 'anon';
  const cached = await loadExternalCalendarCache(uid, startDateKey, endDateKey);
  if (!cached) return null;
  return viewFromCache(cached, startDateKey, endDateKey);
}

export { peekExternalCalendarCache, clearExternalCalendarCache } from './externalCalendarCache';

export async function getCalendarOAuthConfig() {
  return call('getCalendarOAuthConfig');
}

function isWebBrowser() {
  return typeof window !== 'undefined' && typeof window.location?.assign === 'function';
}

/** Stay on the current host. Forcing www while the user is on protop.no drops Firebase auth on iPhone. */
function webAppOrigin() {
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function oauthCookieDomain() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname;
  if (host === 'protop.no' || host === 'www.protop.no' || host.endsWith('.protop.no')) {
    return '.protop.no';
  }
  return null;
}

/** Put PKCE in `state` so iPhone PWA → Safari return still has the verifier. */
function encodeOauthState(payload) {
  const json = JSON.stringify({
    p: payload.provider || 'microsoft',
    v: payload.codeVerifier,
    c: payload.connectionId || null,
    i: payload.clientId || null,
    r: payload.redirectUri || null,
    m: payload.mail ? 1 : 0,
    s: payload.signIn ? 1 : 0,
  });
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return `${OAUTH_STATE_PREFIX}${btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function decodeOauthState(state) {
  const raw = String(state || '');
  if (!raw.startsWith(OAUTH_STATE_PREFIX)) return null;
  try {
    let b64 = raw.slice(OAUTH_STATE_PREFIX.length).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data?.v) return null;
    return {
      provider: data.p || 'microsoft',
      codeVerifier: data.v,
      connectionId: data.c || null,
      clientId: data.i || null,
      redirectUri: data.r || null,
      mail: data.m === 1,
      signIn: data.s === 1,
    };
  } catch {
    return null;
  }
}

async function makeRedirectUri() {
  const AuthSession = await import('expo-auth-session');
  if (isWebBrowser()) {
    return `${webAppOrigin()}/${OAUTH_REDIRECT_PATH}`;
  }
  return AuthSession.makeRedirectUri({ scheme: 'weekplan', path: OAUTH_REDIRECT_PATH });
}

function parseOauthPayload(raw) {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function readOauthCookie() {
  if (typeof document === 'undefined') return null;
  try {
    const parts = String(document.cookie || '').split(';');
    for (const part of parts) {
      const idx = part.indexOf('=');
      if (idx < 1) continue;
      const key = part.slice(0, idx).trim();
      if (key !== OAUTH_STORAGE_KEY) continue;
      return parseOauthPayload(decodeURIComponent(part.slice(idx + 1).trim()));
    }
  } catch {}
  return null;
}

function readStoredOauth() {
  if (typeof window === 'undefined') return null;
  try {
    const session = parseOauthPayload(sessionStorage.getItem(OAUTH_STORAGE_KEY));
    if (session) return session;
  } catch {}
  try {
    const local = parseOauthPayload(localStorage.getItem(OAUTH_STORAGE_KEY));
    if (local) return local;
  } catch {}
  return readOauthCookie();
}

function writeStoredOauth(data) {
  const raw = JSON.stringify(data);
  try { sessionStorage.setItem(OAUTH_STORAGE_KEY, raw); } catch {}
  try { localStorage.setItem(OAUTH_STORAGE_KEY, raw); } catch {}
  try {
    const domain = oauthCookieDomain();
    const domainPart = domain ? `; Domain=${domain}` : '';
    document.cookie = `${OAUTH_STORAGE_KEY}=${encodeURIComponent(raw)}; Max-Age=${15 * 60}; Path=/${domainPart}; SameSite=Lax; Secure`;
  } catch {}
}

function clearStoredOauth() {
  try { sessionStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}
  try { localStorage.removeItem(OAUTH_STORAGE_KEY); } catch {}
  try {
    const domain = oauthCookieDomain();
    const domainPart = domain ? `; Domain=${domain}` : '';
    document.cookie = `${OAUTH_STORAGE_KEY}=; Max-Age=0; Path=/${domainPart}; SameSite=Lax; Secure`;
  } catch {}
}

function waitForSignedInUser(timeoutMs = 20000) {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('Du må være innlogget for å koble til Outlook.'));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) return;
      clearTimeout(timer);
      unsub();
      resolve(user);
    });
  });
}

function readOauthReturnParams() {
  const captured = capturedCalendarOauth || {};
  if (typeof window === 'undefined') {
    return {
      code: captured.code || null,
      state: captured.state || null,
      error: captured.error || null,
      errorDescription: captured.errorDescription || null,
    };
  }
  const query = new URLSearchParams(window.location.search || '');
  const hash = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
  const pick = (key) => query.get(key) || hash.get(key) || captured[key] || null;
  return {
    code: pick('code') || captured.code || null,
    state: pick('state') || captured.state || null,
    error: pick('error') || captured.error || null,
    errorDescription: pick('error_description') || captured.errorDescription || null,
  };
}

async function persistMicrosoftTokens({
  clientId, connectionId, browserToken, exchange,
}) {
  const connectionEmail = exchange?.connection?.email
    || String(exchange?.connection?.label || '').replace(/^Outlook\s*[·•\-–]\s*/i, '').trim()
    || '';
  const accessToken = exchange?.accessToken || browserToken?.accessToken;
  const tokenKind = exchange?.tokenKind || 'spa';
  const refreshToken = tokenKind === 'web'
    ? undefined
    : (exchange?.refreshToken || browserToken?.refreshToken);
  const expiresIn = exchange?.expiresIn || browserToken?.expiresIn;
  if (!accessToken) return;
  saveOutlookGraphToken({
    accessToken,
    refreshToken,
    expiresIn,
    connectionId: exchange?.id || connectionId,
    clientId,
    scope: exchange?.scope || browserToken?.scope,
    email: connectionEmail,
  });
}

async function exchangeMicrosoftServerCode({ clientId, code, redirectUri, codeVerifier, connectionId, mail = false }) {
  await waitForSignedInUser();
  const exchange = await call('exchangeCalendarOAuth', {
    provider: 'microsoft',
    code,
    redirectUri,
    codeVerifier,
    connectionId: connectionId || undefined,
    scope: (mail ? MS_MAIL_SCOPES : MS_SCOPES).join(' '),
    mail: !!mail,
  });
  if (!exchange?.ok) {
    throw new Error(friendlyMicrosoftAuthMessage(exchange?.error || 'Innlogging feilet'));
  }
  await persistMicrosoftTokens({ clientId, connectionId, exchange });
  return exchange;
}

async function exchangeMicrosoftBrowserToken({ clientId, code, redirectUri, codeVerifier, connectionId, mail = false }) {
  const AuthSession = await import('expo-auth-session');
  const scopes = mail ? MS_MAIL_SCOPES : MS_SCOPES;
  let browserToken = null;
  try {
    browserToken = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code,
        redirectUri,
        extraParams: {
          code_verifier: codeVerifier || '',
          scope: scopes.join(' '),
        },
      },
      MICROSOFT_DISCOVERY,
    );
  } catch (e) {
    console.warn('[outlook] browser token exchange failed', e?.message || e);
    throw new Error(friendlyMicrosoftAuthMessage(e?.message || 'Microsoft-innlogging feilet'));
  }
  if (!browserToken?.accessToken) {
    throw new Error('Microsoft sendte ikke tilgangstoken.');
  }

  await waitForSignedInUser();
  saveOutlookGraphToken({
    accessToken: browserToken.accessToken,
    refreshToken: browserToken.refreshToken,
    expiresIn: browserToken.expiresIn,
    clientId,
    scope: browserToken.scope,
  });
  const exchange = await call('exchangeCalendarOAuth', {
    provider: 'microsoft',
    accessToken: browserToken.accessToken,
    refreshToken: browserToken.refreshToken,
    expiresIn: browserToken.expiresIn,
    scope: browserToken.scope || scopes.join(' '),
    redirectUri,
    connectionId: connectionId || undefined,
    mail: !!mail,
  });
  if (!exchange?.ok) throw new Error(friendlyMicrosoftAuthMessage(exchange?.error || 'Innlogging feilet'));
  await persistMicrosoftTokens({ clientId, connectionId, browserToken, exchange });
  return exchange;
}

async function runGoogleOAuth(clientId) {
  const AuthSession = await import('expo-auth-session');
  const redirectUri = await makeRedirectUri();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['https://www.googleapis.com/auth/calendar.readonly', 'email', 'profile'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: false,
    extraParams: { access_type: 'offline', prompt: 'select_account' },
  });

  if (isWebBrowser()) {
    const authUrl = await request.makeAuthUrlAsync(GOOGLE_DISCOVERY);
    writeStoredOauth({
      provider: 'google',
      clientId,
      redirectUri,
      state: request.state || null,
    });
    window.location.assign(authUrl);
    return new Promise(() => {});
  }

  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const result = await request.promptAsync(GOOGLE_DISCOVERY);
  if (result.type !== 'success' || !result.params?.code) {
    throw new Error('cancelled');
  }

  const exchange = await call('exchangeCalendarOAuth', {
    provider: 'google',
    code: result.params.code,
    redirectUri,
  });
  if (!exchange?.ok) throw new Error(exchange?.error || 'Innlogging feilet');
  return exchange;
}

async function runMicrosoftOAuth(clientId, { connectionId, mail = false, loginHint, signIn = false } = {}) {
  const AuthSession = await import('expo-auth-session');
  const redirectUri = await makeRedirectUri();
  const scopes = signIn ? MS_SIGNIN_SCOPES : (mail ? MS_MAIL_SCOPES : MS_SCOPES);
  const extraParams = { prompt: 'select_account' };
  if (loginHint) extraParams.login_hint = String(loginHint);
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    extraParams,
  });

  // Same-window on web. Mobile Safari blocks window.open() after any await.
  // PKCE also goes in `state` because iOS standalone PWA storage is not shared with Safari.
  if (isWebBrowser()) {
    await request.getAuthRequestConfigAsync();
    if (request.codeVerifier) {
      request.state = encodeOauthState({
        provider: 'microsoft',
        codeVerifier: request.codeVerifier,
        connectionId,
        clientId,
        redirectUri,
        mail,
        signIn,
      });
    }
    const authUrl = await request.makeAuthUrlAsync(MICROSOFT_DISCOVERY);
    writeStoredOauth({
      provider: 'microsoft',
      clientId,
      redirectUri,
      codeVerifier: request.codeVerifier || null,
      state: request.state || null,
      connectionId: connectionId || null,
      mail: !!mail,
      signIn: !!signIn,
    });
    if (mail) markOpenMailHub();
    window.location.assign(authUrl);
    return new Promise(() => {});
  }

  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();
  const result = await request.promptAsync(MICROSOFT_DISCOVERY);
  if (result.type !== 'success' || !result.params?.code) {
    throw new Error('cancelled');
  }
  if (signIn) {
    return completeMicrosoftAccountSignIn({
      clientId,
      code: result.params.code,
      redirectUri,
      codeVerifier: request.codeVerifier,
    });
  }
  return exchangeMicrosoftBrowserToken({
    clientId,
    code: result.params.code,
    redirectUri,
    codeVerifier: request.codeVerifier,
    connectionId,
    mail,
  });
}

/**
 * Start Microsoft account sign-in using the Azure-registered /oauth/calendar URI.
 * Avoids Firebase's /__/auth/handler which often triggers AADSTS50011.
 */
export async function beginMicrosoftAccountSignIn() {
  if (!isWebBrowser()) {
    throw new Error('microsoft-web-only');
  }
  // Prefer www so redirect URI matches the Azure Web registration used by Outlook.
  try {
    if (typeof window !== 'undefined' && window.location.hostname === 'protop.no') {
      const url = new URL(window.location.href);
      url.hostname = 'www.protop.no';
      window.location.replace(url.toString());
      return null;
    }
  } catch { /* ignore */ }
  return runMicrosoftOAuth(DEFAULT_MS_CLIENT_ID, { signIn: true });
}

async function exchangeMicrosoftSignInTokens({ clientId, code, redirectUri, codeVerifier }) {
  // Prefer server exchange (Web + client secret) — does not require Firebase auth.
  try {
    const exchange = await call('exchangeMicrosoftSignIn', {
      code,
      redirectUri,
      codeVerifier,
      scope: MS_SIGNIN_SCOPES.join(' '),
    });
    if (exchange?.ok && (exchange.idToken || exchange.accessToken)) {
      return exchange;
    }
    if (exchange && exchange.ok === false && exchange.error) {
      throw new Error(friendlyMicrosoftAuthMessage(exchange.error));
    }
  } catch (e) {
    const msg = String(e?.message || e || '');
    // If the callable is not deployed yet, fall through to browser PKCE.
    if (!/not-found|NOT_FOUND|ikke funnet|failed-precondition/i.test(msg)
      && /Microsoft|Outlook|AADSTS|innlogging|OAuth|PKCE|secret|konfigurert/i.test(msg)) {
      throw new Error(friendlyMicrosoftAuthMessage(msg));
    }
    console.warn('[ms-signin] server exchange failed, trying browser', msg);
  }

  const AuthSession = await import('expo-auth-session');
  let browserToken = null;
  try {
    browserToken = await AuthSession.exchangeCodeAsync(
      {
        clientId: clientId || DEFAULT_MS_CLIENT_ID,
        code,
        redirectUri,
        extraParams: {
          code_verifier: codeVerifier || '',
          scope: MS_SIGNIN_SCOPES.join(' '),
        },
      },
      MICROSOFT_DISCOVERY,
    );
  } catch (e) {
    throw new Error(friendlyMicrosoftAuthMessage(e?.message || 'Microsoft-innlogging feilet'));
  }
  if (!browserToken?.idToken && !browserToken?.accessToken) {
    throw new Error('Microsoft sendte ikke innloggingstoken.');
  }
  return {
    ok: true,
    idToken: browserToken.idToken || null,
    accessToken: browserToken.accessToken || null,
  };
}

async function completeMicrosoftAccountSignIn({ clientId, code, redirectUri, codeVerifier }) {
  const tokens = await exchangeMicrosoftSignInTokens({
    clientId,
    code,
    redirectUri,
    codeVerifier,
  });
  const provider = new OAuthProvider('microsoft.com');
  const credential = provider.credential({
    idToken: tokens.idToken || undefined,
    accessToken: tokens.accessToken || undefined,
  });
  const cred = await signInWithCredential(auth, credential);
  return { ok: true, signIn: true, user: cred.user };
}

let completionPromise = null;

/**
 * Called on /oauth/calendar after Microsoft/Google redirects back (same window).
 */
export function completeCalendarOAuthRedirect() {
  if (!completionPromise) completionPromise = runCalendarOAuthCompletion();
  return completionPromise;
}

async function runCalendarOAuthCompletion() {
  if (!isWebBrowser()) {
    return { ok: false, error: 'Outlook-innlogging må fullføres i nettleseren.', mail: false };
  }

  const params = readOauthReturnParams();
  const fromState = decodeOauthState(params.state);
  const stored = readStoredOauth();
  const saved = {
    provider: stored?.provider || fromState?.provider || null,
    clientId: stored?.clientId || fromState?.clientId || DEFAULT_MS_CLIENT_ID,
    redirectUri: stored?.redirectUri || fromState?.redirectUri || `${webAppOrigin()}/${OAUTH_REDIRECT_PATH}`,
    codeVerifier: stored?.codeVerifier || fromState?.codeVerifier || null,
    connectionId: stored?.connectionId || fromState?.connectionId || null,
    mail: !!(stored?.mail || fromState?.mail),
    signIn: !!(stored?.signIn || fromState?.signIn),
    state: stored?.state || params.state || null,
  };
  const mail = !!saved.mail;
  const signIn = !!saved.signIn;

  if (window.opener && !window.opener.closed && !stored && !fromState) {
    try {
      const WebBrowser = await import('expo-web-browser');
      const popup = WebBrowser.maybeCompleteAuthSession();
      if (popup?.type === 'success') return { ok: true, popup: true, mail, signIn };
    } catch {}
  }

  if (!params.code && !params.error && !stored && !fromState) {
    return {
      ok: false,
      mail,
      signIn,
      error: signIn
        ? 'Fant ingen innloggingskode. Gå tilbake og prøv Microsoft-innlogging på nytt.'
        : 'Fant ingen innloggingskode. Gå tilbake og koble til Outlook på nytt.',
    };
  }
  if (params.error) {
    clearStoredOauth();
    const desc = String(params.errorDescription || params.error || '').replace(/\+/g, ' ');
    return { ok: false, mail, signIn, error: friendlyMicrosoftAuthMessage(desc) };
  }
  if (!params.code) {
    clearStoredOauth();
    return {
      ok: false,
      mail,
      signIn,
      error: signIn
        ? 'Mangler innloggingskode. Prøv Microsoft-innlogging på nytt.'
        : 'Mangler innloggingskode. Prøv å koble til på nytt.',
    };
  }
  if (!saved.provider || !saved.redirectUri || (saved.provider === 'microsoft' && !saved.codeVerifier)) {
    return {
      ok: false,
      mail,
      signIn,
      error: signIn
        ? 'Økten utløp. Gå tilbake og logg inn med Microsoft på nytt.'
        : 'Økten utløp. Gå tilbake og koble til Outlook på nytt.',
    };
  }
  if (stored?.state && params.state && stored.state !== params.state && !fromState) {
    clearStoredOauth();
    return { ok: false, mail, signIn, error: 'Innloggingen kunne ikke bekreftes. Prøv igjen.' };
  }

  try {
    if (saved.provider === 'microsoft' && signIn) {
      const result = await completeMicrosoftAccountSignIn({
        clientId: saved.clientId || DEFAULT_MS_CLIENT_ID,
        code: params.code,
        redirectUri: saved.redirectUri,
        codeVerifier: saved.codeVerifier,
      });
      clearStoredOauth();
      return result;
    }

    if (saved.provider === 'microsoft') {
      await waitForSignedInUser();
      const cfg = await getCalendarOAuthConfig().catch(() => null);
      const args = {
        clientId: saved.clientId || DEFAULT_MS_CLIENT_ID,
        code: params.code,
        redirectUri: saved.redirectUri,
        codeVerifier: saved.codeVerifier,
        connectionId: saved.connectionId,
        mail,
      };
      const exchange = cfg?.microsoft?.hasClientSecret
        ? await exchangeMicrosoftServerCode(args)
        : await exchangeMicrosoftBrowserToken(args);
      clearStoredOauth();
      if (mail) markOpenMailHub();
      return { ok: true, connection: exchange.connection, mail };
    }

    await waitForSignedInUser();
    const exchange = await call('exchangeCalendarOAuth', {
      provider: saved.provider,
      code: params.code,
      redirectUri: saved.redirectUri,
    });
    if (!exchange?.ok) throw new Error(exchange?.error || 'Innlogging feilet');
    clearStoredOauth();
    return { ok: true, connection: exchange.connection, mail: false };
  } catch (e) {
    clearStoredOauth();
    return {
      ok: false,
      mail,
      signIn,
      error: friendlyMicrosoftAuthMessage(e?.message || 'Innlogging feilet'),
    };
  }
}

export async function connectGoogleCalendar() {
  const cfg = await getCalendarOAuthConfig();
  if (!cfg?.google?.configured || !cfg.google.clientId) {
    throw new Error('Google Kalender er ikke satt opp ennå. Kontakt support.');
  }
  return runGoogleOAuth(cfg.google.clientId);
}

export async function connectMicrosoftCalendar({ clientId, connectionId } = {}) {
  const id = String(clientId || '').trim() || DEFAULT_MS_CLIENT_ID;
  if (!id) {
    throw new Error('Outlook er ikke satt opp ennå. Kontakt support.');
  }
  return runMicrosoftOAuth(id, { connectionId });
}

/** Re-run Outlook OAuth and refresh tokens on an existing connection. */
export async function reconnectMicrosoftCalendar(connectionId, { clientId } = {}) {
  if (!connectionId) throw new Error('Mangler tilkoblings-id');
  const id = String(clientId || '').trim() || DEFAULT_MS_CLIENT_ID;
  return runMicrosoftOAuth(id, { connectionId });
}

/** Incremental consent: keep the mailbox, add Mail.Read / Mail.Send. */
export async function connectMicrosoftMail({ clientId, connectionId, loginHint } = {}) {
  const id = String(clientId || '').trim() || DEFAULT_MS_CLIENT_ID;
  if (!id) {
    throw new Error('Outlook er ikke satt opp ennå. Kontakt support.');
  }
  return runMicrosoftOAuth(id, { connectionId, mail: true, loginHint });
}

export const CALENDAR_SOURCE_META = {
  ics: { label: 'ICS', color: '#64748b', icon: 'link' },
  google: { label: 'Google', color: '#4285f4', icon: 'logo-google' },
  microsoft: { label: 'Outlook', color: '#0078d4', icon: 'mail' },
};
