/**
 * Lagring av ISO / K-HMS i Firestore.
 *
 *   families/{companyId}/isoSystem/main            omfang, standarder, risikometode
 *   families/{companyId}/isoFindings/{id}          avvik og tiltak
 *   families/{companyId}/isoFindingsRestricted/{id} skjermede HMS-/personsaker
 *   families/{companyId}/isoProcesses/{id} …       én dokumentsamling per entitetstype
 *   families/{companyId}/isoAudit/{eventId}        revisjonsspor (bare nye hendelser skrives)
 *   families/{companyId}/isoAuditRestricted/{id}   revisjonsspor for skjermede saker
 *   families/{companyId}/isoRestricted/main        hvem som har særskilt tilgang til skjermede saker
 *   families/{companyId}/accessAcl/{uid}           tilgangsmatrisen speilet for Firestore-reglene
 *   families/{companyId}/parentTodos/{key}         oppgaver i ProTop (deterministisk id → ingen duplikater)
 *
 * Hver lagring er en transaksjon med revisjonskontroll: er posten endret av en annen
 * siden den ble lest, avvises lagringen i stedet for å overskrive (optimistisk lås).
 * Selskapsisolasjon håndheves av Firestore-reglene (medlemskap i selskapet).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isFirestorePermissionError, waitForFirestoreAccess } from '../utils/firestoreAccess.js';
import { COLLECTIONS, collectionFor, emptyIsoState, stateFromCollections } from './state.js';
import { restrictedUids } from './access.js';
import { aclIsFresh, isCompanyOwner, planAclSync } from './aclSync.js';
import { chunkForBatch, numberFromCounter, numberParts } from './core.js';
import { withInvolved } from './findings.js';

const CACHE_KEY = 'protop.iso.v1';
const AUTH_MS = 8000;
const MEMORY = new Map();

function cid(companyId) {
  return String(companyId || '').trim();
}

/** Firestore godtar ikke undefined. */
function plain(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

async function ensureAuth() {
  const [{ onAuthStateChanged }, { auth }] = await Promise.all([
    import('firebase/auth'),
    import('../../firebase.js'),
  ]);
  if (auth.currentUser?.uid) return waitForFirestoreAccess(auth.currentUser.uid, AUTH_MS);
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { unsub(); } catch { /* ignore */ }
      resolve(!!ok);
    };
    const timer = setTimeout(() => finish(false), AUTH_MS);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user?.uid) waitForFirestoreAccess(user.uid, AUTH_MS).then(finish);
    });
  });
}

function col(companyId, name) {
  return collection(db, 'families', cid(companyId), name);
}

async function readAll(companyId, name) {
  const snap = await getDocs(col(companyId, name));
  return snap.docs.map((d) => ({ ...d.data(), id: d.id }));
}

/** Skjermede saker brukeren selv er involvert i (meldt, tildelt). */
async function readOwnRestricted(companyId, uid) {
  if (!uid) return [];
  const ref = col(companyId, COLLECTIONS.restrictedFindings);
  const [a, b] = await Promise.all([
    getDocs(query(ref, where('reportedByUid', '==', uid))),
    getDocs(query(ref, where('involvedUids', 'array-contains', uid))),
  ]);
  const map = new Map();
  for (const d of [...a.docs, ...b.docs]) map.set(d.id, { ...d.data(), id: d.id });
  return [...map.values()];
}

/** Lokal kopi er per bruker og selskap, så en annen innlogging på samme enhet ikke ser den. */
function cacheKey(companyId, uid) {
  return `${CACHE_KEY}.${cid(companyId)}.${String(uid || 'anon').slice(0, 128)}`;
}

function memoryKey(companyId, uid) {
  return `${cid(companyId)}:${String(uid || '')}`;
}

async function readCache(companyId, uid) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(companyId, uid));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Lokal cache inneholder aldri skjermede saker. */
async function writeCache(companyId, uid, parts) {
  try {
    const { restrictedFindings, restrictedGrants, ...open } = parts;
    await AsyncStorage.setItem(cacheKey(companyId, uid), JSON.stringify(open));
  } catch {
    /* full lagring er ikke kritisk */
  }
}

export function peekIsoState(companyId, uid = '') {
  return MEMORY.get(memoryKey(companyId, uid)) || null;
}

