/**
 * Lagring av ISO / K-HMS i Firestore.
 *
 *   families/{companyId}/isoSystem/main            omfang, standarder, risikometode
 *   families/{companyId}/isoFindings/{id}          avvik og tiltak
 *   families/{companyId}/isoFindingsRestricted/{id} skjermede HMS-/personsaker
 *   families/{companyId}/isoProcesses/{id} …       én dokumentsamling per entitetstype
 *   families/{companyId}/isoAudit/{eventId}        revisjonsspor (bare nye hendelser skrives)
 *   families/{companyId}/parentTodos/{key}         oppgaver i ProTop (deterministisk id → ingen duplikater)
 *
 * Hver lagring er en transaksjon med revisjonskontroll: er posten endret av en annen
 * siden den ble lest, avvises lagringen i stedet for å overskrive (optimistisk lås).
 * Selskapsisolasjon håndheves av Firestore-reglene (medlemskap i selskapet).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, deleteDoc, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isFirestorePermissionError, waitForFirestoreAccess } from '../utils/firestoreAccess.js';
import { COLLECTIONS, collectionFor, emptyIsoState, stateFromCollections } from './state.js';
import { restrictedUids } from './access.js';

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
    getDocs(query(ref, where('assigneeUid', '==', uid))),
  ]);
  const map = new Map();
  for (const d of [...a.docs, ...b.docs]) map.set(d.id, { ...d.data(), id: d.id });
  return [...map.values()];
}

async function readCache(companyId) {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY}.${cid(companyId)}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Lokal cache inneholder aldri skjermede saker. */
async function writeCache(companyId, parts) {
  try {
    const { restrictedFindings, ...open } = parts;
    await AsyncStorage.setItem(`${CACHE_KEY}.${cid(companyId)}`, JSON.stringify(open));
  } catch {
    /* full lagring er ikke kritisk */
  }
}

export function peekIsoState(companyId) {
  return MEMORY.get(cid(companyId)) || null;
}

/**
 * Leser hele ISO-tilstanden for selskapet.
 * Returnerer { state, source: 'remote' | 'cache' | 'empty', error? }.
 */
export async function loadIsoState(companyId, { uid = '', restrictedView = false, bypass = false } = {}) {
  const id = cid(companyId);
  if (!id) return { state: emptyIsoState(), source: 'empty' };
  const authed = await ensureAuth();
  if (!authed) {
    const cached = await readCache(id);
    return cached
      ? { state: stateFromCollections(cached), source: 'cache', error: 'Ikke innlogget mot skyen. Viser lokal kopi.' }
      : { state: emptyIsoState(), source: 'empty', error: 'Ikke innlogget mot skyen.' };
  }
  try {
    const names = Object.entries(COLLECTIONS).filter(([key]) => key !== 'restrictedFindings');
    const [systemSnap, ...lists] = await Promise.all([
      getDoc(doc(db, 'families', id, 'isoSystem', 'main')),
      ...names.map(([, name]) => readAll(id, name)),
    ]);
    const parts = { system: systemSnap.exists() ? systemSnap.data() : null };
    names.forEach(([key], i) => { parts[key] = lists[i]; });
    // Særskilt tilgang avgjøres av ISO-innstillingene (lest over), ikke av den felles tilgangsmatrisen.
    const named = !!uid && restrictedUids(parts.system).has(String(uid));
    parts.restrictedFindings = (restrictedView || bypass || named)
      ? await readAll(id, COLLECTIONS.restrictedFindings)
      : await readOwnRestricted(id, uid);
    const state = stateFromCollections(parts);
    MEMORY.set(id, state);
    await writeCache(id, parts);
    return { state, source: 'remote' };
  } catch (err) {
    const cached = await readCache(id);
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

/**
 * Lagrer én entitet med revisjonskontroll.
 * kind: findings | processes | instances | documents | forms | submissions | requirements | assessments | evidence | evidenceLinks | records | system
 */
export async function saveEntity(companyId, kind, entity, { previous = null } = {}) {
  const id = cid(companyId);
  if (!id) throw new Error('Mangler selskap.');
  const authed = await ensureAuth();
  if (!authed) throw new Error('Ikke innlogget. Endringen er ikke lagret.');
  const name = kind === 'system' ? 'isoSystem' : collectionFor(kind, entity);
  const ref = doc(db, 'families', id, name, kind === 'system' ? 'main' : entity.id);
  const data = plain({ ...entity, savedAt: new Date().toISOString() });
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
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
  // Flytting mellom åpen og skjermet samling
  if (kind === 'findings' && previous && !!previous.restricted !== !!entity.restricted) {
    const old = doc(db, 'families', id, collectionFor('findings', previous), entity.id);
    try { await deleteDoc(old); } catch { /* kan mangle tilgang; ny kopi er lagret */ }
  }
  return data;
}

/** Flere entiteter i én batch (f.eks. bevis + koblinger + vurderinger). Ingen revisjonslås. */
export async function saveMany(companyId, rows) {
  const id = cid(companyId);
  if (!id || !rows?.length) return;
  const authed = await ensureAuth();
  if (!authed) throw new Error('Ikke innlogget. Endringen er ikke lagret.');
  for (let i = 0; i < rows.length; i += 400) {
    const batch = writeBatch(db);
    for (const { kind, entity } of rows.slice(i, i + 400)) {
      const name = collectionFor(kind, entity);
      batch.set(doc(db, 'families', id, name, entity.id), plain(entity));
    }
    await batch.commit();
  }
}

/** Revisjonsspor: bare nye dokumenter, med hendelsens egen id. */
export async function appendAudit(companyId, events) {
  const id = cid(companyId);
  if (!id || !events?.length) return;
  try {
    const batch = writeBatch(db);
    for (const ev of events) batch.set(doc(db, 'families', id, 'isoAudit', ev.id), plain(ev));
    await batch.commit();
  } catch {
    /* sporet ligger også i objektets historikk */
  }
}

export async function loadAuditFor(companyId, entityId) {
  const id = cid(companyId);
  if (!id || !entityId) return [];
  try {
    const snap = await getDocs(query(col(id, 'isoAudit'), where('entityId', '==', entityId)));
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
