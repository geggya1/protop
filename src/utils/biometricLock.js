import { Platform, AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'weekplan.biometricLock.v1';
const UNLOCK_GRACE_MS = 60 * 1000;

let LocalAuthentication = null;
let lastUnlockAt = 0;

async function loadLocalAuth() {
  if (LocalAuthentication) return LocalAuthentication;
  if (Platform.OS === 'web') return null;
  try {
    LocalAuthentication = await import('expo-local-authentication');
    return LocalAuthentication;
  } catch {
    return null;
  }
}

export async function isBiometricHardwareAvailable() {
  const LA = await loadLocalAuth();
  if (!LA) return false;
  try {
    const hasHardware = await LA.hasHardwareAsync();
    const enrolled = await LA.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function getBiometricLabel() {
  const LA = await loadLocalAuth();
  if (!LA) return 'Biometri';
  try {
    const types = await LA.supportedAuthenticationTypesAsync();
    if (types.includes(LA.AuthenticationType?.FACIAL_RECOGNITION)) {
      return Platform.OS === 'ios' ? 'Face ID' : 'Ansiktsgjenkjenning';
    }
    if (types.includes(LA.AuthenticationType?.FINGERPRINT)) {
      return Platform.OS === 'ios' ? 'Touch ID' : 'Fingeravtrykk';
    }
    if (types.includes(LA.AuthenticationType?.IRIS)) return 'Iris';
  } catch { /* ignore */ }
  return 'Biometri';
}

export async function loadBiometricSettings(uid) {
  if (!uid) return { enabled: false };
  try {
    const raw = await AsyncStorage.getItem(`${SETTINGS_KEY}.${uid}`);
    if (!raw) return { enabled: false };
    const parsed = JSON.parse(raw);
    return { enabled: parsed?.enabled === true };
  } catch {
    return { enabled: false };
  }
}

export async function saveBiometricSettings(uid, enabled) {
  if (!uid) return;
  try {
    await AsyncStorage.setItem(`${SETTINGS_KEY}.${uid}`, JSON.stringify({
      enabled: !!enabled,
      updatedAt: Date.now(),
    }));
  } catch { /* ignore */ }
}

export async function authenticateBiometric(promptMessage) {
  const LA = await loadLocalAuth();
  if (!LA) return { success: false, error: 'unavailable' };
  try {
    const result = await LA.authenticateAsync({
      promptMessage: promptMessage || 'Bekreft identiteten din',
      cancelLabel: 'Avbryt',
      disableDeviceFallback: false,
      fallbackLabel: 'Bruk passkode',
    });
    if (result.success) {
      lastUnlockAt = Date.now();
    }
    return result;
  } catch (err) {
    return { success: false, error: err?.message || 'failed' };
  }
}

export function markBiometricUnlocked() {
  lastUnlockAt = Date.now();
}

export function shouldRequireBiometricLock(enabled) {
  if (!enabled) return false;
  if (Platform.OS === 'web') return false;
  return Date.now() - lastUnlockAt > UNLOCK_GRACE_MS;
}

export function subscribeAppForeground(onForeground) {
  const sub = AppState.addEventListener('change', (next) => {
    if (next === 'active') onForeground();
  });
  return () => sub.remove();
}
