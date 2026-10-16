/**
 * Kapasitetsplan: families/{companyId}/capacity/plan + lokal cache.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isFirestorePermissionError,
  waitForFirestoreAccess,
} from '../utils/firestoreAccess.js';
import { emptyPlan, normalizePlan, planHasData } from './plan.js';

const KEY = 'protop.capacity.v1';
const REMOTE_AUTH_MS = 8000;
const MEMORY = new Map();
const inflight = new Map();
const loadMeta = new Map();

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

function localKey(companyId) {
  return `${KEY}.${memoryKey(companyId)}`;
}

function planDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'capacity', 'plan');
}

export function capacityLoadMeta(companyId) {
  return loadMeta.get(memoryKey(companyId)) || '';
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
    if (!raw) return emptyPlan();
    return normalizePlan(JSON.parse(raw));
  } catch {
    return emptyPlan();
  }
}

async function writeLocal(companyId, plan) {
  try {
    await AsyncStorage.setItem(localKey(companyId), JSON.stringify(normalizePlan(plan)));
  } catch {
    /* ignore */
  }
}

async function readRemote(companyId) {
  const ref = planDoc(companyId);
  if (!ref) return { ok: false, plan: null, reason: 'no-company' };
  const authed = await ensureRemoteAuth();
  if (!authed) return { ok: false, plan: null, reason: 'auth' };
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, plan: null, reason: 'missing' };
    return { ok: true, plan: normalizePlan(snap.data()), reason: 'ok' };
  } catch (err) {
    if (isFirestorePermissionError(err)) return { ok: false, plan: null, reason: 'permission' };
    return { ok: false, plan: null, reason: 'error' };
  }
}

export async function loadCapacityPlan(companyId) {
  const key = memoryKey(companyId);
  if (!companyId) return emptyPlan();
  const prevMeta = loadMeta.get(key) || '';
  if (MEMORY.has(key) && prevMeta !== 'error') return MEMORY.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const local = await readLocal(companyId);
    MEMORY.set(key, local);
    const remote = await readRemote(companyId);
    if (remote.ok && remote.reason === 'missing') {
      loadMeta.set(key, planHasData(local) ? 'local' : 'ok');
      return local;
    }
    if (remote.ok && remote.plan) {
      const localNewer = !!(local?.updatedAt && (
        !remote.plan.updatedAt || String(local.updatedAt) > String(remote.plan.updatedAt)
      ));
      if (planHasData(local) && (!planHasData(remote.plan) || localNewer)) {
        loadMeta.set(key, 'local');
        MEMORY.set(key, local);
        return local;
      }
      loadMeta.set(key, 'ok');
      MEMORY.set(key, remote.plan);
      await writeLocal(companyId, remote.plan);
      return remote.plan;
    }
    loadMeta.set(key, 'error');
    return local;
  })();

  inflight.set(key, job);
  try {
    return await job;
  } finally {
    inflight.delete(key);
  }
}

export async function saveCapacityPlan(plan, companyId) {
  const incoming = normalizePlan(plan);
  const key = memoryKey(companyId);
  const next = normalizePlan({
    ...incoming,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  });
  MEMORY.set(key, next);
  await writeLocal(companyId, next);
  const ref = planDoc(companyId);
  if (!ref) return next;
  const meta = loadMeta.get(key) || '';
  if (meta === 'error') {
    const err = new Error('Kapasitetsplan lagret bare lokalt');
    err.code = 'capacity/skip-uncertain';
    throw err;
  }
  const authed = await ensureRemoteAuth();
  if (!authed) {
    const err = new Error('Ikke innlogget');
    err.code = 'capacity/auth';
    throw err;
  }
  try {
    await setDoc(ref, next, { merge: true });
    loadMeta.set(key, 'ok');
  } catch (err) {
    if (isFirestorePermissionError(err)) {
      const denied = new Error('Mangler tilgang til å lagre kapasitetsplanen');
      denied.code = 'capacity/permission';
      throw denied;
    }
    throw err;
  }
  return next;
}
