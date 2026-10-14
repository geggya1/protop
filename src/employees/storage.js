import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { employeeListKey, persistEmployeeList } from './localCache.js';
import { newId, normalizeEmployee, normalizeProfile, sortEmployees } from './model.js';
import { aliasSourceIds, subscribeCompanyAliases } from '../project/companyAlias.js';

const sourceByEmployee = new Map();

function sourceKey(companyId, employeeId) {
  return `${String(companyId || '')}:${String(employeeId || '')}`;
}

const PROFILE_KEY = 'protop.professionalProfile.v1';

function listKey(companyId) {
  return employeeListKey(companyId);
}

function profileKey(uid) {
  return `${PROFILE_KEY}.${uid}`;
}

async function readLocal(companyId) {
  if (!companyId) return [];
  try {
    const raw = await AsyncStorage.getItem(listKey(companyId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return sortEmployees((Array.isArray(parsed) ? parsed : []).map((row) => normalizeEmployee(row)));
  } catch {
    return [];
  }
}

async function writeLocal(companyId, rows) {
  if (!companyId) return;
  await persistEmployeeList(AsyncStorage, listKey(companyId), rows);
}

function employeeRef(companyId, employeeId) {
  return doc(db, 'families', companyId, 'employees', employeeId);
}

export function watchEmployees(companyId, onData, onError) {
  if (!companyId) {
    onData([], { source: 'local' });
    return () => {};
  }
  let stop = false;
  let generation = 0;
  let unsubs = [];
  const buckets = new Map();

  const emit = () => {
    if (stop) return;
    const ids = [companyId, ...aliasSourceIds(companyId)];
    const seen = new Set();
    const merged = [];
    for (const id of ids) {
      for (const row of buckets.get(id) || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        const next = { ...row, sourceCompanyId: id };
        sourceByEmployee.set(sourceKey(companyId, row.id), id);
        merged.push(next);
      }
    }
    onData(sortEmployees(merged), { source: 'remote' });
  };

  const bind = () => {
    const token = ++generation;
    unsubs.forEach((fn) => fn());
    unsubs = [];
    buckets.clear();
    const ids = [companyId, ...aliasSourceIds(companyId)];
    ids.forEach((id) => {
      const unsub = onSnapshot(collection(db, 'families', id, 'employees'), (snap) => {
        if (stop || token !== generation) return;
        const rows = snap.docs.map((item) => normalizeEmployee({ ...item.data(), id: item.id }));
        buckets.set(id, rows);
        if (id === companyId) writeLocal(companyId, rows).catch(() => {});
        emit();
      }, (error) => {
        if (stop || token !== generation) return;
        if (id === companyId) onError?.(error);
      });
      unsubs.push(unsub);
    });
  };

  readLocal(companyId).then((rows) => {
    if (!stop) onData(rows, { source: 'local' });
  }).catch(() => {});
  bind();
  const off = subscribeCompanyAliases((key) => {
    if (key === companyId) bind();
  });
  return () => {
    stop = true;
    off();
    unsubs.forEach((fn) => fn());
  };
}

export async function saveEmployee(companyId, employee) {
  const target = sourceByEmployee.get(sourceKey(companyId, employee?.id))
    || String(employee?.sourceCompanyId || companyId || '').trim();
  const next = normalizeEmployee({
    ...employee,
    id: employee?.id || newId('emp'),
    updatedAt: new Date().toISOString(),
    createdAt: employee?.createdAt || new Date().toISOString(),
  });
  await setDoc(employeeRef(target || companyId, next.id), next);
  try {
    const current = await readLocal(companyId);
    await writeLocal(companyId, sortEmployees([...current.filter((row) => row.id !== next.id), next]));
  } catch {
    // Tilgangen ligger i Firestore. En full lokal kopi skal ikke vises som feil.
  }
  return next;
}

export async function removeEmployee(companyId, employeeId) {
  const id = String(employeeId || '');
  if (!companyId || !id) return;
  const target = sourceByEmployee.get(sourceKey(companyId, id)) || companyId;
  sourceByEmployee.delete(sourceKey(companyId, id));
  await deleteDoc(employeeRef(target, id));
  try {
    const current = await readLocal(companyId);
    await writeLocal(companyId, current.filter((row) => row.id !== id));
  } catch {
    // Slettingen ligger i Firestore.
  }
}

async function readProfileLocal(uid) {
  if (!uid) return normalizeProfile(null);
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid));
    return normalizeProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return normalizeProfile(null);
  }
}

export async function loadProfessionalProfile(uid) {
  if (!uid) return normalizeProfile(null);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists() && snap.data()?.professionalProfile) {
      const profile = normalizeProfile(snap.data().professionalProfile);
      await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profile));
      return profile;
    }
  } catch {
    return readProfileLocal(uid);
  }
  return readProfileLocal(uid);
}

export async function saveProfessionalProfile(uid, profile) {
  const next = normalizeProfile({ ...profile, updatedAt: new Date().toISOString() });
  await setDoc(doc(db, 'users', uid), { professionalProfile: next }, { merge: true });
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(next));
  return next;
}
