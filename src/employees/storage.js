import AsyncStorage from '@react-native-async-storage/async-storage';
import { collection, deleteDoc, doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { newId, normalizeEmployee, normalizeProfile, sortEmployees } from './model.js';

const LIST_KEY = 'protop.employees.v1';
const PROFILE_KEY = 'protop.professionalProfile.v1';

function listKey(companyId) {
  return `${LIST_KEY}.${companyId}`;
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
  await AsyncStorage.setItem(listKey(companyId), JSON.stringify(rows));
}

function employeeRef(companyId, employeeId) {
  return doc(db, 'families', companyId, 'employees', employeeId);
}

export function watchEmployees(companyId, onData, onError) {
  if (!companyId) {
    onData([]);
    return () => {};
  }
  let stop = false;
  readLocal(companyId).then((rows) => {
    if (!stop) onData(rows);
  }).catch(() => {});
  const unsub = onSnapshot(collection(db, 'families', companyId, 'employees'), (snap) => {
    const rows = sortEmployees(snap.docs.map((item) => normalizeEmployee({ ...item.data(), id: item.id })));
    writeLocal(companyId, rows).catch(() => {});
    onData(rows);
  }, (error) => {
    onError?.(error);
  });
  return () => {
    stop = true;
    unsub();
  };
}

export async function saveEmployee(companyId, employee) {
  const next = normalizeEmployee({
    ...employee,
    id: employee?.id || newId('emp'),
    updatedAt: new Date().toISOString(),
    createdAt: employee?.createdAt || new Date().toISOString(),
  });
  await setDoc(employeeRef(companyId, next.id), next);
  const current = await readLocal(companyId);
  await writeLocal(companyId, sortEmployees([...current.filter((row) => row.id !== next.id), next]));
  return next;
}

export async function removeEmployee(companyId, employeeId) {
  const id = String(employeeId || '');
  if (!companyId || !id) return;
  await deleteDoc(employeeRef(companyId, id));
  const current = await readLocal(companyId);
  await writeLocal(companyId, current.filter((row) => row.id !== id));
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
