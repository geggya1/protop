import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { CONSENT_KEY, LEGAL_VERSION } from '../i18n/langs';

export function emptyConsents() {
  return {
    version: LEGAL_VERSION,
    termsAt: null,
    privacyAt: null,
    // Legacy fields kept for older clients reading the same doc
    gdprAt: null,
    dataAt: null,
    copyrightAt: null,
    marketingOptIn: false,
    marketingAt: null,
    language: null,
  };
}

export function consentsComplete(c) {
  if (!c || c.version !== LEGAL_VERSION) return false;
  if (c.termsAt && c.privacyAt) return true;
  // Accept legacy four-stamp packs only if somehow same version was written that way
  return !!(c.privacyAt && c.gdprAt && c.dataAt && c.copyrightAt);
}

export async function loadLocalConsents() {
  try {
    const raw = await AsyncStorage.getItem(CONSENT_KEY);
    return raw ? JSON.parse(raw) : emptyConsents();
  } catch {
    return emptyConsents();
  }
}

export async function saveLocalConsents(consents) {
  await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify(consents));
}

export async function persistUserConsents(uid, consents) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), {
    consents,
    consentsVersion: consents.version,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
