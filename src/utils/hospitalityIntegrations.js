/**
 * Utleie-kanaler — OAuth / Sign-in + smart iCal for Airbnb og Booking.com.
 */

import { Platform, Linking } from 'react-native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

import { AIRBNB_OAUTH_SCOPES } from './hospitalityMessaging.js';

const AIRBNB_OAUTH_PATH = 'oauth/airbnb';
const AIRBNB_PENDING_KEY = 'weekplan.hosp.airbnb.oauth';

export const HOSP_OAUTH_PROVIDERS = [
  {
    id: 'airbnb',
    label: 'Airbnb',
    iconIon: 'home-outline',
    color: '#ff385c',
    signInLabel: 'Logg inn med Airbnb',
    blurb: 'Påkrevd for automeldinger til Airbnb-innboks',
    extranetUrl: null,
  },
  {
    id: 'booking',
    label: 'Booking.com',
    iconIon: 'bed-outline',
    color: '#003580',
    signInLabel: 'Logg inn med Booking.com',
    blurb: 'Påkrevd for automeldinger til Booking-innboks',
    extranetUrl: 'https://admin.booking.com/hotel/hoteladmin/extranet_ng/manage/channel-manager/index.html',
  },
];

function isWebBrowser() {
  return typeof window !== 'undefined' && typeof window.location?.assign === 'function';
}

function webAppOrigin() {
  if (typeof window === 'undefined') return '';
  const host = window.location.hostname;
  if (host === 'protop.no' || host === 'www.protop.no') return 'https://www.protop.no';
  return window.location.origin;
}

export function getAirbnbRedirectUri() {
  const fromEnv = String(process.env.EXPO_PUBLIC_AIRBNB_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  if (isWebBrowser()) {
    return `${webAppOrigin()}/${AIRBNB_OAUTH_PATH}`;
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/${AIRBNB_OAUTH_PATH}`;
  }
  return '';
}

function writeAirbnbPending(payload) {
  try {
    sessionStorage.setItem(AIRBNB_PENDING_KEY, JSON.stringify({
      ...payload,
      savedAt: Date.now(),
    }));
  } catch {
    // ignore
  }
}

function readAirbnbPending() {
  try {
    const raw = sessionStorage.getItem(AIRBNB_PENDING_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function clearAirbnbPending() {
  try {
    sessionStorage.removeItem(AIRBNB_PENDING_KEY);
  } catch {
    // ignore
  }
}

/** @deprecated — bruk getHospitalityLoginChecklist som returnerer channels */
export async function fetchHospitalityChannelStatus(familyId) {
  const fn = httpsCallable(functions, 'hospGetChannelStatus', { timeout: 15000 });
  const res = await fn({ familyId: familyId || null });
  return res.data || { airbnb: {}, booking: {} };
}

async function resolveAirbnbClientId(opts = {}) {
  let clientId = String(opts.clientId || '').trim();
  if (!clientId && opts.setup?.channels?.airbnb?.clientId) {
    clientId = String(opts.setup.channels.airbnb.clientId).trim();
  }
  if (!clientId) {
    clientId = String(process.env.EXPO_PUBLIC_AIRBNB_CLIENT_ID || '').trim();
  }
  if (!clientId) {
    try {
      const status = await fetchHospitalityChannelStatus(opts.familyId);
      clientId = String(status?.airbnb?.clientId || '').trim();
    } catch (err) {
      const msg = err?.message || String(err);
      const wrapped = new Error(
        /INTERNAL|500/i.test(msg)
          ? 'Kanalstatus feilet på server. Prøv igjen om litt, eller sett EXPO_PUBLIC_AIRBNB_CLIENT_ID.'
          : (msg || 'Kunne ikke hente Airbnb-oppsett.'),
      );
      wrapped.code = err?.code || 'status_failed';
      throw wrapped;
    }
  }
  if (!clientId) {
    const err = new Error('not_configured');
    err.code = 'not_configured';
    throw err;
  }
  return clientId;
}

export async function connectAirbnbOAuth(opts = {}) {
  const clientId = await resolveAirbnbClientId(opts);
  const AuthSession = await import('expo-auth-session');

  let redirectUri = getAirbnbRedirectUri();
  if (!redirectUri) {
    redirectUri = AuthSession.makeRedirectUri({ scheme: 'weekplan', path: AIRBNB_OAUTH_PATH });
  }

  const discovery = {
    authorizationEndpoint: 'https://www.airbnb.com/oauth2/auth',
    tokenEndpoint: 'https://api.airbnb.com/v2/oauth2/authorizations',
  };

  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri,
    scopes: AIRBNB_OAUTH_SCOPES,
    responseType: AuthSession.ResponseType.Code,
    usePKCE: false,
  });

  // Same-window on web (popup/AuthSession often blocked or silent).
  if (isWebBrowser()) {
    const authUrl = await request.makeAuthUrlAsync(discovery);
    writeAirbnbPending({
      familyId: opts.familyId || null,
      propertyId: opts.propertyId || null,
      clientId,
      redirectUri,
      returnTo: typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search || ''}`
        : '/utleie',
    });
    window.location.assign(authUrl);
    return new Promise(() => {});
  }

  const WebBrowser = await import('expo-web-browser');
  WebBrowser.maybeCompleteAuthSession();

  const result = await request.promptAsync(discovery);

  if (result.type === 'dismiss' || result.type === 'cancel') {
    const err = new Error('cancelled');
    err.code = 'cancelled';
    throw err;
  }
  if (result.type !== 'success' || !result.params?.code) {
    throw new Error('Airbnb-innlogging feilet.');
  }

  return exchangeAirbnbAuthCode({
    code: result.params.code,
    redirectUri,
    familyId: opts.familyId || null,
    propertyId: opts.propertyId || null,
  });
}