/**
 * Leser hele ISO-tilstanden for selskapet.
 * Returnerer { state, source: 'remote' | 'cache' | 'empty', error? }.
 */
/** Hvem som har særskilt tilgang til skjermede saker. Null hvis brukeren ikke får lese listen. */
export async function loadRestrictedGrants(companyId) {
  try {
    const snap = await getDoc(doc(db, 'families', cid(companyId), 'isoRestricted', 'main'));
    if (!snap.exists()) return { uids: [], people: [], readable: true };
    const data = snap.data() || {};
    return { uids: Array.isArray(data.uids) ? data.uids : [], people: Array.isArray(data.people) ? data.people : [], readable: true, rev: Number(data.rev) || 0 };
  } catch {
    return { uids: [], people: [], readable: false };
  }
}

/** Lagre listen over særskilt tilgang. Reglene tillater bare eier eller en på listen med ISO-admin. */
export async function saveRestrictedGrants(companyId, people, { actor } = {}) {
  const clean = (people || []).filter((p) => p?.uid).map((p) => ({ uid: String(p.uid), name: String(p.name || '').slice(0, 160) }));
  const ref = doc(db, 'families', cid(companyId), 'isoRestricted', 'main');
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const rev = snap.exists() ? Number(snap.data()?.rev) || 0 : 0;
    tx.set(ref, {
      uids: clean.map((p) => p.uid),
      people: clean,
      rev: rev + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: String(actor?.name || '').slice(0, 160),
      updatedByUid: String(actor?.uid || '').slice(0, 128),
    });
  });
  return clean;
}

/**
 * Sørger for at tilgangsmatrisen er speilet til serveren (accessAcl) før ISO leses.
 * 1) Gyldig dokument finnes → ferdig.  2) Cloud Function syncCompanyAccess.
 * 3) Eieren kan beregne og skrive selv (samme kode). Ellers ingen tilgang (fail-closed).
 * Returnerer { iso, fresh, via }.
 */
export async function ensureAccessMirror(companyId, uid, { family = null, employees = null, force = false } = {}) {
  const id = cid(companyId);
  if (!id || !uid) return { iso: 0, fresh: false, via: 'none' };
  const ref = doc(db, 'families', id, 'accessAcl', String(uid));
  if (!force) {
    try {
      const snap = await getDoc(ref);
      if (snap.exists() && aclIsFresh(snap.data())) return { iso: Number(snap.data()?.iso) || 0, fresh: true, via: 'cache' };
    } catch { /* prøv å synke */ }
  }
  try {
    const [{ httpsCallable }, { functions }] = await Promise.all([import('firebase/functions'), import('../../firebase.js')]);
    const call = httpsCallable(functions, 'syncCompanyAccess', { timeout: 20000 });
    const res = await call({ companyId: id });
    if (res?.data?.ok) return { iso: Number(res.data.iso) || 0, fresh: true, via: 'function' };
  } catch { /* faller tilbake under */ }
  if (family && employees && isCompanyOwner(family, uid)) {
    try {
      const existing = await getDocs(collection(db, 'families', id, 'accessAcl'));
      const plan = planAclSync({ family, employees, existingUids: existing.docs.map((d) => d.id) });
      const ops = [
        ...plan.write.map((row) => (b) => b.set(doc(db, 'families', id, 'accessAcl', row.uid), { ...row, source: 'owner' })),
        ...plan.remove.map((u) => (b) => b.delete(doc(db, 'families', id, 'accessAcl', u))),
      ];
      for (let i = 0; i < ops.length; i += 400) {
        const batch = writeBatch(db);
        ops.slice(i, i + 400).forEach((op) => op(batch));
        await batch.commit();
      }
      return { iso: 3, fresh: true, via: 'owner' };
    } catch { /* ingen tilgang */ }
  }
  return { iso: 0, fresh: false, via: 'none' };
}

/**
 * Leser hele ISO-tilstanden for selskapet.
 * Returnerer { state, source: 'remote' | 'cache' | 'empty', error? }.
 */
