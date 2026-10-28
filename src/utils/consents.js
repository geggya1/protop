import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { CONSENT_KEY } from '../i18n/langs';
import { acceptedConsentRecord, emptyConsents } from './consentState';

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

export async function persistUserConsents(uid, consents) {
  if (!uid) return;
  await setDoc(doc(db, 'users', uid), {
    consents,
    consentsVersion: consents.version,
    updatedAt: serverTimestamp(),
  }, { merge: true });
}
