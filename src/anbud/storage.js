import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp, runTransaction } from 'firebase/firestore';
import { db } from '../../firebase';
import { anbudHitsKey, anbudLocalKey, RETIRED_ANBUD_KEYS, saveWhereItFits, storeAnbudPayload, storeHitsPayload } from './localStore.js';
import { pickCustomerList, resolveCustomerLoad } from './customerRegistry.js';
import { nextCustomerNumber, normalizeCustomers } from './customers.js';
import { emptyAnbudState, fitAnbudForCloud, mergeAnbudStates, normalizeAnbudState } from './model.js';
import { hitsSignature, mergeHitPacks, packHits, readHitPack, withHits } from './hitStore.js';
import { aliasSourceIds } from '../project/companyAlias.js';
import { dropRetiredLocalKeys } from '../utils/retiredLocalKeys.js';
import { showSaveError } from '../ui/saveToast.js';

const CUSTOMER_KEY = 'protop.customers.v2';
const REMOTE_AUTH_MS = 8000;
const HITS_DELAY_MS = 800;
const remoteTimers = new Map();
const remotePending = new Map();
const hitTimers = new Map();
const hitPending = new Map();
/** Signaturen til trefflisten som sist ble lagret i skyen. Uendret liste skrives ikke på nytt. */
const hitSaved = new Map();
/** 'ok' når trefflisten finnes i skyen, 'missing' når skyen svarte uten den, 'error' når lesingen feilet. */
const hitMeta = new Map();
/** Modulminne — unngår ny Firestore/AsyncStorage-runde ved hvert skjermbesøk. */
const MEMORY = new Map();
const inflight = new Map();
/** 'ok' når skyen svarte, 'local' når bare nettleseren har data, 'error' når lesingen feilet. */
const loadMeta = new Map();
/**
 * Kundene slik de sist ble lest fra eller skrevet til registeret (id → JSON).
 * Lagring sender bare kunder som er endret siden, så en eldre liste ikke overskriver andres endringer.
 */
const REGISTRY_BASE = new Map();

function memoryKey(companyId) {
  return String(companyId || '').trim() || '_';
}

export function peekAnbudState(companyId) {
  return MEMORY.get(memoryKey(companyId)) || null;
}

/** Selskapets egen kopi i minnet eller nettleseren, uten å vente på skyen. Til å vise forrige treff med en gang. */
export async function readCachedAnbudState(companyId) {
  const memory = peekAnbudState(companyId);
  if (memory) return memory;
  const [local, hits] = await Promise.all([readLocal(companyId), readLocalHits(companyId)]);
  return withHits(local, hits);
}

/**
 * Om trefflisten er lagret for seg i skyen. 'missing' betyr at den aldri er det,
 * så treff som falt ut av hoveddokumentet før må hentes inn igjen med et fullt søk.
 */
export function anbudHitsStatus(companyId) {
  return hitMeta.get(memoryKey(companyId)) || '';
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

function hitsDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'anbud', 'hits');
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

async function readLocalHits(companyId) {
  try {
    const raw = await AsyncStorage.getItem(anbudHitsKey(companyId));
    return readHitPack(raw ? JSON.parse(raw) : null);
  } catch {
    return readHitPack(null);
  }
}

async function readRemoteHits(companyId) {
  const ref = hitsDoc(companyId);
  const none = readHitPack(null);
  if (!ref) return { ok: false, exists: false, pack: none };
  try {
    const authed = await ensureRemoteAuth();
    if (!authed) return { ok: false, exists: false, pack: none };
    const snap = await getDoc(ref);
    if (!snap.exists()) return { ok: true, exists: false, pack: none };
    return { ok: true, exists: true, pack: readHitPack(snap.data()) };
  } catch {
    return { ok: false, exists: false, pack: none };
  }
}

async function writeRemoteHits(companyId, pack) {
  const ref = hitsDoc(companyId);
  if (!ref) return;
  // En annen fane eller enhet kan ha lagret treff i mellomtiden. Listene slås sammen.
  const bodyOf = (remote) => ({
    ...JSON.parse(JSON.stringify(mergeHitPacks(remote, pack))),
    updatedAt: serverTimestamp(),
  });
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      transaction.set(ref, bodyOf(snap.exists() ? snap.data() : null));
    });
  } catch {
    const snap = await getDoc(ref);
    await setDoc(ref, bodyOf(snap.exists() ? snap.data() : null));
  }
}

async function flushHits(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return;
  const timer = hitTimers.get(id);
  if (timer) clearTimeout(timer);
  hitTimers.delete(id);
  const job = hitPending.get(id);
  hitPending.delete(id);
  if (!job) return;
  await writeRemoteHits(id, job.pack);
  hitSaved.set(id, job.signature);
  hitMeta.set(memoryKey(id), 'ok');
}