export async function loadIsoState(companyId, { uid = '' } = {}) {
  const id = cid(companyId);
  if (!id) return { state: emptyIsoState(), source: 'empty' };
  const authed = await ensureAuth();
  if (!authed) {
    const cached = await readCache(id, uid);
    return cached
      ? { state: stateFromCollections(cached), source: 'cache', error: 'Ikke innlogget mot skyen. Viser lokal kopi.' }
      : { state: emptyIsoState(), source: 'empty', error: 'Ikke innlogget mot skyen.' };
  }
  try {
    const names = Object.entries(COLLECTIONS).filter(([key]) => key !== 'restrictedFindings');
    const [systemSnap, grants, ...lists] = await Promise.all([
      getDoc(doc(db, 'families', id, 'isoSystem', 'main')),
      loadRestrictedGrants(id),
      ...names.map(([, name]) => readAll(id, name)),
    ]);
    const parts = { system: systemSnap.exists() ? systemSnap.data() : null, restrictedGrants: grants };
    names.forEach(([key], i) => { parts[key] = lists[i]; });
    // Særskilt tilgang: bare personer som står uttrykkelig på listen (håndheves også i reglene).
    const listed = !!uid && restrictedUids(grants).has(String(uid));
    parts.restrictedFindings = listed
      ? await readAll(id, COLLECTIONS.restrictedFindings)
      : await readOwnRestricted(id, uid).catch(() => []);
    const state = stateFromCollections(parts);
    MEMORY.set(memoryKey(id, uid), state);
    await writeCache(id, uid, parts);
    return { state, source: 'remote' };
  } catch (err) {
    const cached = await readCache(id, uid);
    const message = isFirestorePermissionError(err) ? 'Mangler tilgang til ISO-data i skyen.' : 'Kunne ikke hente ISO-data.';
    return cached
      ? { state: stateFromCollections(cached), source: 'cache', error: `${message} Viser lokal kopi.` }
      : { state: emptyIsoState(), source: 'empty', error: message };
  }
}

export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.code = 'iso/conflict';
  }
}

/** Bare oppsettet (isoSystem/main), slik det står lagret nå. Brukes når en lagring ble avvist fordi det er endret et annet sted. */
export async function loadIsoSystem(companyId) {
  const id = cid(companyId);
  if (!id) return null;
  const snap = await getDoc(doc(db, 'families', id, 'isoSystem', 'main'));
  return snap.exists() ? snap.data() : null;
}

/**
 * Ny sak: saksnummeret tildeles mot telleren i samme transaksjon som saken skrives
 * (som fakturanummer). Returnerer det som ble lagret, med endelig nummer.
 */
async function saveNumberedFinding(companyId, name, entity) {
  const counterRef = doc(db, 'families', companyId, 'isoCounters', numberParts(entity.number).series);
  const ref = doc(db, 'families', companyId, name, entity.id);
  return runTransaction(db, async (tx) => {
    const counter = await tx.get(counterRef);
    const snap = await tx.get(ref);
    if (snap.exists()) throw new ConflictError('Finnes allerede.');
    const next = numberFromCounter(entity.number, counter.exists() ? counter.data()?.last : 0);
    const stamp = new Date().toISOString();
    const data = plain({ ...withInvolved({ ...entity, number: next.number }), savedAt: stamp });
    tx.set(counterRef, { last: next.last, updatedAt: stamp });
    tx.set(ref, data);
    return data;
  });
}

/**
 * Lagrer én entitet med revisjonskontroll.
 * kind: findings | processes | instances | documents | forms | submissions | requirements | assessments | evidence | evidenceLinks | records | system
 */
