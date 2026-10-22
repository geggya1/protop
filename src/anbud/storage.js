import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { anbudLocalKey, RETIRED_ANBUD_KEYS, saveWhereItFits, storeAnbudPayload } from './localStore.js';
import { pickCustomerList, resolveCustomerLoad } from './customerRegistry.js';
import { normalizeCustomers } from './customers.js';
import { emptyAnbudState, fitAnbudState, mergeAnbudStates, normalizeAnbudState } from './model.js';
import { aliasSourceIds } from '../project/companyAlias.js';
import { dropRetiredLocalKeys } from '../utils/retiredLocalKeys.js';

const CUSTOMER_KEY = 'protop.customers.v2';
const REMOTE_AUTH_MS = 8000;
const remoteTimers = new Map();
const remotePending = new Map();
/** Modulminne — unngår ny Firestore/AsyncStorage-runde ved hvert skjermbesøk. */
const MEMORY = new Map();
const inflight = new Map();
/** 'ok' når skyen svarte, 'local' når bare nettleseren har data, 'error' når lesingen feilet. */
const loadMeta = new Map();

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

export function peekAnbudState(companyId) {
  return MEMORY.get(memoryKey(companyId)) || null;
}

function putAnbudMemory(companyId, state) {
  const next = normalizeAnbudState(state);
  MEMORY.set(memoryKey(companyId), next);
  return next;
}

function anbudDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'anbud', 'state');
}

function customerDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'anbud', 'customers');
}

export function anbudLoadMeta(companyId) {
  return loadMeta.get(memoryKey(companyId)) || '';
}

/**
 * Vent til Auth kan tilfredsstille reglene. getDoc før token er klar
 * gir permission-denied, som ellers ble tolket som et tomt kunderegister.
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

async function readLocal(companyId) {
  await dropRetiredLocalKeys(AsyncStorage, RETIRED_ANBUD_KEYS);
  try {
    // Bare selskapets egen kopi. Den gamle felles nøkkelen kan høre til et annet selskap.
    const raw = await AsyncStorage.getItem(anbudLocalKey(companyId));
    if (!raw) return emptyAnbudState();
    return normalizeAnbudState(JSON.parse(raw));
  } catch {
    return emptyAnbudState();
  }
}

async function readRemote(companyId) {
  const ref = anbudDoc(companyId);
  if (!ref) return { ok: true, state: emptyAnbudState() };
  try {
    const authed = await ensureRemoteAuth();
    if (!authed) return { ok: false, state: emptyAnbudState() };
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, state: emptyAnbudState() };
    return { ok: true, state: normalizeAnbudState(snap.data()?.state || snap.data() || {}) };
  } catch {
    return { ok: false, state: emptyAnbudState() };
  }
}

function customerCacheKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${CUSTOMER_KEY}.${id}` : CUSTOMER_KEY;
}

async function readCustomerCache(companyId) {
  await dropRetiredLocalKeys(AsyncStorage, RETIRED_ANBUD_KEYS);
  try {
    const raw = await AsyncStorage.getItem(customerCacheKey(companyId));
    if (!raw) return [];
    return normalizeCustomers(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function writeCustomerCache(companyId, customers) {
  const list = normalizeCustomers(customers);
  if (!list.length) return;
  try {
    await AsyncStorage.setItem(customerCacheKey(companyId), JSON.stringify(list));
  } catch {
    /* nettleseren kan være full — registeret i skyen er fasit */
  }
}

async function readCustomerRegistry(companyId) {
  const ref = customerDoc(companyId);
  if (!ref) return { ok: true, customers: [], missing: true };
  try {
    const authed = await ensureRemoteAuth();
    if (!authed) return { ok: false, customers: [] };
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, customers: [], missing: true };
    return { ok: true, customers: normalizeCustomers(snap.data()?.customers), missing: false };
  } catch {
    return { ok: false, customers: [] };
  }
}

async function writeCustomerRegistry(companyId, customers) {
  const ref = customerDoc(companyId);
  const list = normalizeCustomers(customers);
  if (!ref || !list.length) return;
  const authed = await ensureRemoteAuth();
  if (!authed) return;
  let stored = list;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const remote = snap.exists() ? normalizeCustomers(snap.data()?.customers) : [];
    stored = mergeAnbudStates({ customers: remote }, { customers: list }).customers;
    transaction.set(ref, {
      customers: JSON.parse(JSON.stringify(stored)),
      updatedAt: serverTimestamp(),
    });
  });
  await writeCustomerCache(companyId, stored);
}

/**
 * Kundelisten alene. Lokal kopi tegnes med en gang, deretter det lille skydokumentet.
 * Hele anbudsdokumentet leses ikke.
 */
export async function loadCustomerList(companyId, { onCache } = {}) {
  const cachePromise = readCustomerCache(companyId).then((rows) => {
    if (rows.length) onCache?.(rows);
    return rows;
  });
  const [cached, registry] = await Promise.all([
    cachePromise,
    readCustomerRegistry(companyId),
  ]);
  const picked = pickCustomerList({
    cached,
    registryCustomers: registry.customers,
    registryOk: registry.ok,
  });
  loadMeta.set(memoryKey(companyId), picked.status);
  if (picked.customers.length) writeCustomerCache(companyId, picked.customers).catch(() => {});
  if (picked.refreshRegistry) writeCustomerRegistry(companyId, picked.customers).catch(() => {});
  return picked;
}

