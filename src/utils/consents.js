import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../../firebase';
import { CONSENT_KEY } from '../i18n/langs';
import { acceptedConsentRecord, consentsComplete, emptyConsents } from './consentState';

export {
  acceptedConsentRecord, consentsComplete, emptyConsents, needsLegalUpdate,
} from './consentState';

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

export async function acceptLegalConsents(language) {
  const existing = await loadLocalConsents();
  const next = acceptedConsentRecord(language, existing);
  await saveLocalConsents(next);
  return next;
}

/**
 * Samtykkeloggen på serveren (versjon og servertid). Feiler stille: godkjenningen
 * er allerede lagret på kontoen, og samme godkjenning kan sendes på nytt uten duplikat.
 */
export async function logConsent({ kind, version, accepted, language, clientAt, familyId } = {}) {
  try {
    const call = httpsCallable(functions, 'recordConsent', { timeout: 15000 });
    await call({
      kind, version, accepted, language, clientAt, familyId, platform: Platform.OS,
    });
    return true;
  } catch {
    return false;
  }
}

/** `marketing: true` logger også valget om produkttips. */
export async function persistUserConsents(uid, consents, { marketing = false } = {}) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), {
    consents,
    consentsVersion: consents.version,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  if (consentsComplete(consents)) {
    logConsent({
      kind: 'terms', version: consents.version, language: consents.language, clientAt: consents.termsAt,
    });
  }
  if (marketing) {
    logConsent({
      kind: 'marketing',
      version: consents.version,
      accepted: !!consents.marketingOptIn,
      language: consents.language,
      clientAt: consents.marketingAt,
    });
  }
}