export async function saveEntity(companyId, kind, entity, { previous = null, createOnly = false } = {}) {
  const id = cid(companyId);
  if (!id) throw new Error('Mangler selskap.');
  const authed = await ensureAuth();
  if (!authed) throw new Error('Ikke innlogget. Endringen er ikke lagret.');
  if (kind === 'findings' && !previous && numberParts(entity?.number)) {
    try {
      return await saveNumberedFinding(id, collectionFor(kind, entity), entity);
    } catch (err) {
      // Reglene uten telleren (ikke rullet ut ennå): lagre som før med nummeret klienten regnet ut.
      if (!isFirestorePermissionError(err)) throw err;
    }
  }
  const name = kind === 'system' ? 'isoSystem' : collectionFor(kind, entity);
  const ref = doc(db, 'families', id, name, kind === 'system' ? 'main' : entity.id);
  const data = plain({ ...(kind === 'findings' ? withInvolved(entity) : entity), savedAt: new Date().toISOString() });
  const moving = kind === 'findings' && previous && !!previous.restricted !== !!entity.restricted;
  if (moving) {
    // Flytting mellom åpen og skjermet samling skjer i én transaksjon: ny kopi skrives og
    // den gamle slettes samtidig, ellers ingenting. Ingen gammel åpen kopi kan bli liggende.
    const old = doc(db, 'families', id, collectionFor('findings', previous), entity.id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(old);
      if (snap.exists() && (Number(snap.data()?.rev) || 0) !== (Number(previous.rev) || 0)) {
        throw new ConflictError('Posten er endret av en annen bruker. Last inn på nytt og prøv igjen.');
      }
      tx.set(ref, data);
      tx.delete(old);
    });
    return data;
  }
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && createOnly) throw new ConflictError('Finnes allerede.');
    if (snap.exists()) {
      const remoteRev = Number(snap.data()?.rev) || 0;
      const expected = previous ? Number(previous.rev) || 0 : remoteRev;
      if (remoteRev !== expected) {
        throw new ConflictError('Posten er endret av en annen bruker. Last inn på nytt og prøv igjen.');
      }
    } else if (previous && Number(previous.rev) > 0) {
      throw new ConflictError('Posten finnes ikke lenger. Last inn på nytt.');
    }
    tx.set(ref, data);
  });
  return data;
}

/**
 * Lesebekreftelse: kvitteringen legges til listen slik den står lagret nå, uten revisjonslås og uten
 * å endre rev. Mange kan kvittere samtidig, og ingen får «endret av en annen bruker» fordi noen leste.
 * Returnerer listen slik den ble lagret.
 */
export async function appendReadAck(companyId, documentId, ack) {
  const id = cid(companyId);
  if (!id || !documentId || !ack?.uid) throw new Error('Mangler dokument eller bruker.');
  const authed = await ensureAuth();
  if (!authed) throw new Error('Ikke innlogget. Bekreftelsen er ikke lagret.');
  const ref = doc(db, 'families', id, 'isoDocuments', String(documentId));
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Fant ikke dokumentet.');
    const acks = Array.isArray(snap.data()?.readAcks) ? snap.data().readAcks : [];
    if (acks.some((a) => a?.uid === ack.uid && a?.revision === ack.revision)) return acks;
    const next = [...acks, plain(ack)];
    tx.update(ref, { readAcks: next });
    return next;
  });
}

/** Flere entiteter i én batch (f.eks. bevis + koblinger + vurderinger). Ingen revisjonslås. */
export async function saveMany(companyId, rows, { onProgress = null } = {}) {
  const id = cid(companyId);
  if (!id || !rows?.length) return;
  const authed = await ensureAuth();
  if (!authed) throw new Error('Ikke innlogget. Endringen er ikke lagret.');
  // Batcher etter antall og størrelse. Feiler en batch, står de foregående lagret:
  // err.committed sier hvor mange rader (i rekkefølge) som er i Firestore.
  let committed = 0;
  for (const chunk of chunkForBatch(rows, (r) => JSON.stringify(r.entity ?? null).length)) {
    const batch = writeBatch(db);
    for (const { kind, entity } of chunk) {
      const name = collectionFor(kind, entity);
      batch.set(doc(db, 'families', id, name, entity.id), plain(entity));
    }
    try {
      await batch.commit();
    } catch (err) {
      if (err && typeof err === 'object') err.committed = committed;
      throw err;
    }
    committed += chunk.length;
    // Fremdrift for store importer: hvor mange av radene som er lagret.
    onProgress?.(committed, rows.length);
  }
}

/** Hvem som er involvert i en sak – brukes av reglene. Ligger i findings.js (ren funksjon). */
export { withInvolved };

/** Revisjonsspor: bare nye dokumenter, med hendelsens egen id. Skjermede saker i egen samling. */
export async function appendAudit(companyId, events, { restricted = false } = {}) {
  const id = cid(companyId);
  if (!id || !events?.length) return;
  // Store importer gir mange og store hendelser: del i batcher, så én for stor batch ikke tar med seg resten.
  for (const chunk of chunkForBatch(events, (ev) => JSON.stringify(ev ?? null).length)) {
    try {
      const batch = writeBatch(db);
      for (const ev of chunk) batch.set(doc(db, 'families', id, restricted ? 'isoAuditRestricted' : 'isoAudit', ev.id), plain(ev));
      await batch.commit();
    } catch {
      /* sporet ligger også i objektets historikk */
    }
  }
}

