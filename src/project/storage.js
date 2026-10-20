import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProjectState,
  mergeMemberLists,
  mergeProjectStates,
  normalizeProjectState,
} from './engine.js';
import {
  allowTimeEntryRemovals,
  attachTimeEntriesToState,
  clearDeletedTimeEntries,
  diffTimeEntries,
  mergeEntryLists,
  planTimeEntryRemovals,
  removeTimeEntry,
  saveTimeEntries,
  withoutDeletedTimeEntries,
} from '../economy/timeEntryStorage.js';
import {
  attachAbsencesToState,
  diffAbsences,
  mergeAbsenceLists,
  planAbsenceRemovals,
  removeAbsence,
  saveAbsences,
  withoutDeletedAbsences,
} from '../arbeid/absenceStorage.js';

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
/** Siste absences synket til subcollection (samme mønster som timer). */
const SYNCED_ABSENCES = new Map();
/** 'partial' når bare et datovindu er lastet — da skal sync ikke slette øvrige id-er. */
const HOURS_MODE = new Map();
const ABSENCE_MODE = new Map();
/** Siste vindu som faktisk er lest fra Firestore. Styrer hvilke slettinger som er trygge. */
const HOURS_WINDOW = new Map();
const ABSENCE_WINDOW = new Map();
/** Inflight for ensureProjectHours per selskap+vindu. */
const hoursInflight = new Map();
const absencesInflight = new Map();
/** Vinduer som allerede ligger i minnet denne økten. */
const HOURS_COVERED = new Map();

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
  SYNCED_ENTRIES.set(key, withoutDeletedTimeEntries(companyId, merged));
}

function baselineTimeEntries(companyId) {
  const key = memoryKey(companyId);
  if (SYNCED_ENTRIES.has(key)) return SYNCED_ENTRIES.get(key) || [];
  return MEMORY.get(key)?.timeEntries || [];
}

export function markAbsencesSynced(companyId, entries) {
  SYNCED_ABSENCES.set(memoryKey(companyId), cloneEntries(entries));
}

export function markAbsencesSyncedMerge(companyId, entries) {
  const key = memoryKey(companyId);
  const merged = mergeAbsenceLists(SYNCED_ABSENCES.get(key) || [], entries || []);
  SYNCED_ABSENCES.set(key, withoutDeletedAbsences(companyId, merged));
}

/** Etter vellykket fraværsimport: unngå at persist skriver alle radene på nytt. */
export function noteAbsencesImported(companyId, entries) {
  const id = String(companyId || '').trim();
  if (!id) return;
  markAbsencesSynced(id, entries);
  setAbsenceMode(id, 'all');
  noteAbsenceWindow(id, { all: true });
}

function baselineAbsences(companyId) {
  const key = memoryKey(companyId);
  if (SYNCED_ABSENCES.has(key)) return SYNCED_ABSENCES.get(key) || [];
  return MEMORY.get(key)?.absences || [];
}

function setAbsenceMode(companyId, mode) {
  const key = hoursModeKey(companyId);
  if (mode === 'all') ABSENCE_MODE.set(key, 'all');
  else if (mode === 'partial') {
    if (ABSENCE_MODE.get(key) !== 'all') ABSENCE_MODE.set(key, 'partial');
  } else if (mode === 'none') {
    if (!ABSENCE_MODE.has(key)) ABSENCE_MODE.set(key, 'none');
  }
}

function noteAbsenceWindow(companyId, opts) {
  const key = hoursModeKey(companyId);
  if (!opts || opts.absences === false) return;
  if (opts.all) {
    ABSENCE_WINDOW.set(key, { all: true });
    return;
  }
  ABSENCE_WINDOW.set(key, {
    all: false,
    fromDate: String(opts.fromDate || ''),
    toDate: String(opts.toDate || ''),
    employeeId: String(opts.employeeId || ''),
  });
}

