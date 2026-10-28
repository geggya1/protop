/**
 * HR-tilstand: families/{companyId}/hr/state + lokal cache.
 * Venter på Auth før sky-lesing/skriving, slik at permission-denied
 * under boot ikke tømmer skydata med en tom lokal kopi.
 *
 * Bare de med HR-tilgang kan lese hr/state (firestore.rules). Den ansatte leser sitt eget
 * utsnitt i hrSelf/{ansatt-id}, som HR skriver når HR lagres (selfService.js).
 * Reglene leser HR-tilgangen fra tilgangsspeilet (accessAcl), så lesingen venter på speilet.
 * Den lokale kopien inneholder ikke lønn, og fjernes når skyen sier nei.
 *
 * Endringer som ikke har nådd skyen, ligger i tillegg i en egen kø (protop.hrPending.v1.{id})
 * med hvem som gjorde dem. Køen slettes aldri fordi en lesing ble avvist eller brukeren logget ut;
 * den sendes neste gang samme bruker laster HR, og vises aldri for en annen bruker.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, getDocs, setDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
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
/** Lokale HR-endringer som ikke har nådd skyen: { uid, at, state } per selskap. */
const PENDING_KEY = 'protop.hrPending.v1';
const PENDING_MAX_DAYS = 30;
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

function pendingKey(companyId) {
  return `${PENDING_KEY}.${memoryKey(companyId)}`;
}

function currentUid() {
  return auth?.currentUser?.uid || '';
}

/** Ulagrede HR-endringer på enheten: { uid, at, state }, eller null. */
export async function readHrPending(companyId) {
  try {
    const raw = await AsyncStorage.getItem(pendingKey(companyId));
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.uid || !parsed?.state) return null;
    if ((Date.parse(parsed.at || '') || 0) < Date.now() - PENDING_MAX_DAYS * 86400000) return null;
    return { ...parsed, state: normalizeHrState(parsed.state) };
  } catch {
    return null;
  }
}

async function writePending(companyId, state) {
  const uid = currentUid();
  if (!uid) return;
  try {
    await AsyncStorage.setItem(pendingKey(companyId), JSON.stringify({
      uid, at: new Date().toISOString(), state: hrStateForDevice(state),
    }));
  } catch {
    /* ignore */
  }
}

async function clearPending(companyId) {
  try {
    await AsyncStorage.removeItem(pendingKey(companyId));
  } catch {
    /* ignore */
  }
}

/** Selskaper der den innloggede har HR-endringer som ikke er i skyen. */
export async function pendingHrCompanies(uid = currentUid()) {
  if (!uid) return [];
  let keys = [];
  try {
    keys = await AsyncStorage.getAllKeys();
  } catch {
    return [];
  }
  const out = [];
  for (const key of keys || []) {
    if (!String(key).startsWith(`${PENDING_KEY}.`)) continue;
    const companyId = String(key).slice(PENDING_KEY.length + 1);
    const pending = await readHrPending(companyId);
    if (pending?.uid === uid) out.push(companyId);
  }
  return out;
}

/** HR leses etter at tilgangsspeilet er fornyet (høyst noen sekunder). force: lesingen ble avvist. */
async function awaitAccessMirror(companyId, { force = false } = {}) {
  const uid = currentUid();
  if (!uid) return false;
  try {
    const { ensureFreshAccessMirror } = await import('../access/accessMirror.js');
    return await ensureFreshAccessMirror(String(companyId || '').trim(), uid, { force });
  } catch {
    return false;
  }
}

// Selskaper der en avvist HR-lesing er prøvd igjen etter ny synk av speilet (én gang per økt).
const permissionRetried = new Set();

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
    let local = await readLocal(companyId);
    // Egne ulagrede endringer går foran den lokale kopien (som kan være ryddet ved utlogging).
    const pending = await readHrPending(companyId);
    const mine = pending?.uid === currentUid() ? pending : null;
    if (mine && !(local?.updatedAt && mine.state.updatedAt && String(local.updatedAt) > String(mine.state.updatedAt))) {
      local = mine.state;
    }
    // Vis lokal cache med en gang, men ikke marker ok før skyen svarer.
    putMemory(companyId, local);
    await awaitAccessMirror(companyId);
    let remote = await readRemote(companyId);
    if (!remote.ok && remote.reason === 'permission' && !permissionRetried.has(key)) {
      // Speilet kan ha gått ut eller ikke vært skrevet ennå: synk og prøv én gang til.
      permissionRetried.add(key);
      if (await awaitAccessMirror(companyId, { force: true })) remote = await readRemote(companyId);
    }
    if (!remote.ok && remote.reason === 'permission') {
      // Uten HR-tilgang: ingen kopi av andres HR-data på enheten (også fra før reglene).
      await dropLocal(companyId);
      loadMeta.set(key, 'error');
      // Køen med egne ulagrede endringer blir liggende og sendes når skyen tar imot igjen.
      if (mine && hrStateHasData(mine.state)) return local;
      const empty = emptyHrState();
      putMemory(companyId, empty);
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
        // Egne endringer som ikke nådde skyen sist (uten nett, avvist eller logget ut): send dem nå.
        if (mine) saveHrState(kept, companyId).catch(() => {});
        return kept;
      }
      // Skyen er nyere enn de ulagrede endringene: den gjelder.
      if (mine) await clearPending(companyId);
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
  // I køen til skyen har tatt imot (fjernes under).
  await writePending(companyId, next);

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
    await clearPending(companyId);
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
  permissionRetried.clear();
}
