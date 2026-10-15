/**
 * HR-tilstand: families/{companyId}/hr/state + lokal cache.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { emptyHrState, normalizeHrState } from './model.js';

const KEY = 'protop.hr.v1';
const MEMORY = new Map();
const inflight = new Map();

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

function localKey(companyId) {
  return `${KEY}.${memoryKey(companyId)}`;
}

function hrDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'hr', 'state');
}

export function peekHrState(companyId) {
  return MEMORY.get(memoryKey(companyId)) || null;
}

function putMemory(companyId, state) {
  const next = normalizeHrState(state);
  MEMORY.set(memoryKey(companyId), next);
  return next;
}

async function readLocal(companyId) {
  try {
    const raw = await AsyncStorage.getItem(localKey(companyId));
    if (!raw) return emptyHrState();
    return normalizeHrState(JSON.parse(raw));
  } catch {
    return emptyHrState();
  }
}

async function writeLocal(companyId, state) {
  try {
    await AsyncStorage.setItem(localKey(companyId), JSON.stringify(normalizeHrState(state)));
  } catch {
    /* ignore */
  }
}

export async function loadHrState(companyId) {
  const key = memoryKey(companyId);
  if (!companyId) return emptyHrState();
  if (MEMORY.has(key)) return MEMORY.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const local = await readLocal(companyId);
    putMemory(companyId, local);
    try {
      const ref = hrDoc(companyId);
      if (!ref) return local;
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const remote = normalizeHrState(snap.data());
        putMemory(companyId, remote);
        await writeLocal(companyId, remote);
        return remote;
      }
    } catch {
      /* fall back to local */
    }
    return local;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export async function saveHrState(state, companyId) {
  const next = normalizeHrState({
    ...state,
    updatedAt: new Date().toISOString(),
  });
  putMemory(companyId, next);
  await writeLocal(companyId, next);
  try {
    const ref = hrDoc(companyId);
    if (ref) await setDoc(ref, next, { merge: true });
  } catch {
    /* local already saved */
  }
  return next;
}

/** Test/hjelp: tøm modulminne. */
export function clearHrMemory() {
  MEMORY.clear();
  inflight.clear();
}
