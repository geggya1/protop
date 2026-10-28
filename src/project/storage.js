import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  emptyProjectState,
  mergeMemberLists,
  normalizeProjectState,
} from './engine.js';
import {
  applyProjectDiff,
  combineProjectDiffs,
  diffProjectStates,
  isEmptyProjectDiff,
  projectDiffKeys,
} from './stateDiff.js';
import { showSaveError } from '../ui/saveToast.js';
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
import { dropRetiredLocalKeys } from '../utils/retiredLocalKeys.js';

/** v1 kunne inneholde et annet selskaps prosjekter. Den forkastes. */
const KEY = 'protop.projectPlatform.v2';
const RETIRED_KEYS = ['protop.projectPlatform.v1'];
/** Endringer som ikke har nådd skyen ennå (f.eks. uten nett). Ligger på enheten til de er lagret. */
const OUTBOX_KEY = 'protop.projectOutbox.v1';
const OUTBOX_MAX_DAYS = 30;
const OUTBOX = new Map();
const outboxLoaded = new Map();
let outboxSeq = 0;
const flushTimers = new Map();
const flushChains = new Map();
const retryTimers = new Map();
const retryCounts = new Map();
const RETRY_MS = [20000, 60000, 180000];
/** Når feilen sist ble vist. Samme feil vises ikke oftere enn hvert minutt. */
const failureShown = new Map();
const FAILURE_TOAST_MS = 60000;
/**
 * Versjonen av prosjektdokumentet hver skjerm startet fra (baseRev på state).
 * Lagring regner ut hva brukeren har endret mot denne, ikke mot hele skyen.
 */
const BASES = new Map();
const BASE_CAP = 80;
const SESSION = Math.random().toString(36).slice(2, 8);
let baseSeq = 0;
/** Størrelsen på prosjektdokumentet ved siste lagring, i byte. */
const DOC_SIZE = new Map();
const DOC_WARN_BYTES = 700000;
/** Firestore tar 1 MiB per dokument. Litt margin for tidsstempel og felt-navn. */
const DOC_MAX_BYTES = 1040000;
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

/**
 * Utstyr, reservasjoner og egne biler ligger i et eget lite dokument (projects/equipment).
 * Hoveddokumentet (projects/state) kan nå Firestores grense på 1 MiB, og da ble
 * endringer på utstyr avvist uten at noen merket det.
 * Finnes dokumentet, er det fasit for disse listene. Ellers brukes hoveddokumentet.
 */
export const EQUIPMENT_DOC_KEYS = ['equipment', 'equipmentBookings', 'personalVehicles'];

function rowStamp(row) {
  return Date.parse(row?.updatedAt || row?.createdAt || '') || 0;
}

/** Slå sammen etter id. Nyeste rad vinner, og ved likt tidspunkt vinner incoming. */
function mergeRowsNewest(current, incoming) {
  const map = new Map();
  for (const row of Array.isArray(current) ? current : []) {
    if (row?.id) map.set(row.id, row);
  }
  for (const row of Array.isArray(incoming) ? incoming : []) {
    if (!row?.id) continue;
    const prev = map.get(row.id);
    if (!prev || rowStamp(row) >= rowStamp(prev)) map.set(row.id, row);
  }
  return [...map.values()];
}

/** Lister for utstyrsdokumentet, slått sammen med det som allerede ligger der. */
export function mergeEquipmentDoc(current, incoming) {
  const out = {};
  for (const key of EQUIPMENT_DOC_KEYS) {
    out[key] = mergeRowsNewest(current?.[key], incoming?.[key]);
  }
  return out;
}

/** Utstyrsdokumentet er fasit for sine lister når det finnes. */
export function applyEquipmentDoc(state, side) {
  if (!side || typeof side !== 'object') return state;
  const next = { ...state };
  for (const key of EQUIPMENT_DOC_KEYS) {
    if (Array.isArray(side[key])) next[key] = side[key];
  }
  return next;
}