function projectScopeOf(range) {
  const id = String(range?.projectId || '').trim();
  const numbers = (Array.isArray(range?.projectNumbers) ? range.projectNumbers : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .sort()
    .join(',');
  return `${id}|${numbers}`;
}

function noteHoursWindow(companyId, hoursOpts) {
  const key = hoursModeKey(companyId);
  if (!hoursOpts || hoursOpts.hours === false) return;
  // Prosjektlasting skal ikke snevres slettevinduet inn til «ingen datoer».
  const projectOnly = projectScopeOf(hoursOpts) !== '|'
    && !hoursOpts.fromDate && !hoursOpts.toDate && !hoursOpts.employeeId && !hoursOpts.all;
  if (projectOnly) return;
  if (hoursOpts.all) {
    HOURS_WINDOW.set(key, { all: true });
    return;
  }
  HOURS_WINDOW.set(key, {
    all: false,
    fromDate: String(hoursOpts.fromDate || ''),
    toDate: String(hoursOpts.toDate || ''),
    employeeId: String(hoursOpts.employeeId || ''),
  });
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

function rangeCovers(have, need) {
  if (!have) return false;
  if (have.all) return true;
  if (need?.all) return false;
  if (projectScopeOf(have) !== projectScopeOf(need)) return false;
  const haveEmp = String(have.employeeId || '');
  const needEmp = String(need?.employeeId || '');
  if (haveEmp && haveEmp !== needEmp) return false;
  const haveFrom = String(have.fromDate || '');
  const haveTo = String(have.toDate || '');
  const needFrom = String(need?.fromDate || '');
  const needTo = String(need?.toDate || '');
  if (needFrom) {
    if (!haveFrom || haveFrom > needFrom) return false;
  } else if (haveFrom) return false;
  if (needTo) {
    if (!haveTo || haveTo < needTo) return false;
  } else if (haveTo) return false;
  return true;
}

/** Husk at et vindu er lest, så neste besøk ikke venter på nett. */
export function noteLoadedHoursRange(companyId, opts = {}) {
  if (!opts || opts.hours === false) return;
  const key = memoryKey(companyId);
  if (opts.all) {
    HOURS_COVERED.set(key, [{ all: true }]);
    return;
  }
  const next = {
    all: false,
    fromDate: String(opts.fromDate || ''),
    toDate: String(opts.toDate || ''),
    employeeId: String(opts.employeeId || ''),
    projectId: String(opts.projectId || ''),
    projectNumbers: Array.isArray(opts.projectNumbers) ? opts.projectNumbers : [],
  };
  if (!next.fromDate && !next.toDate && !next.employeeId && projectScopeOf(next) === '|') return;
  const list = HOURS_COVERED.get(key) || [];
  if (list.some((have) => rangeCovers(have, next))) return;
  const kept = list.filter((have) => !rangeCovers(next, have));
  HOURS_COVERED.set(key, [...kept, next]);
}

export function hoursRangeCovered(companyId, range = {}) {
  if (peekHoursMode(companyId) === 'all') return true;
  const need = range?.all
    ? { all: true }
    : {
      all: false,
      fromDate: String(range.fromDate || ''),
      toDate: String(range.toDate || ''),
      employeeId: String(range.employeeId || ''),
      projectId: String(range.projectId || ''),
      projectNumbers: Array.isArray(range.projectNumbers) ? range.projectNumbers : [],
    };
  const list = HOURS_COVERED.get(memoryKey(companyId)) || [];
  return list.some((have) => rangeCovers(have, need));
}

/**
 * Ta imot en time-lasting uten å miste rader skjermen allerede viser
 * (lokal føring eller cache som kom inn mens nett-kallet pågikk).
 */
export function adoptLoadedHours(current, loaded, companyId = '') {
  const next = applyHoursOntoState(current, loaded);
  const merged = mergeEntryLists(current?.timeEntries, loaded?.timeEntries);
  return {
    ...next,
    timeEntries: companyId ? withoutDeletedTimeEntries(companyId, merged) : merged,
    members: mergeMemberLists(current?.members, next.members),
  };
}

function localKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${KEY}.${id}` : KEY;
}

/** Prosjekt-monolitt uten tunge lister — unngår 1 MiB Firestore-tak. */
export function stripTimeEntriesFromState(state) {
  const next = normalizeProjectState(state);
  return { ...next, timeEntries: [], absences: [] };
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

/**
 * Behold en liste som allerede er fylt. Tomt svar fra en parallell lesing
 * (timer mens fravær lastes, eller motsatt) skal ikke viske ut radene.
 */
export function keepFilledList(existing, incoming) {
  const current = Array.isArray(existing) ? existing : [];
  if (current.length) return current;
  return Array.isArray(incoming) ? incoming : [];
}

/** Time-lasting får oppdatere timer, men ikke tømme fravær som kom inn underveis. */
export function applyHoursOntoState(current, loaded) {
  return {
    ...(loaded || {}),
    absences: keepFilledList(current?.absences, loaded?.absences),
    absenceAdjustments: keepFilledList(current?.absenceAdjustments, loaded?.absenceAdjustments),
  };
}

/** Fraværslasting får oppdatere fravær, men ikke tømme timer som kom inn underveis. */
export function applyAbsencesOntoState(current, loaded) {
  return {
    ...(loaded || {}),
    timeEntries: keepFilledList(current?.timeEntries, loaded?.timeEntries),
    absences: keepFilledList(loaded?.absences, current?.absences),
  };
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
  const window = HOURS_WINDOW.get(id) || null;
  const { changed } = diffTimeEntries(previousEntries, nextEntries);
  const safeChanged = withoutDeletedTimeEntries(id, changed);
  const bySource = new Map();
  for (const row of safeChanged) {
    const source = String(row?.sourceCompanyId || id).trim() || id;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(row);
  }
  for (const [source, list] of bySource) {
    await saveTimeEntries(source, list);
  }
  const removable = planTimeEntryRemovals(previousEntries, nextEntries, window, { allowRemovals });
  if (removable.length) {
    const prevById = new Map((previousEntries || []).map((row) => [row?.id, row]));
    for (const entryId of removable) {
      const source = String(prevById.get(entryId)?.sourceCompanyId || id).trim() || id;
      await removeTimeEntry(source, entryId);
    }
  }
  const nextClean = withoutDeletedTimeEntries(id, nextEntries);
  if (allowRemovals && window?.all === true) {
    markTimeEntriesSynced(id, nextClean);
  } else {
    // Delvis vindu: behold id-er utenfor vinduet, men slipp dem brukeren slettet.
    markTimeEntriesSyncedMerge(id, nextClean);
  }
}

async function syncAbsencesRemote(companyId, previousEntries, nextEntries, { allowRemovals = true } = {}) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const window = ABSENCE_WINDOW.get(id) || null;
  const { changed, removed: requested } = diffAbsences(previousEntries, nextEntries);
  const removed = planAbsenceRemovals(previousEntries, nextEntries, { allowRemovals });
  // Tomt svar mot en fylt baseline skal ikke nullstille synken. Da blir neste
  // lagring tolket som at importen er borte.
  if (allowRemovals && requested.length && !removed.length) return;
  const safeChanged = withoutDeletedAbsences(id, changed);
  const bySource = new Map();
  for (const row of safeChanged) {
    const source = String(row?.sourceCompanyId || id).trim() || id;
    if (!bySource.has(source)) bySource.set(source, []);
    bySource.get(source).push(row);
  }
  for (const [source, list] of bySource) {
    await saveAbsences(source, list);
  }
  const removable = allowRemovals && window?.all === true
    ? removed
    : [];
  if (removable.length) {
    const prevById = new Map((previousEntries || []).map((row) => [row?.id, row]));
    for (const entryId of removable) {
      const source = String(prevById.get(entryId)?.sourceCompanyId || id).trim() || id;
      await removeAbsence(source, entryId);
    }
  }
  const nextClean = withoutDeletedAbsences(id, nextEntries);
  if (allowRemovals && window?.all === true) {
    markAbsencesSynced(id, nextClean);
  } else {
    markAbsencesSyncedMerge(id, nextClean);
  }
}

function resolveHoursOpts(hours) {
  if (hours === false || hours === 'none') return { hours: false };
  if (hours === true || hours === 'all') return { all: true };
  if (hours && typeof hours === 'object') {
    const projectNumbers = [...new Set((Array.isArray(hours.projectNumbers) ? hours.projectNumbers : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean))];
    return {
      fromDate: String(hours.fromDate || '').trim(),
      toDate: String(hours.toDate || '').trim(),
      employeeId: String(hours.employeeId || '').trim(),
      projectId: String(hours.projectId || '').trim(),
      projectNumbers,
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
    const latest = MEMORY.get(memoryKey(companyId));
    const existing = latest?.timeEntries || [];
    const patched = applyHoursOntoState(latest, { ...baseState, timeEntries: existing });
    const stored = putProjectState({
      ...patched,
      members: mergeMemberLists(latest?.members, patched.members),
    }, companyId);
    setHoursMode(companyId, existing.length ? peekHoursMode(companyId) : 'none');
    return stored;
  }
  const withHours = await attachTimeEntriesToState(companyId, baseState, hoursOpts);
  const attached = withoutDeletedTimeEntries(companyId, withHours.timeEntries || []);
  const live = MEMORY.get(memoryKey(companyId));
  const existing = withoutDeletedTimeEntries(companyId, live?.timeEntries || []);
  const withEntries = hoursOpts?.all
    ? { ...withHours, timeEntries: attached }
    : { ...withHours, timeEntries: mergeEntryLists(existing, attached) };
  // Timekall startet med et øyeblikksbilde. Fravær og stjerne som kom inn
  // mens kallet pågikk ligger i MEMORY og skal ikke skrives tilbake.
  const patched = applyHoursOntoState(live, withEntries);
  const stored = putProjectState({
    ...patched,
    members: mergeMemberLists(live?.members, patched.members),
  }, companyId);
  const healed = stored.timeEntries || [];
  const attachedIds = new Set(attached.map((row) => row.id));
  const healedSlice = hoursOpts?.all
    ? healed
    : healed.filter((row) => attachedIds.has(row.id));
  noteHoursWindow(companyId, hoursOpts);
  noteLoadedHoursRange(companyId, hoursOpts);
  if (hoursOpts?.all) {
    setHoursMode(companyId, 'all');
    markTimeEntriesSynced(companyId, healed);
  } else {
    setHoursMode(companyId, 'partial');
    markTimeEntriesSyncedMerge(companyId, healedSlice);
  }
  // Diff og eventuell tilbakeskriving skal ikke forsinke det skjermen viser.
  setTimeout(() => {
    syncTimeEntriesRemote(companyId, attached, healedSlice, {
      allowRemovals: !!hoursOpts?.all,
    }).catch(() => {});
  }, 0);
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
  if (!force && MEMORY.has(key) && !hoursOpts.all && (
    hoursOpts.fromDate || hoursOpts.toDate || hoursOpts.employeeId
    || hoursOpts.projectId || (hoursOpts.projectNumbers || []).length
  )) {
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
  if (hoursRangeCovered(id, hoursOpts) && MEMORY.has(memoryKey(id))) {
    return MEMORY.get(memoryKey(id));
  }
  const inflightKey = `${id}:${hoursOpts.fromDate || ''}:${hoursOpts.toDate || ''}:${hoursOpts.employeeId || ''}:${hoursOpts.projectId || ''}:${(hoursOpts.projectNumbers || []).join(',')}:${hoursOpts.all ? 'all' : 'w'}`;
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

function resolveAbsenceOpts(absences) {
  if (absences === false || absences === 'none') return { absences: false };
  if (absences === true || absences === 'all') return { all: true };
  if (absences && typeof absences === 'object') {
    return {
      fromDate: String(absences.fromDate || '').trim(),
      toDate: String(absences.toDate || '').trim(),
      employeeId: String(absences.employeeId || '').trim(),
      all: !!absences.all,
    };
  }
  return { absences: false };
}

async function loadStateWithHealedAbsences(companyId, baseState, absenceOpts) {
  if (absenceOpts?.absences === false) {
    const latest = MEMORY.get(memoryKey(companyId));
    const existing = latest?.absences || [];
    const patched = applyAbsencesOntoState(latest, { ...baseState, absences: existing });
    const stored = putProjectState({
      ...patched,
      members: mergeMemberLists(latest?.members, patched.members),
    }, companyId);
    setAbsenceMode(companyId, existing.length ? (ABSENCE_MODE.get(hoursModeKey(companyId)) || 'none') : 'none');
    return stored;
  }
  const withAbsences = await attachAbsencesToState(companyId, baseState, absenceOpts);
  const attached = withoutDeletedAbsences(companyId, withAbsences.absences || []);
  const existing = withoutDeletedAbsences(companyId, MEMORY.get(memoryKey(companyId))?.absences || []);
  const live = MEMORY.get(memoryKey(companyId));
  const withRows = absenceOpts?.all
    ? { ...withAbsences, absences: attached }
    : { ...withAbsences, absences: mergeAbsenceLists(existing, attached) };
  const patched = applyAbsencesOntoState(live, withRows);
  const stored = putProjectState({
    ...patched,
    members: mergeMemberLists(live?.members, patched.members),
  }, companyId);
  const healed = stored.absences || [];
  const attachedIds = new Set(attached.map((row) => row.id));
  const healedSlice = absenceOpts?.all
    ? healed
    : healed.filter((row) => attachedIds.has(row.id));
  noteAbsenceWindow(companyId, absenceOpts);
  if (absenceOpts?.all) {
    setAbsenceMode(companyId, 'all');
    markAbsencesSynced(companyId, healed);
  } else {
    setAbsenceMode(companyId, 'partial');
    markAbsencesSyncedMerge(companyId, healedSlice);
  }
  syncAbsencesRemote(companyId, attached, healedSlice, {
    allowRemovals: !!absenceOpts?.all,
  }).catch(() => {});
  return stored;
}

/**
 * Hent/merge fravær for et datovindu (eller hele historikken med all: true).
 */
export async function ensureProjectAbsences(companyId, range = {}) {
  const id = String(companyId || '').trim();
  if (!id) return putProjectState(emptyProjectState(), '');
  const absenceOpts = resolveAbsenceOpts(range.all ? 'all' : range);
  const inflightKey = `abs:${id}:${absenceOpts.fromDate || ''}:${absenceOpts.toDate || ''}:${absenceOpts.employeeId || ''}:${absenceOpts.all ? 'all' : 'w'}`;
  if (absencesInflight.has(inflightKey)) return absencesInflight.get(inflightKey);

  const pending = (async () => {
    let base = MEMORY.get(memoryKey(id));
    if (!base) {
      base = await loadProjectState(id, { hours: false });
    }
    return loadStateWithHealedAbsences(id, { ...base, absences: [] }, absenceOpts);
  })();

  absencesInflight.set(inflightKey, pending);
  try {
    return await pending;
  } finally {
    if (absencesInflight.get(inflightKey) === pending) absencesInflight.delete(inflightKey);
  }
}

export async function saveProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previousEntries = baselineTimeEntries(companyId);
  const previousAbsences = baselineAbsences(companyId);
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;
  const allowRemovals = allowTimeEntryRemovals(peekHoursMode(companyId), HOURS_WINDOW.get(memoryKey(companyId)) || null);
  const allowAbsenceRemovals = ABSENCE_MODE.get(memoryKey(companyId)) === 'all';

  if (companyId) {
    try {
      await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
      await syncAbsencesRemote(companyId, previousAbsences, full.absences || [], {
        allowRemovals: allowAbsenceRemovals,
      });
    } catch (error) {
      putProjectState({
        ...nextSlim,
        timeEntries: full.timeEntries || [],
        absences: full.absences || [],
      }, companyId);
      throw error;
    }
  }

  await writeLocal(companyId, nextSlim);
  queueRemote(companyId, nextSlim);
  return putProjectState({
    ...nextSlim,
    timeEntries: full.timeEntries || [],
    absences: full.absences || [],
  }, companyId);
}

/** Lagrer med en gang og venter på Firestore (prosjekt + timeEntries + absences). */
export async function persistProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previousEntries = baselineTimeEntries(companyId);
  const previousAbsences = baselineAbsences(companyId);
  const stamped = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const nextSlim = companyId
    ? stripTimeEntriesFromState(mergeProjectStates(await readLocal(companyId), stamped))
    : stamped;
  const allowRemovals = allowTimeEntryRemovals(peekHoursMode(companyId), HOURS_WINDOW.get(memoryKey(companyId)) || null);
  const allowAbsenceRemovals = ABSENCE_MODE.get(memoryKey(companyId)) === 'all';

  if (companyId) {
    await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
    await syncAbsencesRemote(companyId, previousAbsences, full.absences || [], {
      allowRemovals: allowAbsenceRemovals,
    });
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
          ? 'Prosjektdata er for store til å lagres. Timer og fravær lagres nå separat — prøv igjen.'
          : String(message),
      );
    }
  }
  return putProjectState({
    ...nextSlim,
    timeEntries: full.timeEntries || [],
    absences: full.absences || [],
  }, companyId);
}

/**
 * Oppdater utlegg/kjøring/varer på prosjektstate uten å synke hele timehistorikken.
 * mutate(state) returnerer felt som skal skrives, eller null når ingenting endres.
 */
export async function patchProjectOperations(companyId, mutate) {
  const id = String(companyId || '').trim();
  if (!id || typeof mutate !== 'function') return { ok: false };
  const remote = await readRemote(id);
  if (!remote?.ok) return { ok: false };
  const current = remote.state || emptyProjectState();
  const patch = mutate(current);
  if (!patch || typeof patch !== 'object') return { ok: true, changed: false };
  const next = { ...current, ...patch };
  const written = await writeRemote(id, next);
  if (!written?.ok) return { ok: false, error: written.error };
  const key = memoryKey(id);
  if (MEMORY.has(key)) {
    putProjectState({ ...MEMORY.get(key), ...patch }, id);
  }
  return { ok: true, changed: true };
}

/** Test/hjelper: tøm minne mellom tester. */
export function clearProjectStateMemory(companyId) {
  if (companyId !== undefined) {
    const key = memoryKey(companyId);
    MEMORY.delete(key);
    inflight.delete(key);
    loadMeta.delete(key);
    SYNCED_ENTRIES.delete(key);
    SYNCED_ABSENCES.delete(key);
    HOURS_MODE.delete(key);
    HOURS_WINDOW.delete(key);
    HOURS_COVERED.delete(key);
    ABSENCE_MODE.delete(key);
    ABSENCE_WINDOW.delete(key);
    clearDeletedTimeEntries(key);
    return;
  }
  MEMORY.clear();
  inflight.clear();
  loadMeta.clear();
  SYNCED_ENTRIES.clear();
  SYNCED_ABSENCES.clear();
  HOURS_MODE.clear();
  HOURS_WINDOW.clear();
  HOURS_COVERED.clear();
  ABSENCE_MODE.clear();
  ABSENCE_WINDOW.clear();
  hoursInflight.clear();
  absencesInflight.clear();
  clearDeletedTimeEntries();
}
