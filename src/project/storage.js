import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProjectState,
  mergeProjectStates,
  normalizeProjectState,
} from './engine.js';
import {
  attachTimeEntriesToState,
  diffTimeEntries,
  mergeEntryLists,
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
/**
 * Siste timeEntries som er synket til Firestore-subcollection.
 * Brukes som baseline for diff — ikke MEMORY, fordi Timeliste/Arbeid
 * kaller putProjectState før saveProjectState og da blir slettinger usynlige.
 */
const SYNCED_ENTRIES = new Map();
/** 'partial' når bare et datovindu er lastet — da skal sync ikke slette øvrige id-er. */
const HOURS_MODE = new Map();
/** Inflight for ensureProjectHours per selskap+vindu. */
const hoursInflight = new Map();

const REMOTE_AUTH_MS = 8000;
const REMOTE_READ_MS = 12000;

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

function cloneEntries(entries) {
  return (Array.isArray(entries) ? entries : []).slice();
}

function hoursModeKey(companyId) {
  return memoryKey(companyId);
}

export function peekSyncedTimeEntries(companyId) {
  return SYNCED_ENTRIES.get(memoryKey(companyId)) || null;
}

export function markTimeEntriesSynced(companyId, entries) {
  SYNCED_ENTRIES.set(memoryKey(companyId), cloneEntries(entries));
}

/** Slå sammen inn i SYNCED-baseline (delvis lasting). */
export function markTimeEntriesSyncedMerge(companyId, entries) {
  const key = memoryKey(companyId);
  const merged = mergeEntryLists(SYNCED_ENTRIES.get(key) || [], entries || []);
  SYNCED_ENTRIES.set(key, merged);
}

function baselineTimeEntries(companyId) {
  const key = memoryKey(companyId);
  if (SYNCED_ENTRIES.has(key)) return SYNCED_ENTRIES.get(key) || [];
  return MEMORY.get(key)?.timeEntries || [];
}

function setHoursMode(companyId, mode) {
  const key = hoursModeKey(companyId);
  if (mode === 'all') HOURS_MODE.set(key, 'all');
  else if (mode === 'partial') {
    if (HOURS_MODE.get(key) !== 'all') HOURS_MODE.set(key, 'partial');
  } else if (mode === 'none') {
    if (!HOURS_MODE.has(key)) HOURS_MODE.set(key, 'none');
  }
}

export function peekHoursMode(companyId) {
  return HOURS_MODE.get(hoursModeKey(companyId)) || 'none';
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

async function syncTimeEntriesRemote(companyId, previousEntries, nextEntries, { allowRemovals = true } = {}) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const { changed, removed } = diffTimeEntries(previousEntries, nextEntries);
  if (changed.length) await saveTimeEntries(id, changed);
  if (allowRemovals) {
    for (const entryId of removed) {
      await removeTimeEntry(id, entryId);
    }
    markTimeEntriesSynced(id, nextEntries);
  } else {
    // Delvis vindu: aldri slett id-er som ikke er i minnet.
    markTimeEntriesSyncedMerge(id, nextEntries);
  }
}

function resolveHoursOpts(hours) {
  if (hours === false || hours === 'none') return { hours: false };
  if (hours === true || hours === 'all') return { all: true };
  if (hours && typeof hours === 'object') {
    return {
      fromDate: String(hours.fromDate || '').trim(),
      toDate: String(hours.toDate || '').trim(),
      employeeId: String(hours.employeeId || '').trim(),
      all: false,
    };
  }
  // Standard: ikke last titusenvis av timer — kallere som trenger timer ber eksplisitt.
  return { hours: false };
}

/**
 * Koble timeEntries, heal orphan projectId (via normalize/put), og synk
 * remappede id-er tilbake til subcollection når de avviker fra lastet liste.
 */
async function loadStateWithHealedHours(companyId, baseState, hoursOpts) {
  if (hoursOpts?.hours === false) {
    const existing = MEMORY.get(memoryKey(companyId))?.timeEntries || [];
    const stored = putProjectState({ ...baseState, timeEntries: existing }, companyId);
    setHoursMode(companyId, existing.length ? peekHoursMode(companyId) : 'none');
    return stored;
  }
  const withHours = await attachTimeEntriesToState(companyId, baseState, hoursOpts);
  const attached = withHours.timeEntries || [];
  const existing = MEMORY.get(memoryKey(companyId))?.timeEntries || [];
  const mergedAttach = hoursOpts?.all
    ? withHours
    : { ...withHours, timeEntries: mergeEntryLists(existing, attached) };
  const stored = putProjectState(mergedAttach, companyId);
  const healed = stored.timeEntries || [];
  const attachedIds = new Set(attached.map((row) => row.id));
  const healedSlice = hoursOpts?.all
    ? healed
    : healed.filter((row) => attachedIds.has(row.id));
  if (hoursOpts?.all) {
    setHoursMode(companyId, 'all');
    markTimeEntriesSynced(companyId, healed);
  } else {
    setHoursMode(companyId, 'partial');
    markTimeEntriesSyncedMerge(companyId, healedSlice);
  }
  syncTimeEntriesRemote(companyId, attached, healedSlice, {
    allowRemovals: !!hoursOpts?.all,
  }).catch(() => {});
  return stored;
}

/**
 * Last prosjektstate. companyId anbefales for synk mellom brukere.
 * @param {string|object} companyIdOrOpts
 * @param {{ force?: boolean, hours?: false|'none'|'all'|true|{ fromDate?: string, toDate?: string, employeeId?: string } }} [maybeOpts]
 * hours standard er false (kun prosjekt/medlemskap) — Arbeid/Timerapport ber om vindu.
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
  const hoursOpts = resolveHoursOpts(opts.hours);
  const key = memoryKey(companyId);
  if (!force && MEMORY.has(key) && hoursOpts.hours === false) {
    loadMeta.set(key, 'ok');
    return MEMORY.get(key);
  }
  if (!force && MEMORY.has(key) && !hoursOpts.all && (hoursOpts.fromDate || hoursOpts.toDate || hoursOpts.employeeId)) {
    return ensureProjectHours(companyId, hoursOpts);
  }
  if (!force && inflight.has(key) && hoursOpts.hours === false) return inflight.get(key);

  const pending = (async () => {
    const local = await readLocal(companyId);
    if (!companyId) {
      loadMeta.set(key, 'ok');
      return putProjectState(local, companyId);
    }
    const applied = applyRemoteProjectRead(local, await readRemote(companyId));
    loadMeta.set(key, applied.meta);
    if (!applied.cache) {
      return loadStateWithHealedHours(companyId, applied.state, hoursOpts);
    }
    if (applied.upload) {
      queueRemote(companyId, { ...stripTimeEntriesFromState(applied.state), syncedAt: new Date().toISOString() });
    }
    const stored = await loadStateWithHealedHours(companyId, applied.state, hoursOpts);
    if ((applied.state.timeEntries || []).length && (hoursOpts.all || hoursOpts.fromDate)) {
      queueRemote(companyId, {
        ...stripTimeEntriesFromState(stored),
        syncedAt: new Date().toISOString(),
      });
    }
    return stored;
  })();

  if (hoursOpts.hours === false || hoursOpts.all) {
    inflight.set(key, pending);
  }
  try {
    return await pending;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

/**
 * Hent/merge timeføringer for et datovindu uten å laste hele selskapshistorikken.
 */
export async function ensureProjectHours(companyId, range = {}) {
  const id = String(companyId || '').trim();
  if (!id) return putProjectState(emptyProjectState(), '');
  const hoursOpts = resolveHoursOpts(range.all ? 'all' : range);
  const inflightKey = `${id}:${hoursOpts.fromDate || ''}:${hoursOpts.toDate || ''}:${hoursOpts.employeeId || ''}:${hoursOpts.all ? 'all' : 'w'}`;
  if (hoursInflight.has(inflightKey)) return hoursInflight.get(inflightKey);

  const pending = (async () => {
    let base = MEMORY.get(memoryKey(id));
    if (!base) {
      base = await loadProjectState(id, { hours: false });
    }
    // Unngå å re-normalize hele timeEntries-lista bare for å hente et nytt vindu.
    return loadStateWithHealedHours(id, { ...base, timeEntries: [] }, hoursOpts);
  })();

  hoursInflight.set(inflightKey, pending);
  try {
    return await pending;
  } finally {
    if (hoursInflight.get(inflightKey) === pending) hoursInflight.delete(inflightKey);
  }
}

export async function saveProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previousEntries = baselineTimeEntries(companyId);
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;
  const allowRemovals = peekHoursMode(companyId) === 'all';

  if (companyId) {
    try {
      await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
    } catch (error) {
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
  const previousEntries = baselineTimeEntries(companyId);
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;
  const allowRemovals = peekHoursMode(companyId) === 'all';

  if (companyId) {
    await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
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
    SYNCED_ENTRIES.delete(key);
    HOURS_MODE.delete(key);
    return;
  }
  MEMORY.clear();
  inflight.clear();
  loadMeta.clear();
  SYNCED_ENTRIES.clear();
  HOURS_MODE.clear();
  hoursInflight.clear();
}