/**
 * Produktkatalogen ligger i et eget lite dokument (projects/catalog).
 * Å arkivere eller rette et produkt skal ikke stoppe fordi hoveddokumentet
 * har nådd Firestores grense på 1 MiB. Finnes dokumentet, er det fasit for katalogen.
 */
export const CATALOG_DOC_KEYS = ['products', 'deletedProducts'];

/** Slå sammen katalogen: nyeste produkt vinner, slettede produkter holdes ute. */
export function mergeCatalogDoc(current, incoming) {
  const deletedProducts = mergeRowsNewest(current?.deletedProducts, incoming?.deletedProducts);
  const gone = new Set(deletedProducts.map((row) => row.id));
  return {
    products: mergeRowsNewest(current?.products, incoming?.products).filter((row) => !gone.has(row.id)),
    deletedProducts,
  };
}

/** Katalogdokumentet er fasit for produktene når det finnes. */
export function applyCatalogDoc(state, side) {
  if (!side || typeof side !== 'object' || !Array.isArray(side.products)) return state;
  return {
    ...state,
    products: side.products,
    deletedProducts: Array.isArray(side.deletedProducts) ? side.deletedProducts : [],
  };
}

function pickCatalogKeys(value) {
  const out = {};
  for (const key of CATALOG_DOC_KEYS) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key];
  }
  return out;
}

function pickEquipmentKeys(value) {
  const out = {};
  for (const key of EQUIPMENT_DOC_KEYS) {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) out[key] = value[key];
  }
  return out;
}

function withoutEquipmentKeys(value) {
  const out = { ...(value || {}) };
  for (const key of EQUIPMENT_DOC_KEYS) delete out[key];
  return out;
}

async function firestoreBits() {
  const [{ doc, getDoc, runTransaction, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return { doc, getDoc, runTransaction, serverTimestamp, db };
}

function projectRefs(bits, companyId) {
  return {
    main: bits.doc(bits.db, 'families', companyId, 'projects', 'state'),
    side: bits.doc(bits.db, 'families', companyId, 'projects', 'equipment'),
    catalog: bits.doc(bits.db, 'families', companyId, 'projects', 'catalog'),
  };
}

/** Prosjektstate fra de tre dokumentene: hoveddokumentet, utstyr og katalog. */
function remoteStateFrom(snap, sideSnap, catalogSnap) {
  const side = sideSnap.exists() ? sideSnap.data() : null;
  const catalog = catalogSnap.exists() ? catalogSnap.data() : null;
  const base = snap.exists() ? (snap.data()?.state || snap.data() || {}) : emptyProjectState();
  return normalizeProjectState(applyCatalogDoc(applyEquipmentDoc(base, side), catalog));
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
  await dropRetiredLocalKeys(AsyncStorage, RETIRED_KEYS);
  try {
    // Bare selskapets egen kopi. Den gamle felles nøkkelen kan høre til et annet selskap.
    const raw = await AsyncStorage.getItem(localKey(companyId));
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
    const bits = await firestoreBits();
    const refs = projectRefs(bits, id);
    let timer = null;
    const [snap, sideSnap, catalogSnap] = await Promise.race([
      Promise.all([bits.getDoc(refs.main), bits.getDoc(refs.side), bits.getDoc(refs.catalog)]),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('project-read-timeout')), REMOTE_READ_MS);
        timer?.unref?.();
      }),
    ]).finally(() => clearTimeout(timer));
    return {
      ok: true,
      exists: snap.exists(),
      state: remoteStateFrom(snap, sideSnap, catalogSnap),
    };
  } catch {
    return { ok: false, state: emptyProjectState() };
  }
}

/**
 * Skyen er fasit. Den lokale kopien er bare reserve når skyen ikke svarer, og slås
 * ikke inn i skyens kopi: da kom slettede rader tilbake, og en gammel liste kunne
 * skjule prosjekter andre hadde lagt til. Ventende endringer ligger i en egen kø.
 * Finnes ikke prosjektdokumentet i det hele tatt, lastes den lokale kopien opp.
 */
