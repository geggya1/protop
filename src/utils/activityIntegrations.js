/**
 * Fitness-koblinger — OAuth-first (Strava Sign in).
 *
 * Realitet 2026:
 * - Strava: eneste praktiske web Sign-in/API for turer (Garmin/Apple synker hit).
 * - Garmin Connect: ingen personlig OAuth; program er bedrift + ofte pauset.
 * - Apple Health: kun HealthKit på iOS — ingen web-API / OAuth.
 * - GPX: nødløsning, ikke hovedflyt.
 */

import { Platform } from 'react-native';
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';

const STRAVA_OAUTH_PATH = 'oauth/strava';

/** Hovedkoblinger som skal vise Sign in / OAuth. */
export const OAUTH_PROVIDERS = [
  {
    id: 'strava',
    label: 'Strava',
    icon: 'logo-ionic',
    iconIon: 'bicycle-outline',
    color: '#fc4c02',
    signInLabel: 'Logg inn med Strava',
    blurb: 'Automatisk henting av turer, distanse, kalorier og puls.',
    detail: 'Etter innlogging synker ProTop aktivitetene dine. Koble Garmin eller Apple Watch til Strava først for å få med dem.',
  },
  {
    id: 'garmin',
    label: 'Garmin',
    iconIon: 'watch-outline',
    color: '#007cc3',
    signInLabel: 'Logg inn via Strava',
    blurb: 'Garmin har ikke åpen Sign-in for vanlige apper.',
    detail: 'Én gang: Garmin Connect → Connected Apps → Strava. Deretter «Logg inn med Strava» her — turene kommer automatisk.',
    bridge: 'strava',
  },
  {
    id: 'apple_health',
    label: 'Apple Watch / Helse',
    iconIon: 'logo-apple',
    color: '#111827',
    signInLabel: Platform.OS === 'ios' ? 'Koble HealthKit' : 'Logg inn via Strava',
    blurb: Platform.OS === 'ios'
      ? 'HealthKit på enheten.'
      : 'Apple har ingen web Sign-in for Helse.',
    detail: Platform.OS === 'ios'
      ? 'Kobles via HealthKit på iPhone.'
      : 'Synk Apple Watch → Strava (eller RunGap), deretter «Logg inn med Strava» i ProTop.',
    bridge: 'strava',
  },
];

export const FITNESS_PROVIDERS = [
  ...OAUTH_PROVIDERS.map((p) => ({
    ...p,
    icon: p.iconIon,
    free: p.id === 'strava' ? 'limited' : true,
    status: p.id === 'strava' ? 'oauth' : (p.id === 'apple_health' && Platform.OS !== 'ios' ? 'unavailable_web' : 'export'),
    action: p.id === 'strava' ? 'oauth' : 'bridge',
  })),
  {
    id: 'osm',
    label: 'OpenStreetMap',
    icon: 'map-outline',
    color: '#65a30d',
    free: true,
    status: 'ready',
    action: 'enable',
    blurb: 'Kartlag for turer uten betalt kart-API.',
    detail: 'Vises automatisk på importerte Strava/GPX-turer.',
  },
  {
    id: 'open_meteo',
    label: 'Vær (Open-Meteo)',
    icon: 'partly-sunny-outline',
    color: '#0284c7',
    free: true,
    status: 'ready',
    action: 'enable',
    blurb: 'Værvarsel til turplanlegging — gratis API.',
    detail: 'open-meteo.com.',
  },
  {
    id: 'gpx',
    label: 'Manuell GPX (reserve)',
    icon: 'document-outline',
    color: '#64748b',
    free: true,
    status: 'import',
    action: 'import',
    blurb: 'Kun hvis du ikke kan bruke Strava.',
    detail: 'Eksporter GPX/TCX fra Garmin/Apple og last opp. Anbefalt: Sign in med Strava i stedet.',
  },
];