export async function loadAuditFor(companyId, entityId, { restricted = false } = {}) {
  const id = cid(companyId);
  if (!id || !entityId) return [];
  try {
    const snap = await getDocs(query(col(id, restricted ? 'isoAuditRestricted' : 'isoAudit'), where('entityId', '==', entityId)));
    return snap.docs.map((d) => d.data()).sort((a, b) => String(b.at).localeCompare(String(a.at)));
  } catch {
    return [];
  }
}

/**
 * Oppretter oppgave i ProTops oppgavemodul. Deterministisk dokument-id gjør
 * operasjonen idempotent: gjentatt kall (retry, dobbeltklikk) gir én oppgave (A15/T27).
 */
export async function ensureTask(companyId, { key, title, description = '', assigneeUid = '', deadline = null, createdByUid = '', source = 'iso' }) {
  const id = cid(companyId);
  const docId = String(key || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140);
  if (!id || !docId || !title) return '';
  const ref = doc(db, 'families', id, 'parentTodos', docId);
  try {
    const created = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists()) return false;
      tx.set(ref, {
        title: String(title).slice(0, 200),
        description: String(description || '').slice(0, 4000),
        deadline: deadline || null,
        deadlineTime: null,
        participants: [],
        assignedTo: assigneeUid || createdByUid || null,
        attachments: [],
        done: false,
        active: true,
        deleted: false,
        type: 'task',
        completedDates: [],
        createdBy: createdByUid || null,
        startKey: null,
        order: 0,
        source,
        isoKey: docId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return true;
    });
    if (created) {
      try {
        await setDoc(doc(db, 'families', id, 'parentTodos', docId, 'log', 'created'), {
          text: 'Oppgaven ble opprettet fra ISO / K-HMS',
          uid: createdByUid || '',
          name: 'ISO',
          createdAt: serverTimestamp(),
        });
      } catch { /* oppgaven er lagret */ }
    }
    return docId;
  } catch {
    return '';
  }
}

/** Dokumentstyringen i Skjemabygger og HR (malene og personalhåndboka). Tom liste uten tilgang. */
export async function loadDocControls(companyId) {
  const id = cid(companyId);
  if (!id) return [];
  try {
    const snap = await getDocs(col(id, 'docControl'));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    return [];
  }
}

/** Status for oppgaver ISO har opprettet (lest fra Oppgaver), nøkkel → { done, assignedTo }. */
export async function loadIsoTasks(companyId) {
  const id = cid(companyId);
  if (!id) return {};
  try {
    const snap = await getDocs(query(col(id, 'parentTodos'), where('source', '==', 'iso')));
    const out = {};
    for (const d of snap.docs) {
      const data = d.data() || {};
      out[d.id] = { done: !!data.done, deleted: !!data.deleted, assignedTo: data.assignedTo || '', title: data.title || '' };
    }
    return out;
  } catch {
    return {};
  }
}

/** Når et steg/tiltak fullføres i ISO, krysses ISO-oppgaven av i Oppgaver (ingen dobbel avkryssing). */
export async function completeIsoTask(companyId, key) {
  const id = cid(companyId);
  const docId = String(key || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 140);
  if (!id || !docId) return false;
  try {
    const ref = doc(db, 'families', id, 'parentTodos', docId);
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data()?.source !== 'iso' || snap.data()?.done) return false;
    await updateDoc(ref, { done: true, updatedAt: serverTimestamp() });
    return true;
  } catch {
    return false;
  }
}

export function clearIsoMemory() {
  MEMORY.clear();
}

/** Fjerner lokale kopier for alle brukere på enheten (utlogging / brukerbytte). */
export async function clearIsoCache() {
  MEMORY.clear();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter((k) => k.startsWith(CACHE_KEY));
    if (mine.length) await AsyncStorage.multiRemove(mine);
  } catch { /* ignorer */ }
}
