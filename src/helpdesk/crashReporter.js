/**
 * Krasjkontroll for web og mobil: fanger uventede feil og lagrer dem i Firestore
 * (`crashReports`), så helpdesken ser hva som feiler, hvor ofte og for hvem.
 *
 * - Web: window «error» og «unhandledrejection».
 * - Mobil: ErrorUtils (globale feil), før standardbehandlingen kjører.
 * - React: feilgrensene (index.js og skallet) kaller reportCrash med komponentstacken.
 *
 * Feil før innlogging legges i kø og sendes når noen logger inn (reglene krever innlogging).
 * Rapportene vaskes for tokens/nøkler, og samme feil sendes høyst hvert 5. minutt.
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { onAuthStateChanged } from 'firebase/auth';
import { addDoc, collection } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { APP_BUILD_ID } from '../constants/build';
import { currentRouteName } from '../navigation/navRef';
import {
  CRASH_COLLECTION, buildCrashReport, createCrashThrottle,
} from './crashReport.js';

const APP_VERSION = String(Constants?.expoConfig?.version || Constants?.manifest?.version || '');
const MAX_QUEUE = 5;

const throttle = createCrashThrottle();
const queue = [];
let installed = false;
let companyId = '';

/** Skallet forteller hvilken bedrift som er aktiv, så helpdesken ser hvem som er rammet. */
export function setCrashCompany(id) {
  companyId = String(id || '');
}

function context(extra = {}) {
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  let route = '';
  try { route = currentRouteName() || ''; } catch { /* ignore */ }
  return {
    platform: Platform.OS,
    appVersion: APP_VERSION,
    buildId: APP_BUILD_ID,
    route: web ? `${route}${route ? ' · ' : ''}${window.location?.pathname || ''}` : route,
    url: web ? window.location?.href || '' : '',
    userAgent: web ? window.navigator?.userAgent || '' : `${Platform.OS} ${Platform.Version || ''}`,
    companyId,
    ...extra,
  };
}

function send(report) {
  const uid = auth?.currentUser?.uid;
  if (!uid) {
    if (queue.length < MAX_QUEUE) queue.push(report);
    return;
  }
  addDoc(collection(db, CRASH_COLLECTION), { ...report, uid }).catch(() => {
    // Krasjkontrollen skal aldri selv gi feil i appen.
  });
}

function flushQueue() {
  if (!auth?.currentUser?.uid) return;
  while (queue.length) send(queue.shift());
}

/**
 * Rapporterer en feil. extra: { kind, fatal, componentStack }.
 * Trygg å kalle hvor som helst; gjør ingenting i utviklingsbygg (Metro) og emulatorbygg.
 */
export function reportCrash(error, extra = {}) {
  try {
    if (!isEnabled()) return;
    const report = buildCrashReport(error, context(extra));
    if (!report || !throttle.allow(report.signature)) return;
    send(report);
  } catch { /* ignore */ }
}

function isEnabled() {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return false;
  if (process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST && !process.env.EXPO_PUBLIC_CRASH_REPORTS_IN_EMULATOR) return false;
  return true;
}

function installWeb() {
  window.addEventListener('error', (event) => {
    reportCrash(event?.error || event?.message, { kind: 'error' });
  });
  window.addEventListener('unhandledrejection', (event) => {
    reportCrash(event?.reason, { kind: 'unhandledrejection' });
  });
}

function installNative() {
  const handler = global.ErrorUtils?.getGlobalHandler?.();
  if (!global.ErrorUtils?.setGlobalHandler) return;
  global.ErrorUtils.setGlobalHandler((error, isFatal) => {
    reportCrash(error, { kind: 'native', fatal: !!isFatal });
    if (handler) handler(error, isFatal);
  });
}

/** Kalles én gang ved oppstart (App.jsx). */
export function installCrashReporter() {
  if (installed) return;
  installed = true;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined') installWeb();
    else installNative();
    onAuthStateChanged(auth, (user) => { if (user) flushQueue(); });
  } catch { /* må aldri stoppe appen */ }
}