export function getStravaRedirectUri() {
  const fromEnv = String(process.env.EXPO_PUBLIC_STRAVA_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/${STRAVA_OAUTH_PATH}`;
  }
  return '';
}

/** @deprecated — bruk fetchStravaAppStatus */
export function getStravaClientId() {
  return String(process.env.EXPO_PUBLIC_STRAVA_CLIENT_ID || '').trim();
}

/** @deprecated — bruk fetchStravaAppStatus().configured */
export function isStravaConfigured() {
  return !!getStravaClientId();
}

export async function fetchStravaAppStatus(familyId) {
  const fn = httpsCallable(functions, 'getStravaAppStatus', { timeout: 15000 });
  const res = await fn({ familyId: familyId || null });
  return res.data || { configured: false };
}

export async function saveStravaAppConfig({ clientId, clientSecret, familyId, scope = 'user' }) {
  const fn = httpsCallable(functions, 'saveStravaAppConfig', { timeout: 20000 });
  const res = await fn({
    clientId: String(clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim(),
    familyId: familyId || null,
    scope,
  });
  return res.data;
}

const STRAVA_DISCOVERY = {
  authorizationEndpoint: 'https://www.strava.com/oauth/authorize',
  tokenEndpoint: 'https://www.strava.com/oauth/token',
};

/**
 * Strava OAuth Sign in (AuthSession) + server token exchange.
 * @param {{ clientId?: string, familyId?: string }} opts
 */
export async function connectStravaOAuth(opts = {}) {
  let clientId = String(opts.clientId || '').trim() || getStravaClientId();
  if (!clientId) {
    const status = await fetchStravaAppStatus(opts.familyId);
    clientId = status?.clientId || '';
  }
  if (!clientId) {
    const err = new Error('Strava-app er ikke satt opp ennå.');
    err.code = 'not_configured';
    throw err;
  }

  const AuthSession = await import('expo-auth-session');
  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();

  let redirectUri = getStravaRedirectUri();
  if (!redirectUri) {
    redirectUri = AuthSession.makeRedirectUri({ scheme: 'weekplan', path: STRAVA_OAUTH_PATH });
  }

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: ['read', 'activity:read_all', 'profile:read_all'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: false,
    extraParams: { approval_prompt: 'auto' },
  });

  const result = await request.promptAsync(STRAVA_DISCOVERY);
  if (result.type === 'dismiss' || result.type === 'cancel') {
    const err = new Error('cancelled');
    err.code = 'cancelled';
    throw err;
  }
  if (result.type !== 'success' || !result.params?.code) {
    throw new Error('Strava-innlogging feilet.');
  }

  const fn = httpsCallable(functions, 'stravaExchangeToken', { timeout: 30000 });
  const res = await fn({
    code: result.params.code,
    redirectUri,
    familyId: opts.familyId || null,
  });
  return res.data;
}

export async function syncStravaActivities(opts = {}) {
  const fn = httpsCallable(functions, 'stravaSyncActivities', { timeout: 90000 });
  const res = await fn(opts);
  return res.data;
}

export async function disconnectStrava() {
  const fn = httpsCallable(functions, 'stravaDisconnect', { timeout: 15000 });
  const res = await fn({});
  return res.data;
}

export async function enableStravaRealtime(callbackUrl) {
  const fn = httpsCallable(functions, 'registerStravaWebhook', { timeout: 30000 });
  const res = await fn({ callbackUrl: callbackUrl || null });
  return res.data;
}

export function fitnessConnectionDoc(uid) {
  return doc(db, 'users', uid, 'settings', 'fitnessConnections');
}

export function listenFitnessConnections(uid, cb) {
  if (!uid) {
    cb({});
    return () => {};
  }
  return onSnapshot(
    fitnessConnectionDoc(uid),
    (snap) => cb(snap.exists() ? (snap.data() || {}) : {}),
    () => cb({}),
  );
}

export async function setFitnessConnection(uid, providerId, patch) {
  if (!uid || !providerId) return;
  const ref = fitnessConnectionDoc(uid);
  const prev = (await getDoc(ref)).data() || {};
  await setDoc(ref, {
    ...prev,
    [providerId]: {
      ...(prev[providerId] || {}),
      ...patch,
      updatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function setHealthProfile(uid, patch) {
  if (!uid) return;
  const ref = fitnessConnectionDoc(uid);
  const prev = (await getDoc(ref)).data() || {};
  await setDoc(ref, {
    healthProfile: {
      ...(prev.healthProfile || {}),
      ...patch,
      updatedAt: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  }, { merge: true });
}

export function providerConnectionLabel(provider, connection, stravaStatus) {
  if (provider.id === 'strava') {
    if (connection?.connected) return 'Innlogget';
    if (stravaStatus?.configured) return 'Logg inn';
    return 'Sett opp';
  }
  if (provider.bridge === 'strava') {
    if (connection?.connected || connection?.source === 'strava_bridge') return 'Via Strava';
    return 'Via Strava';
  }
  if (connection?.connected) return 'Tilkoblet';
  if (provider.status === 'import') return 'Reserve';
  if (provider.status === 'ready') return 'Klar';
  return 'Åpne';
}

export const STRAVA_SETUP_STEPS = [
  '1. Gå til strava.com/settings/api (krever Strava-abonnement for API).',
  '2. Opprett en app. Authorization Callback Domain: protop.no (eller ditt domene).',
  '3. Kopier Client ID og Client Secret hit.',
  '4. Redirect URI i appen: https://www.protop.no/oauth/strava',
  '5. Trykk «Logg inn med Strava» — Garmin/Apple Watch synker via Strava.',
].join('\n');

export const GARMIN_STRAVA_BRIDGE = [
  'Garmin tilbyr ikke Sign-in for vanlige apper (kun bedrift, og programmet er ofte stengt).',
  '',
  'Slik får du automatisk import likevel:',
  '1. Garmin Connect → Connected Apps → autoriser Strava.',
  '2. Nye turer synker til Strava automatisk.',
  '3. Trykk «Logg inn med Strava» i ProTop.',
].join('\n');

export const APPLE_STRAVA_BRIDGE = [
  'Apple Helse har ingen web-API eller Sign-in i nettleseren (kun HealthKit på iPhone).',
  '',
  'Automatisk vei:',
  '1. Synk Apple Watch-turer til Strava (Strava-appen eller RunGap).',
  '2. Trykk «Logg inn med Strava» i ProTop.',
].join('\n');

/** @deprecated */
export const GARMIN_EXPORT_HELP = GARMIN_STRAVA_BRIDGE;
/** @deprecated */
export const APPLE_EXPORT_HELP = APPLE_STRAVA_BRIDGE;

export function buildStravaAuthorizeUrl({ state, clientId: cid } = {}) {
  const clientId = cid || getStravaClientId();
  if (!clientId) return null;
  const redirect = getStravaRedirectUri();
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirect,
    approval_prompt: 'auto',
    scope: 'read,activity:read_all,profile:read_all',
    state: state || `wp_${Date.now()}`,
  });
  return `https://www.strava.com/oauth/authorize?${params.toString()}`;
}
