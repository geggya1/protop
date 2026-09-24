// /firebase.js (root) — web + native (Expo)
import { Platform } from 'react-native';
import { initializeApp, getApps } from 'firebase/app';
import {
  initializeAppCheck,
  ReCaptchaV3Provider,
  getToken as getAppCheckToken,
} from 'firebase/app-check';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getFunctions } from 'firebase/functions';

/**
 * authDomain must match the site origin on browsers that block third-party
 * storage (Safari / iOS). Firebase Hosting serves /__/auth/* on the custom domain.
 * @see https://firebase.google.com/docs/auth/web/redirect-best-practices
 */
function resolveAuthDomain() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.location?.hostname) {
    return 'protop-c189c.firebaseapp.com';
  }
  const host = window.location.hostname;
  // Must match the page origin. Safari treats www as third-party when the
  // user is on protop.no (no www), which breaks token refresh / callables.
  if (host === 'protop.no' || host === 'www.protop.no') {
    return host;
  }
  if (host === 'protop-c189c.web.app' || host === 'protop-c189c.firebaseapp.com') {
    return host;
  }
  return 'protop-c189c.firebaseapp.com';
}

/**
 * Native builds can override appId via env after creating iOS/Android apps
 * in the Firebase console (protop-c189c). Web appId remains the default.
 */
function resolveAppId() {
  if (Platform.OS === 'ios' && process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS) {
    return process.env.EXPO_PUBLIC_FIREBASE_APP_ID_IOS;
  }
  if (Platform.OS === 'android' && process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID) {
    return process.env.EXPO_PUBLIC_FIREBASE_APP_ID_ANDROID;
  }
  return '1:330510386923:web:e9177a73a29998749e20ae';
}

// ---- Firebase config ----
// ProTop only. Do not point this client at weekplan-4310f.
export const firebaseConfig = {
  apiKey: 'AIzaSyAShC-c1MK_iljAlbJPsNnrCQFwqGkVxqU',
  authDomain: resolveAuthDomain(),
  projectId: 'protop-c189c',
  storageBucket: 'protop-c189c.firebasestorage.app',
  messagingSenderId: '330510386923',
  appId: resolveAppId(),
};

export const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

function createAuth(firebaseApp) {
  if (Platform.OS === 'web') {
    return getAuth(firebaseApp);
  }
  try {
    // Lazy require so web bundles do not pull AsyncStorage persistence incorrectly.
    // eslint-disable-next-line global-require
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    // eslint-disable-next-line global-require
    const { getReactNativePersistence } = require('firebase/auth');
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch (e) {
    // Auth already initialized (Fast Refresh / hot reload)
    return getAuth(firebaseApp);
  }
}

// Auth / DB / Storage / Functions
export const auth = createAuth(app);
// Memory cache only — persistentLocalCache caused white-screen hangs on web
// (IndexedDB lock / multi-tab) after login and home-screen launches.
export const db = getFirestore(app);

// Deferred, non-blocking cleanup of leftover Firestore IndexedDB from the
// short-lived persistence experiment. Must NOT run during module init / race
// with getFirestore — that can wedge the first listeners and leave a white spinner.
// Wait well past family boot (list queries + listMyFamilies) before touching IDB.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  const schedule = (fn) => setTimeout(fn, 20000);
  schedule(() => {
    try {
      const flag = 'protop_cleared_fs_persist_v4';
      if (!window.indexedDB || window.localStorage.getItem(flag) === '1') return;
      // Skip if an older cleanup already ran — nothing left to delete.
      if (window.localStorage.getItem('protop_cleared_fs_persist_v3') === '1') {
        window.localStorage.setItem(flag, '1');
        return;
      }
      const projectId = firebaseConfig.projectId;
      const names = [
        `firestore/[DEFAULT]/${projectId}/(default)`,
        `firestore/[DEFAULT]/${projectId}/firestore`,
      ];
      let pending = names.length;
      const done = () => {
        pending -= 1;
        if (pending <= 0) {
          try { window.localStorage.setItem(flag, '1'); } catch { /* ignore */ }
        }
      };
      names.forEach((name) => {
        try {
          const req = window.indexedDB.deleteDatabase(name);
          req.onsuccess = done;
          req.onerror = done;
          req.onblocked = done;
        } catch {
          done();
        }
      });
    } catch { /* ignore */ }
  });
}

// Default GCS-bucket for prosjektet (firebasestorage.app)
export const storage = getStorage(app, 'gs://protop-c189c.firebasestorage.app');
export const functions = getFunctions(app, 'europe-west1');

// ---- App Check (WEB) ----
// Enable with EXPO_PUBLIC_ENABLE_APPCHECK=1 and a reCAPTCHA v3 site key.
const ENABLE_APPCHECK_WEB = process.env.EXPO_PUBLIC_ENABLE_APPCHECK === '1';

// Sett nøkkel i .env, f.eks. EXPO_PUBLIC_RECAPTCHA_V3_KEY=xxxx
const SITE_KEY =
  process.env.EXPO_PUBLIC_RECAPTCHA_V3_KEY
  || process.env.NEXT_PUBLIC_RECAPTCHA_V3_KEY
  || '';

const DEBUG_TOKEN =
  process.env.EXPO_PUBLIC_APPCHECK_DEBUG_TOKEN ||
  process.env.NEXT_PUBLIC_APPCHECK_DEBUG_TOKEN ||
  ''; // kan være tom; ved localhost bruker vi true

let appCheckReadyPromise = Promise.resolve();

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  try {
    if (!ENABLE_APPCHECK_WEB || !SITE_KEY) {
      // Keep the promise resolved so the app never waits on AppCheck.
      if (ENABLE_APPCHECK_WEB && !SITE_KEY) {
        console.warn('[AppCheck] Mangler EXPO_PUBLIC_RECAPTCHA_V3_KEY — App Check ikke aktivert.');
      }
    } else {
      const host = window.location.hostname;
      const isLocal =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        /^192\.168\./.test(host) ||
        /^10\./.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);

      // Aktiver debug-token lokalt (viser token i konsoll første gang)
      if (isLocal || DEBUG_TOKEN) {
        // eslint-disable-next-line no-undef
        self.FIREBASE_APPCHECK_DEBUG_TOKEN = DEBUG_TOKEN || true;
      }

      if (SITE_KEY) {
        const appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(SITE_KEY),
          isTokenAutoRefreshEnabled: true,
        });

        // Sørg for at vi har et gyldig token før første kall som krever App Check
        appCheckReadyPromise = getAppCheckToken(appCheck, /* forceRefresh */ true).catch(() => null);
      } else {
        console.warn('[AppCheck] Mangler reCAPTCHA v3 site key (sett EXPO_PUBLIC_RECAPTCHA_V3_KEY).');
      }
    }
  } catch (e) {
    console.warn('[AppCheck] init feilet:', e);
  }
}

/**
 * Kall denne før sensitive writes/reads for å sikre at App Check-token er klart.
 * På native (uten window) gjør den ingenting.
 */
export async function ensureAppCheckReady() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  await appCheckReadyPromise;
}

export default app;