export async function exchangeAirbnbAuthCode({
  code, redirectUri, familyId, propertyId,
} = {}) {
  const fn = httpsCallable(functions, 'hospAirbnbExchangeToken', { timeout: 30000 });
  const res = await fn({
    code: String(code || '').trim(),
    redirectUri: String(redirectUri || '').trim(),
    familyId: familyId || null,
    propertyId: propertyId || null,
  });
  return res.data;
}

/**
 * Finish Airbnb OAuth after redirect to /oauth/airbnb (web same-window).
 * Returns { ok, cancelled, error?, data? }.
 */
export async function completeAirbnbOAuthFromRedirect() {
  if (!isWebBrowser()) return { ok: false, cancelled: true };

  const params = new URLSearchParams(window.location.search || '');
  const code = String(params.get('code') || '').trim();
  const errParam = String(params.get('error') || '').trim();
  const pending = readAirbnbPending() || {};

  if (errParam) {
    clearAirbnbPending();
    return { ok: false, cancelled: false, error: errParam };
  }
  if (!code) {
    return { ok: false, cancelled: true };
  }

  try {
    const data = await exchangeAirbnbAuthCode({
      code,
      redirectUri: pending.redirectUri || getAirbnbRedirectUri(),
      familyId: pending.familyId || null,
      propertyId: pending.propertyId || null,
    });
    clearAirbnbPending();
    return { ok: true, cancelled: false, data, returnTo: pending.returnTo || '/utleie' };
  } catch (e) {
    clearAirbnbPending();
    return { ok: false, cancelled: false, error: e?.message || 'Airbnb-innlogging feilet.' };
  }
}

export async function connectBookingProperty(familyId, { propertyId } = {}) {
  const id = String(propertyId || '').trim();
  if (!id) throw new Error('Property ID mangler.');
  if (!familyId) throw new Error('Velg en familie først.');
  const fn = httpsCallable(functions, 'hospBookingConnectProperty', { timeout: 30000 });
  return (await fn({ familyId, propertyId: id })).data;
}

/** Lagre Partner API Client ID + Secret for familien (server-side only). */
export async function saveHospitalityPartnerCredentials(familyId, {
  provider, clientId, clientSecret,
} = {}) {
  if (!familyId) throw new Error('Velg en familie først.');
  const fn = httpsCallable(functions, 'hospSavePartnerCredentials', { timeout: 20000 });
  return (await fn({
    familyId,
    provider: String(provider || '').trim(),
    clientId: String(clientId || '').trim(),
    clientSecret: String(clientSecret || '').trim(),
  })).data;
}

/** Én operasjon: auto-gjenkjenn kanal, lagre, synk. */
export async function connectIcalUrl(familyId, { icalUrl, propertyId } = {}) {
  const fn = httpsCallable(functions, 'hospConnectIcal', { timeout: 90000 });
  return (await fn({ familyId, icalUrl: String(icalUrl || '').trim(), propertyId: propertyId || null })).data;
}

export async function openBookingExtranet() {
  const url = HOSP_OAUTH_PROVIDERS.find((p) => p.id === 'booking')?.extranetUrl;
  if (!url) return;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    await Linking.openURL(url);
  }
}

export async function syncHospitalityChannel(familyId, channelType) {
  const fn = httpsCallable(functions, 'hospSyncChannelOAuth', { timeout: 90000 });
  return (await fn({ familyId, channelType })).data;
}

export async function syncAllHospitality(familyId) {
  const fn = httpsCallable(functions, 'hospSyncAllChannels', { timeout: 120000 });
  const sync = await fn({ familyId });
  const auto = httpsCallable(functions, 'hospProcessAutomessages', { timeout: 60000 });
  await auto({ familyId });
  return sync.data;
}

export async function disconnectHospitalityChannel(familyId, channelType) {
  const fn = httpsCallable(functions, 'hospDisconnectChannel', { timeout: 15000 });
  return (await fn({ familyId, channelType })).data;
}