/** Lagrer trefflisten for seg: nettleseren med en gang, skyen litt etter, og bare når listen er endret. */
function queueHits(companyId, state) {
  const id = String(companyId || '').trim();
  if (!id) return;
  let pack;
  let signature;
  try {
    pack = packHits(state);
    signature = hitsSignature(pack);
  } catch {
    // Trefflisten skal aldri stoppe lagringen av resten av anbudet.
    return;
  }
  if (!pack.notices.length) return;
  if (hitSaved.get(id) === signature || hitPending.get(id)?.signature === signature) return;
  storeHitsPayload(AsyncStorage, companyId, pack).catch(() => {});
  hitPending.set(id, { pack, signature });
  const prev = hitTimers.get(id);
  if (prev) clearTimeout(prev);
  hitTimers.set(id, setTimeout(() => {
    hitTimers.delete(id);
    flushHits(id).catch(() => {});
  }, HITS_DELAY_MS));
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

function rememberRegistry(companyId, customers) {
  REGISTRY_BASE.set(memoryKey(companyId), new Map(
    normalizeCustomers(customers).map((row) => [row.id, JSON.stringify(row)]),
  ));
}

/** Kundene som er nye eller endret siden registeret sist ble lest eller skrevet. */
export function changedCustomerRows(base, customers) {
  const list = normalizeCustomers(customers);
  if (!base) return list;
  return list.filter((row) => base.get(row.id) !== JSON.stringify(row));
}

/**
 * Legg endrede kunder på registeret slik det ligger i skyen. Nyeste updatedAt vinner per kunde.
 * Har en ny kunde fått et kundenummer en annen kunde allerede har (to lagret samtidig),
 * får den neste ledige nummer.
 */
export function mergeCustomerChanges(remote, changed) {
  const current = normalizeCustomers(remote);
  const incoming = normalizeCustomers(changed);
  const merged = mergeAnbudStates({ customers: current }, { customers: incoming }).customers;
  const changedIds = new Set(incoming.map((row) => row.id));
  const taken = new Map();
  for (const row of merged) {
    if (changedIds.has(row.id) || !row.customerNumber) continue;
    taken.set(row.customerNumber, row.id);
  }
  let next = Number(nextCustomerNumber(merged)) || 1;
  return merged.map((row) => {
    if (!changedIds.has(row.id) || !row.customerNumber) return row;
    const owner = taken.get(row.customerNumber);
    if (!owner || owner === row.id) {
      taken.set(row.customerNumber, row.id);
      return row;
    }
    const customerNumber = String(next);
    next += 1;
    taken.set(customerNumber, row.id);
    return { ...row, customerNumber };
  });
}

/** Skriver bare de endrede kundene, i en transaksjon mot registeret i skyen. Gir hele listen etterpå. */
async function writeCustomerRegistry(companyId, customers) {
  const ref = customerDoc(companyId);
  const list = normalizeCustomers(customers);
  if (!ref || !list.length) return null;
  const changed = changedCustomerRows(REGISTRY_BASE.get(memoryKey(companyId)), list);
  if (!changed.length) return null;
  const authed = await ensureRemoteAuth();
  if (!authed) return null;
  let stored = list;
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const remote = snap.exists() ? normalizeCustomers(snap.data()?.customers) : [];
    stored = mergeCustomerChanges(remote, changed);
    transaction.set(ref, {
      customers: JSON.parse(JSON.stringify(stored)),
      updatedAt: serverTimestamp(),
    });
  });
  rememberRegistry(companyId, stored);
  await writeCustomerCache(companyId, stored);
  return stored;
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
  if (registry.ok) rememberRegistry(companyId, registry.customers);
  loadMeta.set(memoryKey(companyId), picked.status);
  if (picked.customers.length) writeCustomerCache(companyId, picked.customers).catch(() => {});
  if (picked.refreshRegistry) writeCustomerRegistry(companyId, picked.customers).catch(() => {});
  return picked;
}

/**
 * Kunderegisteret i sanntid (anbud/customers). Lokal kopi først, så registeret ved hver
 * endring, også endringer andre brukere gjør. Mangler registeret (eldre selskap), leses
 * kundene én gang fra anbud/state, som da også oppretter registeret.
 * onData(customers, { source: 'local' | 'remote' }).
 */
export function watchCustomerList(companyId, onData, onError) {
  const ref = customerDoc(companyId);
  if (!ref) {
    onData([], { source: 'local' });
    return () => {};
  }
  let stop = false;
  let remoteSeen = false;
  let unsub = null;
  readCustomerCache(companyId).then((rows) => {
    if (!stop && !remoteSeen) onData(rows, { source: 'local' });
  }).catch(() => {});
  (async () => {
    const authed = await ensureRemoteAuth();
    if (stop) return;
    if (!authed) {
      onError?.(new Error('auth-timeout'));
      return;
    }
    const { onSnapshot } = await import('firebase/firestore');
    if (stop) return;
    unsub = onSnapshot(ref, (snap) => {
      if (stop) return;
      if (!snap.exists()) {
        loadAnbudState(companyId).then((state) => {
          if (stop || remoteSeen) return;
          onData(normalizeCustomers(state?.customers), { source: anbudLoadMeta(companyId) === 'ok' ? 'remote' : 'local' });
        }).catch((error) => { if (!stop) onError?.(error); });
        return;
      }
      remoteSeen = true;
      const customers = normalizeCustomers(snap.data()?.customers);
      if (customers.length) writeCustomerCache(companyId, customers).catch(() => {});
      onData(customers, { source: 'remote' });
    }, (error) => {
      if (!stop) onError?.(error);
    });
  })().catch((error) => {
    if (!stop) onError?.(error);
  });
  return () => {
    stop = true;
    unsub?.();
  };
}

