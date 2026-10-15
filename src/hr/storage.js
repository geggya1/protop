/**
 * HR-tilstand: families/{companyId}/hr/state + lokal cache.
 * Venter på Auth før sky-lesing/skriving, slik at permission-denied
 * under boot ikke tømmer skydata med en tom lokal kopi.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isFirestorePermissionError,
  waitForFirestoreAccess,
} from '../utils/firestoreAccess.js';
import { emptyHrState, hrStateHasData, normalizeHrState } from './model.js';

const KEY = 'protop.hr.v1';
const REMOTE_AUTH_MS = 8000;
const MEMORY = new Map();
const inflight = new Map();
/** 'ok' | 'local' | 'error' — samme semantikk som anbudLoadMeta */
const loadMeta = new Map();

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

export function hrLoadMeta(companyId) {
  return loadMeta.get(memoryKey(companyId)) || '';
}

function putMemory(companyId, state) {
  const next = normalizeHrState(state);
  MEMORY.set(memoryKey(companyId), next);
  return next;
}

async function ensureRemoteAuth() {
  const [{ onAuthStateChanged }, { auth }] = await Promise.all([
    import('firebase/auth'),
    import('../../firebase.js'),
  ]);
  if (auth.currentUser?.uid) return waitForFirestoreAccess(auth.currentUser.uid, REMOTE_AUTH_MS);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { unsub(); } catch { /* ignore */ }
      resolve(!!ok);
    };
    const timer = setTimeout(() => finish(false), REMOTE_AUTH_MS);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user?.uid) return;
      waitForFirestoreAccess(user.uid, REMOTE_AUTH_MS).then(finish);
    });
  });
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

async function readRemote(companyId) {
  const ref = hrDoc(companyId);
  if (!ref) return { ok: false, state: null, reason: 'no-company' };
  const authed = await ensureRemoteAuth();
  if (!authed) return { ok: false, state: null, reason: 'auth' };
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, state: null, reason: 'missing' };
    return { ok: true, state: normalizeHrState(snap.data()), reason: 'ok' };
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      return { ok: false, state: null, reason: 'permission' };
    }
    return { ok: false, state: null, reason: 'error' };
  }
}

export async function loadHrState(companyId) {
  const key = memoryKey(companyId);
  if (!companyId) return emptyHrState();
  if (MEMORY.has(key)) return MEMORY.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const local = await readLocal(companyId);
    // Vis lokal cache med en gang, men ikke marker ok før skyen svarer.
    putMemory(companyId, local);
    const remote = await readRemote(companyId);
    if (remote.ok && remote.reason === 'missing') {
      // Tom sky: behold lokal data hvis den finnes (offline / ikke synket ennå).
      if (hrStateHasData(local)) {
        loadMeta.set(key, 'local');
        return local;
      }
      const empty = emptyHrState();
      loadMeta.set(key, 'ok');
      putMemory(companyId, empty);
      return empty;
    }
    if (remote.ok && remote.state) {
      loadMeta.set(key, 'ok');
      putMemory(companyId, remote.state);
      await writeLocal(companyId, remote.state);
      return remote.state;
    }
    // Auth/permission-feil: behold lokal — ikke late som om skyen var tom.
    loadMeta.set(key, remote.reason === 'auth' || remote.reason === 'permission' ? 'error' : 'local');
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
  const incoming = normalizeHrState(state);
  const key = memoryKey(companyId);
  const cached = MEMORY.get(key);
  // Ikke la en eldre lagring overskrive nyere in-memory state for samme selskap.
  if (cached?.updatedAt && incoming.updatedAt
    && String(cached.updatedAt) > String(incoming.updatedAt)) {
    return cached;
  }
  const next = normalizeHrState({
    ...incoming,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  });
  putMemory(companyId, next);
  await writeLocal(companyId, next);

  const ref = hrDoc(companyId);
  if (!ref) return next;

  const meta = loadMeta.get(key) || '';
  // Unngå å pushe en tom økt oppå skydata etter mislykket lasting.
  if ((meta === 'error' || meta === 'local') && !hrStateHasData(next)) {
    const err = new Error('Hopper over tom HR-skriving etter usikker lasting');
    err.code = 'hr/skip-empty';
    throw err;
  }

  const authed = await ensureRemoteAuth();
  if (!authed) {
    const err = new Error('Ikke innlogget — HR lagret bare lokalt');
    err.code = 'hr/auth';
    throw err;
  }
  try {
    await setDoc(ref, next, { merge: true });
    loadMeta.set(memoryKey(companyId), 'ok');
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      const denied = new Error('Mangler tilgang til å lagre HR i skyen');
      denied.code = 'hr/permission';
      throw denied;
    }
    throw err;
  }
  return next;
}

/** Test/hjelp: tøm modulminne. */
export function clearHrMemory() {
  MEMORY.clear();
  inflight.clear();
  loadMeta.clear();
}
