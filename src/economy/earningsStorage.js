/**
 * Inntjeningsoppsett for bedriften: families/{companyId}/economy/earnings.
 * Åpning leser lagrede satser. Standardoppsettet skrives først når noen endrer det.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { defaultEarningsSettings, normalizeEarningsSettings } from './earnings.js';

async function remoteBits() {
  const [{ doc, getDoc, setDoc }, firebaseMod] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { doc, getDoc, setDoc, db: firebaseMod.db };
}

const KEY = 'protop.earnings.v1';
const memory = new Map();
const written = new Map();

function localKey(companyId) {
  return `${KEY}.${String(companyId || '').trim() || '_'}`;
}

function refFor(bits, companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return bits.doc(bits.db, 'families', id, 'economy', 'earnings');
}

async function readLocal(companyId) {
  try {
    const raw = await AsyncStorage.getItem(localKey(companyId));
    if (!raw) return null;
    return normalizeEarningsSettings(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function loadEarningsSettings(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return defaultEarningsSettings();
  if (memory.has(id)) return memory.get(id);
  const local = await readLocal(id);
  try {
    const bits = await remoteBits();
    const ref = refFor(bits, id);
    if (ref) {
      const snap = await bits.getDoc(ref);
      if (snap.exists()) {
        const remote = normalizeEarningsSettings(snap.data());
        memory.set(id, remote);
        written.set(id, JSON.stringify(remote));
        try { await AsyncStorage.setItem(localKey(id), JSON.stringify(remote)); } catch { /* ignore */ }
        return remote;
      }
    }
  } catch {
    /* Bruk lokal kopi når skyen ikke svarer. */
  }
  const next = local || defaultEarningsSettings();
  memory.set(id, next);
  if (local) written.set(id, JSON.stringify(next));
  return next;
}

export async function saveEarningsSettings(companyId, settings) {
  const id = String(companyId || '').trim();
  const next = normalizeEarningsSettings(settings);
  if (!id) return next;
  const body = JSON.stringify(next);
  memory.set(id, next);
  if (written.get(id) === body) return next;
  try {
    await AsyncStorage.setItem(localKey(id), body);
    const bits = await remoteBits();
    const ref = refFor(bits, id);
    if (ref) await bits.setDoc(ref, JSON.parse(body));
    written.set(id, body);
  } catch (error) {
    written.delete(id);
    throw error;
  }
  return next;
}