/** Lagrer kundene uten å lese eller skrive resten av anbudsdokumentet. */
export async function saveCustomers(companyId, customers) {
  const list = normalizeCustomers(customers);
  if (!companyId || !list.length) return list;
  await writeCustomerCache(companyId, list);
  await writeCustomerRegistry(companyId, list).catch(() => {});
  const current = MEMORY.get(memoryKey(companyId));
  if (current) putAnbudMemory(companyId, { ...current, customers: list });
  return list;
}

function plainState(state) {
  return JSON.parse(JSON.stringify(fitAnbudState(state)));
}

async function writeLocal(companyId, state) {
  await storeAnbudPayload(AsyncStorage, companyId, state);
}

async function writeRemote(companyId, state) {
  const ref = anbudDoc(companyId);
  if (!ref) return;
  const payload = plainState(state);
  const bodyOf = (next) => ({
    state: next,
    digestEnabled: !!(next.watch?.notify?.email && (next.watch?.emails || []).length),
    updatedAt: serverTimestamp(),
  });
  const commitMerged = (remoteState) => {
    const merged = plainState(mergeAnbudStates(remoteState, payload));
    return bodyOf(merged);
  };
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      const remote = snap.exists() ? (snap.data()?.state || {}) : {};
      // Hele dokumentet byttes ut, slik at tidligere filinnhold ikke blir liggende i dokumentet.
      transaction.set(ref, commitMerged(remote));
    });
  } catch {
    // Ikke skriv klientkopien alene: en feilet lesing har tom kundeliste og ville slettet registeret.
    const snap = await getDoc(ref);
    const remote = snap.exists() ? (snap.data()?.state || {}) : {};
    await setDoc(ref, commitMerged(remote));
  }
}

function clearRemoteQueue(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const prev = remoteTimers.get(id);
  if (prev) clearTimeout(prev);
  remoteTimers.delete(id);
  remotePending.delete(id);
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

async function mergedForSave(state, companyId) {
  const local = await readLocal(companyId);
  const registry = companyId ? await readCustomerRegistry(companyId) : { ok: false, customers: [] };
  let next = mergeAnbudStates(local, state);
  if (registry.ok) next = mergeAnbudStates(next, { customers: registry.customers });
  next = mergeAnbudStates(next, { customers: state?.customers || [] });
  return { next, registryOk: registry.ok };
}

export async function loadAnbudState(companyId, { force = false } = {}) {
  const key = memoryKey(companyId);
  if (!force && MEMORY.has(key)) return MEMORY.get(key);
  if (!force && inflight.has(key)) return inflight.get(key);
  const pending = (async () => {
    const local = await readLocal(companyId);
    const [remote, registry] = await Promise.all([
      readRemote(companyId),
      readCustomerRegistry(companyId),
    ]);
    const resolved = resolveCustomerLoad({
      local,
      remote: remote.state,
      registryCustomers: registry.customers,
      remoteOk: remote.ok,
      registryOk: registry.ok,
    });
    loadMeta.set(key, resolved.status);
    if (resolved.state.customers.length) {
      writeCustomerCache(companyId, resolved.state.customers).catch(() => {});
    }
    if (
      companyId
      && registry.ok
      && (registry.missing || registry.customers.length < resolved.state.customers.length)
      && resolved.state.customers.length
    ) {
      writeCustomerRegistry(companyId, resolved.state.customers).catch(() => {});
    }
    if (resolved.status === 'error') return resolved.state;
    let state = resolved.state;
    for (const aliasId of aliasSourceIds(companyId)) {
      try {
        const extra = await readRemote(aliasId);
        if (extra?.ok && extra.state?.notices?.length) {
          state = mergeAnbudStates(state, { notices: extra.state.notices });
        }
      } catch {
        // Alias som ikke kan leses skal ikke tømme hovedlisten.
      }
    }
    return putAnbudMemory(companyId, state);
  })();
  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function flushAnbudState(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const timer = remoteTimers.get(id);
  if (timer) clearTimeout(timer);
  remoteTimers.delete(id);
  const pending = remotePending.get(id);
  remotePending.delete(id);
  const state = pending || MEMORY.get(memoryKey(companyId));
  if (state) await writeRemote(id, state);
}

export async function saveAnbudState(state, companyId) {
  const { next, registryOk } = await mergedForSave(state, companyId);
  if (next.customers.length) writeCustomerCache(companyId, next.customers).catch(() => {});
  if (companyId && registryOk) await writeCustomerRegistry(companyId, next.customers).catch(() => {});
  const where = await saveWhereItFits({
    companyId,
    writeLocal: () => writeLocal(companyId, next),
    writeRemote: async () => {
      clearRemoteQueue(companyId);
      await writeRemote(companyId, next);
    },
  });
  if (where === 'local') queueRemote(companyId, next);
  return putAnbudMemory(companyId, next);
}

/** Lagrer med en gang og venter på Firestore, slik at «Lagre» ikke later som det gikk bra. */
export async function persistAnbudState(state, companyId) {
  const { next, registryOk } = await mergedForSave(state, companyId);
  const id = String(companyId || '').trim();
  if (next.customers.length) writeCustomerCache(companyId, next.customers).catch(() => {});
  if (id && registryOk) await writeCustomerRegistry(id, next.customers);
  clearRemoteQueue(id);
  let localError = null;
  try {
    await writeLocal(companyId, next);
  } catch (err) {
    localError = err;
  }
  try {
    if (id) await writeRemote(id, next);
    else if (localError) throw localError;
  } catch (err) {
    putAnbudMemory(companyId, next);
    throw localError || err;
  }
  return putAnbudMemory(companyId, next);
}
