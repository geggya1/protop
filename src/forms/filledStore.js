/**
 * Lagring av utfylte dokumenter: families/{companyId}/formDocs/{id}.
 * Ett Firestore-dokument per utfylt skjema, så store sjekklister ikke fyller
 * opp anbudsdokumentet der malene ligger. Lokal kopi brukes når nettet er borte.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { isFirestorePermissionError, waitForFirestoreAccess } from '../utils/firestoreAccess.js';
import { normalizeFilledDoc, sortFilled } from './filledDocs.js';

const COLLECTION = 'formDocs';
const CACHE_KEY = 'protop.formDocs.v1';
const AUTH_MS = 8000;
const MAX_DOCS = 300;
const MEMORY = new Map();

function cid(companyId) {
  return String(companyId || '').trim();
}

function cacheKey(companyId) {
  return `${CACHE_KEY}.${cid(companyId) || '_'}`;
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

async function readCache(companyId) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(companyId));
    const list = raw ? JSON.parse(raw) : [];
    return sortFilled((Array.isArray(list) ? list : []).map(normalizeFilledDoc).filter(Boolean));
  } catch {
    return [];
  }
}

async function writeCache(companyId, list) {
  try {
    await AsyncStorage.setItem(cacheKey(companyId), JSON.stringify(list.slice(0, MAX_DOCS)));
  } catch { /* full eller utilgjengelig lagring – skyen er kilden */ }
}

export function peekFilledDocs(companyId) {
  return MEMORY.get(cid(companyId) || '_') || null;
}

function remember(companyId, list) {
  const sorted = sortFilled(list).slice(0, MAX_DOCS);
  MEMORY.set(cid(companyId) || '_', sorted);
  writeCache(companyId, sorted);
  return sorted;
}

/** Alle utfylte dokumenter i selskapet, nyeste først. */
export async function loadFilledDocs(companyId) {
  const id = cid(companyId);
  const cached = peekFilledDocs(id) || await readCache(id);
  if (!id) return cached;
  try {
    if (!(await ensureAuth())) return cached;
    const snap = await getDocs(collection(db, 'families', id, COLLECTION));
    const list = snap.docs.map((row) => normalizeFilledDoc({ ...row.data(), id: row.id })).filter(Boolean);
    return remember(id, list);
  } catch (err) {
    if (!isFirestorePermissionError(err)) console.warn('formDocs load failed', err?.message || err);
    return cached;
  }
}

export async function saveFilledDoc(companyId, input) {
  const id = cid(companyId);
  const next = normalizeFilledDoc(input);
  if (!next) return { ok: false, error: 'Dokumentet mangler innhold.' };
  const current = peekFilledDocs(id) || await readCache(id);
  const list = remember(id, [next, ...current.filter((row) => row.id !== next.id)]);
  if (!id) return { ok: true, doc: next, list, local: true };
  try {
    if (!(await ensureAuth())) return { ok: true, doc: next, list, local: true };
    await setDoc(doc(db, 'families', id, COLLECTION, next.id), plain(next));
    return { ok: true, doc: next, list };
  } catch (err) {
    console.warn('formDocs save failed', err?.message || err);
    return { ok: false, error: 'Dokumentet ble lagret på enheten, men ikke i skyen. Prøv igjen når du er på nett.', doc: next, list, local: true };
  }
}

export async function deleteFilledDoc(companyId, docId) {
  const id = cid(companyId);
  const current = peekFilledDocs(id) || await readCache(id);
  const list = remember(id, current.filter((row) => row.id !== docId));
  if (!id) return { ok: true, list };
  try {
    if (await ensureAuth()) await deleteDoc(doc(db, 'families', id, COLLECTION, docId));
    return { ok: true, list };
  } catch (err) {
    console.warn('formDocs delete failed', err?.message || err);
    return { ok: false, error: 'Kunne ikke slette i skyen.', list };
  }
}
