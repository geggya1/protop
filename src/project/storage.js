import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProjectState,
  mergeProjectStates,
  normalizeProjectState,
} from './engine.js';
import {
  attachTimeEntriesToState,
  diffTimeEntries,
  removeTimeEntry,
  saveTimeEntries,
} from '../economy/timeEntryStorage.js';

const KEY = 'protop.projectPlatform.v1';
const remoteTimers = new Map();
const remotePending = new Map();
/** Modulminne — unngår ny Firestore/AsyncStorage-runde ved hvert skjermbesøk. */
const MEMORY = new Map();
const inflight = new Map();
/** 'ok' når siste lesing mot Firestore lyktes, 'error' når den feilet. */
const loadMeta = new Map();

const REMOTE_AUTH_MS = 8000;
const REMOTE_READ_MS = 12000;

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

function localKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${KEY}.${id}` : KEY;
}

/** Prosjekt-monolitt uten timeEntries — unngår 1 MiB Firestore-tak. */
export function stripTimeEntriesFromState(state) {
  const next = normalizeProjectState(state);
  return { ...next, timeEntries: [] };
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

/**
 * Vent til Auth kan tilfredsstille reglene. getDoc før token er klar
 * gir permission-denied, som ellers ble tolket som en tom prosjektliste.
 */
async function ensureRemoteAuth() {
  const [{ onAuthStateChanged }, { auth }, { waitForFirestoreAccess }] = await Promise.all([
    import('firebase/auth'),
    import('../../firebase.js'),
    import('../utils/firestoreAccess.js'),
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

async function readRemote(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return { ok: true, state: emptyProjectState() };
  try {
    const authed = await ensureRemoteAuth();
    if (!authed) return { ok: false, state: emptyProjectState() };
    const { doc, getDoc, db } = await firestoreBits();
    const ref = doc(db, 'families', id, 'projects', 'state');
    const snap = await Promise.race([
      getDoc(ref),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error('project-read-timeout')), REMOTE_READ_MS);
      }),
    ]);
    if (!snap.exists()) return { ok: true, state: emptyProjectState() };
    return {
      ok: true,
      state: normalizeProjectState(snap.data()?.state || snap.data() || {}),
    };
  } catch {
    return { ok: false, state: emptyProjectState() };
  }
}

/**
 * Vellykket fjernlesing slås sammen og kan mellomlagres.
 * Feilet lesing beholdes som lokal kopi og skal ikke caches som «tomt».
 */
export function applyRemoteProjectRead(local, remote) {
  const base = normalizeProjectState(local);
  if (!remote?.ok) {
    return { cache: false, upload: false, state: base, meta: 'error' };
  }
  const remoteState = normalizeProjectState(remote.state);
  const merged = mergeProjectStates(base, remoteState);
  const upload = !!((base.projects?.length || base.timeEntries?.length) && !remoteState.projects?.length);
  return { cache: true, upload, state: merged, meta: 'ok' };
}

export function projectLoadMeta(companyId) {
  return loadMeta.get(memoryKey(companyId)) || '';
}

async function writeLocal(companyId, state) {
  // Ikke lagre timeEntries i prosjekt-blob — egen cache i timeEntryStorage.
  const slim = stripTimeEntriesFromState(state);
  const payload = JSON.stringify(slim);
  const key = localKey(companyId);
  try {
    await AsyncStorage.setItem(key, payload);
    if (companyId && key !== KEY) await AsyncStorage.setItem(KEY, payload).catch(() => {});
  } catch {
    await AsyncStorage.setItem(key, JSON.stringify({
      ...slim,
      documents: [],
      board: [],
    })).catch(() => {});
  }
}

function firestorePayload(state) {
  // JSON fjerner undefined, som Firestore avviser og som ellers stopper synk til mobil.
  // timeEntries strippes alltid — monolitt må holde seg under 1 MiB.
  return JSON.parse(JSON.stringify(stripTimeEntriesFromState(state)));
}

async function writeRemote(companyId, state) {
  const id = String(companyId || '').trim();
  if (!id) return { ok: true };
  try {
    const { doc, setDoc, serverTimestamp, db } = await firestoreBits();
    const ref = doc(db, 'families', id, 'projects', 'state');
    await setDoc(ref, {
      state: firestorePayload(state),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
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

async function syncTimeEntriesRemote(companyId, previousEntries, nextEntries) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const { changed, removed } = diffTimeEntries(previousEntries, nextEntries);
  if (changed.length) await saveTimeEntries(id, changed);
  for (const entryId of removed) {
    await removeTimeEntry(id, entryId);
  }
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
  if (!force && MEMORY.has(key)) {
    loadMeta.set(key, 'ok');
    return MEMORY.get(key);
  }
  if (!force && inflight.has(key)) return inflight.get(key);

  const pending = (async () => {
    const local = await readLocal(companyId);
    if (!companyId) {
      loadMeta.set(key, 'ok');
      return putProjectState(local, companyId);
    }
    const applied = applyRemoteProjectRead(local, await readRemote(companyId));
    loadMeta.set(key, applied.meta);
    if (!applied.cache) {
      const withHours = await attachTimeEntriesToState(companyId, applied.state);
      return putProjectState(withHours, companyId);
    }
    if (applied.upload) {
      queueRemote(companyId, { ...stripTimeEntriesFromState(applied.state), syncedAt: new Date().toISOString() });
    }
    const withHours = await attachTimeEntriesToState(companyId, applied.state);
    // Rydd legacy timeEntries ut av monolitten når de er migrert.
    if ((applied.state.timeEntries || []).length && withHours.timeEntries?.length) {
      queueRemote(companyId, {
        ...stripTimeEntriesFromState(withHours),
        syncedAt: new Date().toISOString(),
      });
    }
    return putProjectState(withHours, companyId);
  })();

  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function saveProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previous = MEMORY.get(memoryKey(companyId));
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;

  if (companyId) {
    try {
      await syncTimeEntriesRemote(companyId, previous?.timeEntries || [], full.timeEntries || []);
    } catch (error) {
      // Behold minne, men signaliser feil til kallere som await-er.
      putProjectState({ ...nextSlim, timeEntries: full.timeEntries || [] }, companyId);
      throw error;
    }
  }

  await writeLocal(companyId, nextSlim);
  queueRemote(companyId, nextSlim);
  return putProjectState({ ...nextSlim, timeEntries: full.timeEntries || [] }, companyId);
}

/** Lagrer med en gang og venter på Firestore (prosjekt + timeEntries). */
export async function persistProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previous = MEMORY.get(memoryKey(companyId));
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;

  if (companyId) {
    await syncTimeEntriesRemote(companyId, previous?.timeEntries || [], full.timeEntries || []);
  }

  await writeLocal(companyId, nextSlim);
  const id = String(companyId || '').trim();
  if (id) {
    const prev = remoteTimers.get(id);
    if (prev) clearTimeout(prev);
    remoteTimers.delete(id);
    remotePending.delete(id);
    const remote = await writeRemote(id, nextSlim);
    if (!remote.ok) {
      const message = remote.error?.message || remote.error?.code || 'Kunne ikke synke prosjekt til skyen.';
      throw new Error(
        /exceeds|too big|size|invalid-argument/i.test(String(message))
          ? 'Prosjektdata er for store til å lagres. Timeføringer lagres nå separat — prøv igjen.'
          : String(message),
      );
    }
  }
  return putProjectState({ ...nextSlim, timeEntries: full.timeEntries || [] }, companyId);
}

/** Test/hjelper: tøm minne mellom tester. */
export function clearProjectStateMemory(companyId) {
  if (companyId !== undefined) {
    const key = memoryKey(companyId);
    MEMORY.delete(key);
    inflight.delete(key);
    loadMeta.delete(key);
    return;
  }
  MEMORY.clear();
  inflight.clear();
  loadMeta.clear();
}
