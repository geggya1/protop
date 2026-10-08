import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProjectState,
  mergeProjectStates,
  normalizeProjectState,
} from './engine.js';

const KEY = 'protop.projectPlatform.v1';
const remoteTimers = new Map();
const remotePending = new Map();
/** Modulminne — unngår ny Firestore/AsyncStorage-runde ved hvert skjermbesøk. */
const MEMORY = new Map();
const inflight = new Map();

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

function localKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${KEY}.${id}` : KEY;
}

async function firestoreBits() {
  const [{ doc, getDoc, setDoc, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { doc, getDoc, setDoc, serverTimestamp, db };
}

export function peekProjectState(companyId) {
  return MEMORY.get(memoryKey(companyId)) || null;
}

/** Synkroniser minne uten å vente på disk (brukes ved lokale mutasjoner). */
export function putProjectState(state, companyId) {
  const next = normalizeProjectState(state);
  MEMORY.set(memoryKey(companyId), next);
  return next;
}

async function readLocal(companyId) {
  try {
    const scoped = await AsyncStorage.getItem(localKey(companyId));
    const raw = scoped || (companyId ? await AsyncStorage.getItem(KEY) : null);
    if (!raw) return emptyProjectState();
    return normalizeProjectState(JSON.parse(raw));
  } catch {
    return emptyProjectState();
  }
}

async function readRemote(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return emptyProjectState();
  try {
    const { doc, getDoc, db } = await firestoreBits();
    const ref = doc(db, 'families', id, 'projects', 'state');
    const snap = await getDoc(ref);
    if (!snap.exists()) return emptyProjectState();
    return normalizeProjectState(snap.data()?.state || snap.data() || {});
  } catch {
    return emptyProjectState();
  }
}

async function writeLocal(companyId, state) {
  const payload = JSON.stringify(state);
  const key = localKey(companyId);
  try {
    await AsyncStorage.setItem(key, payload);
    if (companyId && key !== KEY) await AsyncStorage.setItem(KEY, payload).catch(() => {});
  } catch {
    await AsyncStorage.setItem(key, JSON.stringify({
      ...state,
      documents: [],
      board: [],
    })).catch(() => {});
  }
}

async function writeRemote(companyId, state) {
  const id = String(companyId || '').trim();
  if (!id) return;
  try {
    const { doc, setDoc, serverTimestamp, db } = await firestoreBits();
    const ref = doc(db, 'families', id, 'projects', 'state');
    await setDoc(ref, {
      state,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  } catch {
    // Offline / manglende tilgang — lokal kopi er allerede lagret.
  }
}

function queueRemote(companyId, state) {
  const id = String(companyId || '').trim();
  if (!id) return;
  remotePending.set(id, state);
  const prev = remoteTimers.get(id);
  if (prev) clearTimeout(prev);
  remoteTimers.set(id, setTimeout(() => {
    remoteTimers.delete(id);
    const pending = remotePending.get(id);
    remotePending.delete(id);
    if (pending) writeRemote(id, pending).catch(() => {});
  }, 400));
}

/**
 * Last prosjektstate. companyId anbefales for synk mellom brukere.
 * Bakoverkompatibel: loadProjectState() eller loadProjectState({ force }).
 */
export async function loadProjectState(companyIdOrOpts, maybeOpts) {
  let companyId = '';
  let opts = {};
  if (typeof companyIdOrOpts === 'string' || companyIdOrOpts == null) {
    companyId = companyIdOrOpts || '';
    opts = maybeOpts || {};
  } else if (typeof companyIdOrOpts === 'object') {
    opts = companyIdOrOpts;
    companyId = '';
  }
  const { force = false } = opts;
  const key = memoryKey(companyId);
  if (!force && MEMORY.has(key)) return MEMORY.get(key);
  if (!force && inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const local = await readLocal(companyId);
    if (!companyId) {
      return putProjectState(local, companyId);
    }
    const remote = await readRemote(companyId);
    const merged = mergeProjectStates(local, remote);
    if ((local.projects?.length || local.timeEntries?.length) && !remote.projects?.length) {
      queueRemote(companyId, { ...merged, syncedAt: new Date().toISOString() });
    }
    return putProjectState(merged, companyId);
  })();

  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function saveProjectState(state, companyId) {
  const stamped = {
    ...normalizeProjectState(state),
    syncedAt: new Date().toISOString(),
  };
  const next = companyId
    ? mergeProjectStates(await readLocal(companyId), stamped)
    : stamped;
  await writeLocal(companyId, next);
  queueRemote(companyId, next);
  return putProjectState(next, companyId);
}

/** Lagrer med en gang og venter på Firestore. */
export async function persistProjectState(state, companyId) {
  const stamped = {
    ...normalizeProjectState(state),
    syncedAt: new Date().toISOString(),
  };
  const next = companyId
    ? mergeProjectStates(await readLocal(companyId), stamped)
    : stamped;
  await writeLocal(companyId, next);
  const id = String(companyId || '').trim();
  if (id) {
    const prev = remoteTimers.get(id);
    if (prev) clearTimeout(prev);
    remoteTimers.delete(id);
    remotePending.delete(id);
    await writeRemote(id, next);
  }
  return putProjectState(next, companyId);
}

/** Test/hjelper: tøm minne mellom tester. */
export function clearProjectStateMemory(companyId) {
  if (companyId !== undefined) {
    MEMORY.delete(memoryKey(companyId));
    inflight.delete(memoryKey(companyId));
    return;
  }
  MEMORY.clear();
  inflight.clear();
}
