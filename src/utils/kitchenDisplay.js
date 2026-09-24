/**
 * Kjøkken-/fellesenhetsvisning — lagres lokalt på enheten (som biometri).
 * Stripper chrome, hopper over hilsen/biometri-lås, viser kjøkken-vegg.
 * Valgfri PIN for å avslutte.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const SETTINGS_KEY = 'weekplan.kitchenDisplay.v1';

const listeners = new Set();

function notify(settings) {
  listeners.forEach((fn) => {
    try { fn(settings); } catch { /* ignore */ }
  });
}

async function hashPin(pin) {
  const s = `weekplan-kitchen-v2:${String(pin || '')}`;
  if (typeof globalThis.crypto?.subtle?.digest === 'function') {
    const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (non-crypto environments): salted djb2 — still not synced to Firestore.
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) + s.charCodeAt(i);
  return `v2:${h >>> 0}`;
}

export function isValidKitchenPin(pin) {
  return /^\d{4}$/.test(String(pin || ''));
}

export async function loadKitchenDisplaySettings(uid) {
  if (!uid) return { enabled: false, pinEnabled: false, hasPin: false };
  try {
    const raw = await AsyncStorage.getItem(`${SETTINGS_KEY}.${uid}`);
    if (!raw) return { enabled: false, pinEnabled: false, hasPin: false };
    const parsed = JSON.parse(raw);
    return {
      enabled: parsed?.enabled === true,
      pinEnabled: parsed?.pinEnabled === true && !!parsed?.pinHash,
      hasPin: !!parsed?.pinHash,
      pinHash: parsed?.pinHash || null,
    };
  } catch {
    return { enabled: false, pinEnabled: false, hasPin: false };
  }
}

export async function saveKitchenDisplaySettings(uid, patch = {}) {
  if (!uid) return;
  const prev = await loadKitchenDisplaySettings(uid);
  const next = {
    enabled: patch.enabled != null ? !!patch.enabled : prev.enabled,
    pinEnabled: patch.pinEnabled != null ? !!patch.pinEnabled : prev.pinEnabled,
    pinHash: prev.pinHash || null,
    updatedAt: Date.now(),
  };
  if (patch.pin != null) {
    const pin = String(patch.pin);
    if (pin === '') {
      next.pinHash = null;
      next.pinEnabled = false;
    } else if (isValidKitchenPin(pin)) {
      next.pinHash = await hashPin(pin);
      next.pinEnabled = true;
    }
  }
  // PIN-lås krever lagret hash
  if (next.pinEnabled && !next.pinHash) next.pinEnabled = false;
  try {
    await AsyncStorage.setItem(`${SETTINGS_KEY}.${uid}`, JSON.stringify(next));
  } catch { /* ignore */ }
  const publicSettings = {
    enabled: next.enabled,
    pinEnabled: next.pinEnabled && !!next.pinHash,
    hasPin: !!next.pinHash,
  };
  notify(publicSettings);
  return publicSettings;
}

export async function verifyKitchenPin(settings, pin) {
  if (!settings?.pinHash) return true;
  return (await hashPin(pin)) === settings.pinHash;
}

/** Abonner på endringer (enabled / pin-flagg). */
export function subscribeKitchenDisplay(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}
