import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, onSnapshot, runTransaction, setDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { employeeListKey, persistEmployeeList } from './localCache.js';
import {
  mergeEmployeeEdit, newId, normalizeEmployee, normalizeProfile, sortEmployees,
} from './model.js';
import { employmentChangeNeedsServer } from './membership.js';
import { setEmploymentStatus } from './membershipClient.js';
import { aliasSourceIds, subscribeCompanyAliases } from '../project/companyAlias.js';

const sourceByEmployee = new Map();

function sourceKey(companyId, employeeId) {
  return `${String(companyId || '')}:${String(employeeId || '')}`;
}

// Versjoner vi har sett av hver ansatt (fra skyen, lokal kopi og egne lagringer), slått opp
// på updatedAt. En redigeringskopi har updatedAt fra versjonen den ble laget fra; da vet
// lagringen hva som faktisk er endret, og kan slå det sammen med nyeste versjon.
const versionsByEmployee = new Map();
const VERSIONS_KEPT = 8;

function rememberVersion(companyId, row) {
  const stamp = String(row?.updatedAt || '');
  if (!row?.id || !stamp) return;
  const key = sourceKey(companyId, row.id);
  const list = versionsByEmployee.get(key) || new Map();
  if (list.has(stamp)) return;
  list.set(stamp, row);
  while (list.size > VERSIONS_KEPT) list.delete(list.keys().next().value);
  versionsByEmployee.set(key, list);
}

/** Versjonen en redigeringskopi ble laget fra, eller null. */
export function employeeVersion(companyId, employeeId, updatedAt) {
  const stamp = String(updatedAt || '');
  if (!stamp) return null;
  return versionsByEmployee.get(sourceKey(companyId, employeeId))?.get(stamp) || null;
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
    const rows = (Array.isArray(parsed) ? parsed : []).map((row) => normalizeEmployee(row));
    rows.forEach((row) => rememberVersion(companyId, row));
    return sortEmployees(rows);
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
        rows.forEach((row) => rememberVersion(companyId, row));
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

/**
 * Lagre en ansatt. Bare feltene som er endret i forhold til versjonen kopien ble laget fra,
 * skrives, slått sammen med nyeste versjon i skyen i en transaksjon. Kobling og invitasjon
 * som serveren har satt i mellomtiden, overskrives ikke. base kan gis når kallet vet den.
 *
 * Avsluttes ansettelsen (deaktivert, papirkurv, sluttdato passert) eller tas den opp igjen,
 * settes status og sluttdato av serveren først, sammen med medlemskapet. Feiler det, lagres
 * ingenting, og feilen kastes videre. onEmployment får svaret fra serveren (membership:
 * removed | restored | needs-invite | kept | none).
 */
export async function saveEmployee(companyId, employee, { base = null, onEmployment = null } = {}) {
  const target = sourceByEmployee.get(sourceKey(companyId, employee?.id))
    || String(employee?.sourceCompanyId || companyId || '').trim();
  const id = employee?.id || newId('emp');
  const ref = employeeRef(target || companyId, id);
  const from = base || employeeVersion(companyId, id, employee?.updatedAt);
  const current = await getDoc(ref);
  if (current.exists()) {
    const remote = normalizeEmployee({ ...current.data(), id });
    const wanted = mergeEmployeeEdit({ remote, base: from, next: { ...employee, id } });
    if (employmentChangeNeedsServer(remote, wanted)) {
      const result = await setEmploymentStatus({
        companyId,
        employeeId: id,
        employeeCompanyId: target || companyId,
        status: wanted.company.status,
        periodTo: wanted.company.periodTo,
      });
      onEmployment?.(result);
    }
  }
  const stamp = new Date().toISOString();
  const next = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const remote = snap.exists() ? normalizeEmployee({ ...snap.data(), id }) : null;
    const merged = mergeEmployeeEdit({ remote, base: from, next: { ...employee, id } });
    const row = normalizeEmployee({
      ...merged,
      id,
      updatedAt: stamp,
      createdAt: merged.createdAt || remote?.createdAt || employee?.createdAt || stamp,
    });
    tx.set(ref, row);
    return row;
  });
  rememberVersion(companyId, next);
  try {
    const current = await readLocal(companyId);
    await writeLocal(companyId, sortEmployees([...current.filter((row) => row.id !== next.id), next]));
  } catch {
    // Tilgangen ligger i Firestore. En full lokal kopi skal ikke vises som feil.
  }
  return next;
}

/**
 * Slett permanent (fra papirkurven). Serveren sletter posten og sørger for at personen
 * ikke lenger er medlem av bedriften.
 */
export async function removeEmployee(companyId, employeeId) {
  const id = String(employeeId || '');
  if (!companyId || !id) return;
  const target = sourceByEmployee.get(sourceKey(companyId, id)) || companyId;
  await setEmploymentStatus({
    companyId,
    employeeId: id,
    employeeCompanyId: target,
    purge: true,
  });
  sourceByEmployee.delete(sourceKey(companyId, id));
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