export function applyRemoteProjectRead(local, remote) {
  const base = normalizeProjectState(local);
  if (!remote?.ok) {
    return { cache: false, upload: false, state: base, meta: 'error' };
  }
  const remoteState = normalizeProjectState(remote.state);
  const upload = remote.exists === false && !!base.projects?.length;
  return { cache: true, upload, state: upload ? base : remoteState, meta: 'ok' };
}

export function projectLoadMeta(companyId) {
  return loadMeta.get(memoryKey(companyId)) || '';
}

function withoutBaseRev(state) {
  if (!state || typeof state !== 'object' || !('baseRev' in state)) return state;
  const { baseRev, ...rest } = state;
  return rest;
}

async function writeLocal(companyId, state) {
  // Ikke lagre timeEntries i prosjekt-blob — egen cache i timeEntryStorage.
  const slim = withoutBaseRev(stripTimeEntriesFromState(state));
  const payload = JSON.stringify(slim);
  const key = localKey(companyId);
  try {
    await AsyncStorage.setItem(key, payload);
    // Fjern den felles kopien, så neste selskap i nettleseren ikke arver prosjektene.
    if (companyId && key !== KEY) await AsyncStorage.removeItem(KEY).catch(() => {});
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
  return JSON.parse(JSON.stringify(withoutBaseRev(stripTimeEntriesFromState(state))));
}

function encodedBytes(value) {
  try {
    const raw = JSON.stringify(value);
    if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(raw).length;
    return raw.length;
  } catch {
    return 0;
  }
}

/** Størrelsen på prosjektdokumentet ved siste lagring (byte), til feilsøking. */
export function projectDocSize(companyId) {
  return DOC_SIZE.get(memoryKey(companyId)) || 0;
}

function noteDocSize(companyId, bytes) {
  if (!bytes) return;
  DOC_SIZE.set(memoryKey(companyId), bytes);
  if (bytes > DOC_WARN_BYTES && typeof console !== 'undefined') {
    console.warn(`[prosjekt] projects/state for ${companyId} er ${Math.round(bytes / 1000)} kB. Grensen i Firestore er 1 MiB.`);
  }
}

function tooLargeError(bytes) {
  const error = new Error(`Prosjektdataene er for store til å lagres i skyen (${Math.round(bytes / 1000)} kB av 1 MiB). Endringen ligger på denne enheten.`);
  error.code = 'project-doc-too-large';
  return error;
}

/* ───────── Versjonen skjermen startet fra ───────── */

/** Husk en versjon som utgangspunkt for senere lagringer, og gi den et nummer (baseRev). */
function rememberBase(companyId, state) {
  const key = memoryKey(companyId);
  baseSeq += 1;
  const rev = `${SESSION}.${baseSeq}`;
  const map = BASES.get(key) || new Map();
  map.set(rev, withoutBaseRev(stripTimeEntriesFromState(state)));
  while (map.size > BASE_CAP) map.delete(map.keys().next().value);
  BASES.set(key, map);
  return rev;
}

function baseFor(companyId, rev) {
  if (!rev) return null;
  return BASES.get(memoryKey(companyId))?.get(rev) || null;
}

/** Legg state i minnet som ny versjon. Skjermer som laster herfra, regner endringer mot den. */
function adoptBase(companyId, state) {
  const rev = rememberBase(companyId, state);
  return putProjectState({ ...state, baseRev: rev }, companyId);
}

/* ───────── Kø med endringer som skal til skyen ───────── */

function outboxKey(companyId) {
  return `${OUTBOX_KEY}.${companyId}`;
}

async function hydrateOutbox(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return [];
  if (!outboxLoaded.has(id)) {
    outboxLoaded.set(id, (async () => {
      let stored = [];
      try {
        const raw = await AsyncStorage.getItem(outboxKey(id));
        const parsed = raw ? JSON.parse(raw) : [];
        const cutoff = Date.now() - OUTBOX_MAX_DAYS * 86400000;
        stored = (Array.isArray(parsed) ? parsed : [])
          .filter((row) => row?.diff && (Date.parse(row.at || '') || 0) >= cutoff);
      } catch {
        stored = [];
      }
      // Endringer lagt i køen mens vi leste, kommer etter de lagrede.
      OUTBOX.set(id, [...stored, ...(OUTBOX.get(id) || [])]);
    })());
  }
  await outboxLoaded.get(id);
  return OUTBOX.get(id) || [];
}

function persistOutbox(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const list = OUTBOX.get(id) || [];
  try {
    const job = list.length
      ? AsyncStorage.setItem(outboxKey(id), JSON.stringify(list))
      : AsyncStorage.removeItem(outboxKey(id));
    if (job && typeof job.catch === 'function') job.catch(() => {});
  } catch {
    // Disken er best-effort. Køen i minnet gjelder for økten.
  }
}

/** Legg en endring i køen. Følger den rett etter en annen, slås de sammen. */
function enqueueProjectDiff(companyId, diff) {
  const id = String(companyId || '').trim();
  if (!id || isEmptyProjectDiff(diff)) return false;
  const list = OUTBOX.get(id) || [];
  const last = list[list.length - 1];
  const combined = last ? combineProjectDiffs(last.diff, diff) : null;
  outboxSeq += 1;
  const entry = { seq: `${SESSION}.${outboxSeq}`, at: new Date().toISOString(), diff: combined || diff };
  OUTBOX.set(id, combined ? [...list.slice(0, -1), entry] : [...list, entry]);
  persistOutbox(id);
  return true;
}

/** Ventende endringer for selskapet (lest fra enheten første gang). */
export async function pendingProjectChanges(companyId) {
  return (await hydrateOutbox(companyId)).map((row) => row.diff);
}

/**
 * Skriv endringene i én transaksjon: les skyens ferske kopi, legg på endringene og skriv.
 * plan(fresh) gir listen med endringer, eller ingen når ingenting skal skrives.
 * mainForCatalog: produkter skrives også til hoveddokumentet (eldre klienter leser derfra).
 */
async function commitRemote(companyId, plan, { mainForCatalog = true } = {}) {
  const id = String(companyId || '').trim();
  if (!id) return { ok: true, changed: false };
  try {
    const authed = await ensureRemoteAuth();
    if (!authed) return { ok: false, error: new Error('Ikke innlogget mot skyen ennå.') };
    const bits = await firestoreBits();
    const refs = projectRefs(bits, id);
    let outcome = { changed: false, state: null, bytes: 0 };
    await bits.runTransaction(bits.db, async (tx) => {
      const snap = await tx.get(refs.main);
      const sideSnap = await tx.get(refs.side);
      const catalogSnap = await tx.get(refs.catalog);
      const fresh = remoteStateFrom(snap, sideSnap, catalogSnap);
      const diffs = (plan(fresh) || []).filter((diff) => !isEmptyProjectDiff(diff));
      outcome = { changed: false, state: fresh, bytes: 0 };
      if (!diffs.length) return;
      const touched = new Set();
      for (const diff of diffs) projectDiffKeys(diff).forEach((key) => touched.add(key));
      const next = normalizeProjectState({
        ...diffs.reduce((state, diff) => applyProjectDiff(state, diff), fresh),
        syncedAt: new Date().toISOString(),
      });
      const payload = firestorePayload(next);
      const touchesSide = EQUIPMENT_DOC_KEYS.some((key) => touched.has(key));
      const touchesCatalog = CATALOG_DOC_KEYS.some((key) => touched.has(key));
      const touchesMain = [...touched].some((key) => (
        !EQUIPMENT_DOC_KEYS.includes(key) && !CATALOG_DOC_KEYS.includes(key)
      )) || (touchesCatalog && mainForCatalog);
      const updatedAt = bits.serverTimestamp();
      let bytes = 0;
      if (touchesMain) {
        // Uten utstyrslistene. Med merge beholdes de gamle listene for eldre klienter.
        const main = withoutEquipmentKeys(payload);
        bytes = encodedBytes(main);
        if (bytes > DOC_MAX_BYTES) throw tooLargeError(bytes);
        tx.set(refs.main, { state: main, updatedAt }, { merge: true });
      }
      if (touchesSide) tx.set(refs.side, { ...pickEquipmentKeys(payload), updatedAt }, { merge: true });
      if (touchesCatalog) tx.set(refs.catalog, { ...pickCatalogKeys(payload), updatedAt });
      outcome = { changed: true, state: next, bytes };
    });
    noteDocSize(id, outcome.bytes);
    return { ok: true, ...outcome };
  } catch (error) {
    return { ok: false, error };
  }
}

function clearRetry(companyId) {
  const timer = retryTimers.get(companyId);
  if (timer) clearTimeout(timer);
  retryTimers.delete(companyId);
}

function scheduleRetry(companyId) {
  const tries = retryCounts.get(companyId) || 0;
  if (tries >= RETRY_MS.length || retryTimers.has(companyId)) return;
  retryCounts.set(companyId, tries + 1);
  const timer = setTimeout(() => {
    retryTimers.delete(companyId);
    flushInBackground(companyId);
  }, RETRY_MS[tries]);
  timer?.unref?.();
  retryTimers.set(companyId, timer);
}

/** Melding til brukeren når skyen ikke tok imot en lagring. */
export function remoteFailureText(error) {
  const raw = String(error?.message || error?.code || '');
  if (error?.code === 'project-doc-too-large') return raw;
  if (/exceeds|too big|maximum allowed size/i.test(raw)) {
    return 'Prosjektdataene er for store til å lagres i skyen. Endringen ligger på denne enheten.';
  }
  return 'Endringen ligger på denne enheten og sendes når skyen svarer.';
}

/** Send hele køen til skyen. Én sending om gangen per selskap. */
export function flushProjectChanges(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return Promise.resolve({ ok: true, changed: false });
  const timer = flushTimers.get(id);
  if (timer) clearTimeout(timer);
  flushTimers.delete(id);
  const previous = flushChains.get(id) || Promise.resolve();
  const job = previous.then(async () => {
    const batch = (await hydrateOutbox(id)).slice();
    if (!batch.length) return { ok: true, changed: false };
    const result = await commitRemote(id, () => batch.map((row) => row.diff));
    if (result.ok) {
      const sent = new Set(batch.map((row) => row.seq));
      OUTBOX.set(id, (OUTBOX.get(id) || []).filter((row) => !sent.has(row.seq)));
      persistOutbox(id);
      clearRetry(id);
      retryCounts.delete(id);
      failureShown.delete(id);
    }
    return result;
  });
  flushChains.set(id, job.catch(() => {}));
  return job;
}

function flushInBackground(companyId) {
  flushProjectChanges(companyId).then((result) => {
    if (result.ok) return;
    // Lagringen i skyen feilet. Si fra (ikke for hver lagring), og prøv igjen litt senere.
    if (Date.now() - (failureShown.get(companyId) || 0) > FAILURE_TOAST_MS) {
      failureShown.set(companyId, Date.now());
      showSaveError(remoteFailureText(result.error));
    }
    scheduleRetry(companyId);
  }).catch(() => {});
}

function scheduleFlush(companyId, delay = 400) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const prev = flushTimers.get(id);
  if (prev) clearTimeout(prev);
  const timer = setTimeout(() => {
    flushTimers.delete(id);
    flushInBackground(id);
  }, delay);
  timer?.unref?.();
  flushTimers.set(id, timer);
}