/** Lagrer kundene uten å lese eller skrive resten av anbudsdokumentet. Gir listen slik den ble lagret. */
export async function saveCustomers(companyId, customers) {
  const list = normalizeCustomers(customers);
  if (!companyId || !list.length) return list;
  await writeCustomerCache(companyId, list);
  const stored = await writeCustomerRegistry(companyId, list).catch(() => null);
  const saved = stored || list;
  const current = MEMORY.get(memoryKey(companyId));
  if (current) putAnbudMemory(companyId, { ...current, customers: saved });
  return saved;
}

/** Til skyen: tekst brukeren har skrevet, forkortes aldri. For stort dokument stopper lagringen. */
function plainState(state) {
  return JSON.parse(JSON.stringify(fitAnbudForCloud(state)));
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
  } catch (error) {
    if (error?.code === 'anbud-too-large') throw error;
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
    // Lagringen i skyen skjer etter at skjermen har sagt «lagret». En feil skal likevel vises.
    if (pending) {
      writeRemote(id, pending).catch((error) => {
        showSaveError(error?.code === 'anbud-too-large'
          ? error.message
          : 'Anbud og avtaler er lagret på denne enheten, men ikke i skyen. Prøv igjen når du har nett.');
      });
    }
  }, 400));
}

function customerKey(rows) {
  return JSON.stringify([...(rows || [])].sort((a, b) => String(a?.id || '').localeCompare(String(b?.id || ''))));
}

async function mergedForSave(state, companyId) {
  const [local, registry] = await Promise.all([
    readLocal(companyId),
    companyId ? readCustomerRegistry(companyId) : { ok: false, customers: [] },
  ]);
  let next = mergeAnbudStates(local, state);
  if (registry.ok) next = mergeAnbudStates(next, { customers: registry.customers });
  next = mergeAnbudStates(next, { customers: state?.customers || [] });
  // Registeret skrives bare når kundelisten faktisk er endret. Ellers ble det en ekstra skyrunde per lagring.
  const registryStale = registry.ok && customerKey(registry.customers) !== customerKey(next.customers);
  return { next, registryOk: registry.ok, registryStale };
}

export async function loadAnbudState(companyId, { force = false } = {}) {
  const key = memoryKey(companyId);
  if (!force && MEMORY.has(key)) return MEMORY.get(key);
  if (!force && inflight.has(key)) return inflight.get(key);
  const pending = (async () => {
    const [local, localHits, remote, registry, remoteHits] = await Promise.all([
      readLocal(companyId),
      readLocalHits(companyId),
      readRemote(companyId),
      readCustomerRegistry(companyId),
      readRemoteHits(companyId),
    ]);
    hitMeta.set(key, remoteHits.ok ? (remoteHits.exists ? 'ok' : 'missing') : 'error');
    const hits = remoteHits.exists ? mergeHitPacks(localHits, remoteHits.pack) : localHits;
    if (remoteHits.exists) storeHitsPayload(AsyncStorage, companyId, hits).catch(() => {});
    const resolved = resolveCustomerLoad({
      local,
      remote: remote.state,
      registryCustomers: registry.customers,
      remoteOk: remote.ok,
      registryOk: registry.ok,
    });
    loadMeta.set(key, resolved.status);
    if (registry.ok) rememberRegistry(companyId, registry.customers);
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
    // Trefflisten for seg har treffene hoveddokumentet ikke hadde plass til.
    if (resolved.status === 'error') return withHits(resolved.state, localHits);
    let state = withHits(resolved.state, hits);
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
  await Promise.all([
    state ? writeRemote(id, state) : null,
    // Trefflisten kan hentes inn igjen med et søk. Den skal ikke stoppe lagringen av resten.
    flushHits(id).catch(() => {}),
  ]);
}

/** Registeret er fasit: andres nye kunder og rettede kundenummer følger med videre. */
function withStoredCustomers(next, stored) {
  return stored ? mergeAnbudStates(next, { customers: stored }) : next;
}

export async function saveAnbudState(state, companyId) {
  const merged = await mergedForSave(state, companyId);
  let { next } = merged;
  if (companyId && merged.registryStale) {
    next = withStoredCustomers(next, await writeCustomerRegistry(companyId, next.customers).catch(() => null));
  }
  if (next.customers.length) writeCustomerCache(companyId, next.customers).catch(() => {});
  queueHits(companyId, next);
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
  const merged = await mergedForSave(state, companyId);
  let { next } = merged;
  const id = String(companyId || '').trim();
  if (id && merged.registryStale) next = withStoredCustomers(next, await writeCustomerRegistry(id, next.customers));
  if (next.customers.length) writeCustomerCache(companyId, next.customers).catch(() => {});
  queueHits(companyId, next);
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
