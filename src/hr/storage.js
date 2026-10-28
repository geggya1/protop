/**
 * HR-tilstand: families/{companyId}/hr/state + lokal cache.
 * Venter på Auth før sky-lesing/skriving, slik at permission-denied
 * under boot ikke tømmer skydata med en tom lokal kopi.
 *
 * Bare de med HR-tilgang kan lese hr/state (firestore.rules). Den ansatte leser sitt eget
 * utsnitt i hrSelf/{ansatt-id}, som HR skriver når HR lagres (selfService.js).
 * Den lokale kopien inneholder ikke lønn, og fjernes når skyen sier nei.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import {
  isFirestorePermissionError,
  waitForFirestoreAccess,
} from '../utils/firestoreAccess.js';
import {
  emptyHrState,
  employeeVisibleSlice,
  hrStateHasData,
  normalizeHrState,
} from './model.js';
import {
  hrSelfDocs, hrSelfSlice, hrStateForDevice, planHrSelf, withCloudPay,
} from './selfService.js';

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

function selfDoc(companyId, employeeId) {
  const id = String(companyId || '').trim();
  const emp = String(employeeId || '').trim();
  if (!id || !emp) return null;
  return doc(db, 'families', id, 'hrSelf', emp);
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
    await AsyncStorage.setItem(localKey(companyId), JSON.stringify(hrStateForDevice(state)));
  } catch {
    /* ignore */
  }
}

async function dropLocal(companyId) {
  try {
    await AsyncStorage.removeItem(localKey(companyId));
  } catch {
    /* ignore */
  }
}

const BATCH_SIZE = 400;
// Utsnittene er sjekket mot HR-dokumentet i denne økten (per selskap).
const selfChecked = new Set();

async function writeHrSelf(companyId, rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => row?.employeeId);
  if (!list.length) return 0;
  const stamp = new Date().toISOString();
  for (let i = 0; i < list.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const row of list.slice(i, i + BATCH_SIZE)) {
      batch.set(selfDoc(companyId, row.employeeId), { ...row, updatedAt: stamp });
    }
    await batch.commit();
  }
  return list.length;
}

/**
 * Første gang HR leses i økten: skriv utsnittene som mangler eller er utdatert, også for
 * HR som fantes før utsnittene. Uten skrivetilgang til HR skjer ingenting.
 */
async function ensureHrSelf(companyId, state) {
  const key = memoryKey(companyId);
  if (selfChecked.has(key) || !hrStateHasData(state)) return;
  selfChecked.add(key);
  try {
    const snap = await getDocs(collection(db, 'families', String(companyId).trim(), 'hrSelf'));
    const existing = {};
    snap.docs.forEach((row) => { existing[row.id] = row.data() || {}; });
    await writeHrSelf(companyId, planHrSelf({ state, existing }));
  } catch {
    // Lese- eller skrivetilgang mangler: utsnittene skrives av den som har HR-tilgang.
  }
}

/** Etter lagring: bare utsnittene denne lagringen endrer. */
async function updateHrSelf(companyId, previous, next) {
  try {
    await writeHrSelf(companyId, planHrSelf({ state: next, existing: hrSelfDocs(previous) }));
  } catch (err) {
    console.warn('[hr] Min side-utsnitt ble ikke oppdatert', err?.message || err);
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
  const prevMeta = loadMeta.get(key) || '';
  // Etter feilet lasting: ikke sticky MEMORY — forsøk sky på nytt.
  if (MEMORY.has(key) && prevMeta !== 'error') return MEMORY.get(key);
  if (inflight.has(key)) return inflight.get(key);

  const job = (async () => {
    const local = await readLocal(companyId);
    // Vis lokal cache med en gang, men ikke marker ok før skyen svarer.
    putMemory(companyId, local);
    const remote = await readRemote(companyId);
    if (!remote.ok && remote.reason === 'permission') {
      // Uten HR-tilgang: ingen kopi av andres HR-data på enheten (også fra før reglene).
      await dropLocal(companyId);
      const empty = emptyHrState();
      putMemory(companyId, empty);
      loadMeta.set(key, 'error');
      return empty;
    }
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
      const localHas = hrStateHasData(local);
      const remoteHas = hrStateHasData(remote.state);
      const localNewer = !!(local?.updatedAt && (
        !remote.state.updatedAt
        || String(local.updatedAt) > String(remote.state.updatedAt)
      ));
      // Behold lokal når skyen er tom eller eldre (offline-lagring som ikke nådde skyen).
      // Lønn ligger ikke på enheten, så den hentes fra skyen.
      if (localHas && (!remoteHas || localNewer)) {
        const kept = withCloudPay(local, remote.state);
        loadMeta.set(key, 'local');
        putMemory(companyId, kept);
        await writeLocal(companyId, kept);
        ensureHrSelf(companyId, remote.state).catch(() => {});
        return kept;
      }
      loadMeta.set(key, 'ok');
      putMemory(companyId, remote.state);
      await writeLocal(companyId, remote.state);
      ensureHrSelf(companyId, remote.state).catch(() => {});
      return remote.state;
    }
    // Auth/permission/nettverk: behold lokal — ikke late som om skyen var tom.
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

async function readSelf(companyId, employeeId) {
  const ref = selfDoc(companyId, employeeId);
  if (!ref) return { ok: false, slice: null };
  const authed = await ensureRemoteAuth();
  if (!authed) return { ok: false, slice: null };
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, slice: null };
    return { ok: true, slice: hrSelfSlice(snap.data(), employeeId) };
  } catch {
    return { ok: false, slice: null };
  }
}

/**
 * Min side: hent bare synlig snitt for én ansatt, fra utsnittet hrSelf/{ansatt-id}.
 * Hydrer ikke MEMORY/AsyncStorage med hele selskapets HR-dokument, og les det ikke
 * for vanlige ansatte. HR (som har lastet HR) regner ut snittet selv.
 */
export async function loadEmployeeHrSlice(companyId, employeeId) {
  const empId = String(employeeId || '').trim();
  if (!companyId || !empId) return employeeVisibleSlice(emptyHrState(), empId);

  const cached = peekHrState(companyId);
  if (cached && hrLoadMeta(companyId) === 'ok') return employeeVisibleSlice(cached, empId);

  const own = await readSelf(companyId, empId);
  if (own.ok && own.slice) return own.slice;

  // Utsnittet finnes ikke ennå: med HR-tilgang regnes det ut av HR-dokumentet.
  const remote = await readRemote(companyId);
  if (remote.ok && remote.state) {
    return employeeVisibleSlice(remote.state, empId);
  }
  return employeeVisibleSlice(emptyHrState(), empId);
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
  // Etter mislykket lasting: aldri remote-skriv (heller ikke delvis state).
  if (meta === 'error') {
    const err = new Error('HR-sky ikke klar — lagret bare lokalt');
    err.code = 'hr/skip-uncertain';
    throw err;
  }
  // Unngå å pushe en tom økt oppå skydata etter usikker lokal lasting.
  if (meta === 'local' && !hrStateHasData(next)) {
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
    updateHrSelf(companyId, cached || emptyHrState(), next).catch(() => {});
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
  selfChecked.clear();
}