/**
 * Regn ut hva brukeren har endret (mot versjonen state ble lastet fra) og legg det i køen.
 * State-objektet får den nye versjonen, så neste endring på samme skjerm bare sender det nye.
 */
function queueProjectChanges(companyId, state, slim) {
  const base = baseFor(companyId, state?.baseRev);
  const queued = enqueueProjectDiff(companyId, diffProjectStates(base, withoutBaseRev(slim)));
  const rev = rememberBase(companyId, slim);
  if (state && typeof state === 'object' && !Object.isFrozen(state)) state.baseRev = rev;
  return { queued, rev };
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
    // Bare endrede felt: en eldre kopi skal ikke nullstille faktura, status eller låsing.
    await saveTimeEntries(source, list, { previous: previousEntries });
  }
  const removable = planTimeEntryRemovals(previousEntries, nextEntries, window, { allowRemovals });
  if (removable.length) {
    const prevById = new Map((previousEntries || []).map((row) => [row?.id, row]));
    for (const entryId of removable) {
      const source = String(prevById.get(entryId)?.sourceCompanyId || id).trim() || id;
      await removeTimeEntry(source, entryId, { entry: prevById.get(entryId) || null, log: true });
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
      return adoptBase(companyId, local);
    }
    const [remote, waiting] = await Promise.all([
      readRemote(companyId),
      pendingProjectChanges(companyId),
    ]);
    const applied = applyRemoteProjectRead(local, remote);
    loadMeta.set(key, applied.meta);
    if (!applied.cache) {
      // Skyen svarer ikke: den lokale kopien er reserve. Den har også endringene i køen.
      return adoptBase(companyId, await loadStateWithHealedHours(companyId, applied.state, hoursOpts));
    }
    let state = applied.state;
    if (applied.upload) {
      enqueueProjectDiff(companyId, diffProjectStates(null, withoutBaseRev(stripTimeEntriesFromState(state))));
    } else if (waiting.length) {
      // Endringer som ikke nådde skyen sist, vises med en gang og sendes nå.
      state = normalizeProjectState(waiting.reduce((current, diff) => applyProjectDiff(current, diff), state));
    }
    let flush = applied.upload || waiting.length > 0;
    if ((applied.state.timeEntries || []).length && (hoursOpts.all || hoursOpts.fromDate)) {
      // Gamle timer i hoveddokumentet er flyttet til egen samling. Skrivingen fjerner dem der.
      flush = enqueueProjectDiff(companyId, { lists: {}, fields: { timeEntries: [] }, deletedRows: [], strict: false }) || flush;
    }
    if (flush) scheduleFlush(companyId, 0);
    const stored = await loadStateWithHealedHours(companyId, state, hoursOpts);
    return adoptBase(companyId, stored);
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
  const nextSlim = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  // Bare endringene mot versjonen skjermen lastet, går til skyen. Det regnes ut før
  // nettverkskallene under, så en ny lagring fra samme skjerm regnes mot denne versjonen.
  const { rev } = queueProjectChanges(companyId, state, nextSlim);
  const allowRemovals = allowTimeEntryRemovals(peekHoursMode(companyId), HOURS_WINDOW.get(memoryKey(companyId)) || null);
  const allowAbsenceRemovals = ABSENCE_MODE.get(memoryKey(companyId)) === 'all';

  if (companyId) {
    try {
      await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
      await syncAbsencesRemote(companyId, previousAbsences, full.absences || [], {
        allowRemovals: allowAbsenceRemovals,
      });
    } catch (error) {
      scheduleFlush(companyId);
      putProjectState({
        ...nextSlim,
        timeEntries: full.timeEntries || [],
        absences: full.absences || [],
        baseRev: rev,
      }, companyId);
      throw error;
    }
  }

  await writeLocal(companyId, nextSlim);
  scheduleFlush(companyId);
  return putProjectState({
    ...nextSlim,
    timeEntries: full.timeEntries || [],
    absences: full.absences || [],
    baseRev: rev,
  }, companyId);
}

