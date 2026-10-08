import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { compactAnbudState, emptyAnbudState, mergeAnbudStates, normalizeAnbudState } from './model.js';

const KEY = 'protop.anbud.v1';
const remoteTimers = new Map();
const remotePending = new Map();
/** Modulminne — unngår ny Firestore/AsyncStorage-runde ved hvert skjermbesøk. */
const MEMORY = new Map();
const inflight = new Map();

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

function localKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${KEY}.${id}` : KEY;
}

function anbudDoc(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  return doc(db, 'families', id, 'anbud', 'state');
}

async function readLocal(companyId) {
  try {
    const scoped = await AsyncStorage.getItem(localKey(companyId));
    const raw = scoped || (companyId ? await AsyncStorage.getItem(KEY) : null);
    if (!raw) return emptyAnbudState();
    return normalizeAnbudState(JSON.parse(raw));
  } catch {
    return emptyAnbudState();
  }
}

async function readRemote(companyId) {
  const ref = anbudDoc(companyId);
  if (!ref) return emptyAnbudState();
  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) return emptyAnbudState();
    return normalizeAnbudState(snap.data()?.state || snap.data() || {});
  } catch {
    return emptyAnbudState();
  }
}

async function writeLocal(companyId, state) {
  const payload = JSON.stringify(state);
  const key = localKey(companyId);
  try {
    await AsyncStorage.setItem(key, payload);
    if (companyId && key !== KEY) await AsyncStorage.setItem(KEY, payload).catch(() => {});
  } catch {
    const compact = JSON.stringify(compactAnbudState(state));
    await AsyncStorage.setItem(key, compact);
  }
}

async function writeRemote(companyId, state) {
  const ref = anbudDoc(companyId);
  if (!ref) return;
  await setDoc(ref, {
    state,
    updatedAt: serverTimestamp(),
  }, { merge: true });
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

export async function loadAnbudState(companyId, { force = false } = {}) {
  const key = memoryKey(companyId);
  if (!force && MEMORY.has(key)) return MEMORY.get(key);
  if (!force && inflight.has(key)) return inflight.get(key);
  const pending = (async () => {
    const local = await readLocal(companyId);
    const remote = await readRemote(companyId);
    return putAnbudMemory(companyId, mergeAnbudStates(local, remote));
  })();
  inflight.set(key, pending);
  try {
    return await pending;
  } finally {
    if (inflight.get(key) === pending) inflight.delete(key);
  }
}

export async function saveAnbudState(state, companyId) {
  const next = mergeAnbudStates(await readLocal(companyId), state);
  await writeLocal(companyId, next);
  queueRemote(companyId, compactAnbudState(next));
  return putAnbudMemory(companyId, next);
}

/** Lagrer med en gang og venter på Firestore, slik at «Lagre» ikke later som det gikk bra. */
export async function persistAnbudState(state, companyId) {
  const next = mergeAnbudStates(await readLocal(companyId), state);
  await writeLocal(companyId, next);
  const id = String(companyId || '').trim();
  if (id) {
    const prev = remoteTimers.get(id);
    if (prev) clearTimeout(prev);
    remoteTimers.delete(id);
    remotePending.delete(id);
  }
  await writeRemote(companyId, compactAnbudState(next));
  return putAnbudMemory(companyId, next);
}