/** Lagrer med en gang og venter på Firestore (prosjekt + timeEntries + absences). */
export async function persistProjectState(state, companyId) {
  const full = normalizeProjectState(state);
  const previousEntries = baselineTimeEntries(companyId);
  const previousAbsences = baselineAbsences(companyId);
  const nextSlim = {
    ...stripTimeEntriesFromState(full),
    syncedAt: new Date().toISOString(),
  };
  const { rev } = queueProjectChanges(companyId, state, nextSlim);
  const allowRemovals = allowTimeEntryRemovals(peekHoursMode(companyId), HOURS_WINDOW.get(memoryKey(companyId)) || null);
  const allowAbsenceRemovals = ABSENCE_MODE.get(memoryKey(companyId)) === 'all';
  const id = String(companyId || '').trim();

  if (id) {
    try {
      await syncTimeEntriesRemote(companyId, previousEntries, full.timeEntries || [], { allowRemovals });
      await syncAbsencesRemote(companyId, previousAbsences, full.absences || [], {
        allowRemovals: allowAbsenceRemovals,
      });
    } catch (error) {
      scheduleFlush(id);
      throw error;
    }
  }

  await writeLocal(companyId, nextSlim);
  if (id) {
    const remote = await flushProjectChanges(id);
    if (!remote.ok) {
      scheduleRetry(id);
      const message = remote.error?.message || remote.error?.code || 'Kunne ikke synke prosjekt til skyen.';
      if (remote.error?.code === 'project-doc-too-large') throw new Error(String(message));
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
    baseRev: rev,
  }, companyId);
}

/**
 * Oppdater utlegg/kjøring/varer på prosjektstate uten å synke hele timehistorikken.
 * mutate(state) får skyens ferske kopi og returnerer felt som skal skrives, eller null
 * når ingenting endres. Det skjer i en transaksjon, så mutate kan kjøres mer enn én gang.
 */
export async function patchProjectOperations(companyId, mutate) {
  const id = String(companyId || '').trim();
  if (!id || typeof mutate !== 'function') return { ok: false };
  let patch = null;
  // Bare katalogendringer skriver ikke hoveddokumentet. Et fullt hoveddokument stopper dem ikke.
  const result = await commitRemote(id, (fresh) => {
    patch = mutate(fresh);
    if (!patch || typeof patch !== 'object') return [];
    return [diffProjectStates(fresh, { ...fresh, ...patch })];
  }, { mainForCatalog: false });
  if (!result.ok) {
    const error = result.error || new Error('Fikk ikke lagret prosjektdata i skyen.');
    return { ok: false, error };
  }
  if (!patch || typeof patch !== 'object') return { ok: true, changed: false };
  const key = memoryKey(id);
  if (MEMORY.has(key) && result.state) {
    // Listene er regnet ut fra skyens ferske kopi. Minnet får dem som ny versjon.
    const fresh = {};
    for (const name of Object.keys(patch)) {
      if (result.state[name] !== undefined) fresh[name] = result.state[name];
    }
    adoptBase(id, { ...MEMORY.get(key), ...fresh });
  }
  return { ok: true, changed: true };
}

function clearSyncState(id) {
  for (const timers of [flushTimers, retryTimers]) {
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }
  OUTBOX.delete(id);
  outboxLoaded.delete(id);
  flushChains.delete(id);
  retryCounts.delete(id);
  failureShown.delete(id);
}

/** Test/hjelper: tøm minne mellom tester. Køen på disken blir liggende. */
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
    BASES.delete(key);
    DOC_SIZE.delete(key);
    clearSyncState(String(companyId || '').trim());
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
  BASES.clear();
  DOC_SIZE.clear();
  for (const id of new Set([...flushTimers.keys(), ...retryTimers.keys(), ...OUTBOX.keys(), ...outboxLoaded.keys()])) {
    clearSyncState(id);
  }
  hoursInflight.clear();
  absencesInflight.clear();
  clearDeletedTimeEntries();
}
