import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, deleteDoc, doc, getDoc, onSnapshot, runTransaction, setDoc, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { isFirestorePermissionError } from '../utils/firestoreAccess.js';
import { employeeListKey, persistEmployeeList } from './localCache.js';
import {
  mergeEmployeeEdit, newId, normalizeEmployee, normalizeProfile, sortEmployees,
} from './model.js';
import {
  hasPrivateValues, keepStoredPrivate, privatePatch, splitEmployeePrivate, withEmployeePrivate, withoutPrivate,
} from './privateFields.js';
import { employmentChangeNeedsServer } from './membership.js';
import { setEmploymentStatus } from './membershipClient.js';
import { aliasSourceIds, subscribeCompanyAliases } from '../project/companyAlias.js';
import { subscribeAccessMirror } from '../access/accessMirror.js';

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
  // Samme versjon kan komme igjen med de skjermede feltene (employeesPrivate) lagt på.
  list.delete(stamp);
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

// Personnummer, pårørende og intern kommentar (privateFields.js).
function privateRef(companyId, employeeId) {
  return doc(db, 'families', companyId, 'employeesPrivate', employeeId);
}

// Eldre poster med skjermede felt på selve posten flyttes én gang per økt og selskap.
const movedPrivate = new Set();

/**
 * Flytt eldre verdier fra ansattposten til employeesPrivate. Bare for den som kan lese den
 * skjermede delen (eier, administrator, HR). Verdier som allerede står der, vinner.
 */
async function moveLegacyPrivate(companyId, rows, secrets) {
  const key = String(companyId || '');
  if (!key || movedPrivate.has(key)) return;
  const legacy = (rows || []).filter((row) => row?.id && hasPrivateValues(row)).slice(0, 200);
  if (!legacy.length) return;
  movedPrivate.add(key);
  const stamp = new Date().toISOString();
  try {
    const batch = writeBatch(db);
    for (const row of legacy) {
      const stored = secrets?.get(row.id) || null;
      const merged = withEmployeePrivate(row, stored);
      const { secret } = splitEmployeePrivate(merged);
      batch.set(privateRef(key, row.id), { ...secret, employeeId: row.id, updatedAt: stamp }, { merge: true });
      batch.update(employeeRef(key, row.id), {
        'person.nationalId': '',
        'person.kinName': '',
        'person.kinPhone': '',
        'person.kinEmail': '',
        'person.kinNote': '',
        'company.comment': '',
      });
    }
    await batch.commit();
  } catch (err) {
    console.warn('[employees] kunne ikke flytte skjermede felt', err?.message || err);
  }
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
  // Skjermede felt per selskap: hele samlingen for dem som kan lese den, ellers egne poster.
  const secrets = new Map();
  const ownSecrets = new Map();
  const ownAsked = new Set();

  const secretFor = (id, employeeId) => secrets.get(id)?.get(employeeId)
    || ownSecrets.get(sourceKey(id, employeeId))
    || null;

  // Uten tilgang til hele samlingen: hent den skjermede delen av egne poster.
  const loadOwnSecrets = (id) => {
    const uid = auth?.currentUser?.uid || '';
    if (!uid || secrets.get(id)) return;
    for (const row of buckets.get(id) || []) {
      const askKey = sourceKey(id, row?.id);
      if (row?.personUid !== uid || ownAsked.has(askKey)) continue;
      ownAsked.add(askKey);
      getDoc(privateRef(id, row.id)).then((snap) => {
        if (stop || !snap.exists()) return;
        ownSecrets.set(askKey, snap.data() || {});
        emit();
      }).catch(() => {});
    }
  };

  const emit = () => {
    if (stop) return;
    const ids = [companyId, ...aliasSourceIds(companyId)];
    const seen = new Set();
    const merged = [];
    for (const id of ids) {
      for (const row of buckets.get(id) || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        const secret = secretFor(id, row.id);
        const next = { ...(secret ? normalizeEmployee(withEmployeePrivate(row, secret)) : row), sourceCompanyId: id };
        if (secret) rememberVersion(companyId, next);
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
    secrets.clear();
    ids.forEach((id) => {
      const unsub = onSnapshot(collection(db, 'families', id, 'employees'), (snap) => {
        if (stop || token !== generation) return;
        const rows = snap.docs.map((item) => normalizeEmployee({ ...item.data(), id: item.id }));
        rows.forEach((row) => rememberVersion(companyId, row));
        buckets.set(id, rows);
        if (id === companyId) writeLocal(companyId, rows).catch(() => {});
        if (secrets.get(id)) moveLegacyPrivate(id, rows, secrets.get(id)).catch(() => {});
        else if (secrets.has(id)) loadOwnSecrets(id);
        emit();
      }, (error) => {
        if (stop || token !== generation) return;
        if (id === companyId) onError?.(error);
      });
      unsubs.push(unsub);
      const unsubSecret = onSnapshot(collection(db, 'families', id, 'employeesPrivate'), (snap) => {
        if (stop || token !== generation) return;
        secrets.set(id, new Map(snap.docs.map((item) => [item.id, item.data() || {}])));
        if (buckets.has(id)) moveLegacyPrivate(id, buckets.get(id), secrets.get(id)).catch(() => {});
        emit();
      }, () => {
        if (stop || token !== generation) return;
        // Ikke eier, administrator eller HR: bare egne skjermede felt.
        secrets.set(id, null);
        loadOwnSecrets(id);
      });
      unsubs.push(unsubSecret);
    });
  };

  readLocal(companyId).then((rows) => {
    if (!stop) onData(rows, { source: 'local' });
  }).catch(() => {});
  bind();
  const off = subscribeCompanyAliases((key) => {
    if (key === companyId) bind();
  });
  // Lytteren på skjermede felt kan bli avvist før tilgangsspeilet finnes (rett etter innlogging).
  // Koble til én gang til når speilet er skrevet; en vanlig ansatt blir avvist igjen og bruker egne poster.
  let privateRetried = false;
  const offMirror = subscribeAccessMirror((key) => {
    if (stop || key !== companyId || privateRetried || secrets.get(companyId) !== null) return;
    privateRetried = true;
    bind();
  });
  return () => {
    stop = true;
    off();
    offMirror();
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
  const stored = await getDoc(ref);
  if (stored.exists()) {
    const remote = normalizeEmployee({ ...stored.data(), id });
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
  const secretRef = privateRef(target || companyId, id);
  const build = (remote, merged) => normalizeEmployee({
    ...merged,
    id,
    updatedAt: stamp,
    createdAt: merged.createdAt || remote?.createdAt || employee?.createdAt || stamp,
  });
  let next;
  try {
    // Personnummer, pårørende og kommentar skrives til employeesPrivate, ikke på posten (L-03).
    // Eldre verdier på posten flyttes dit i samme skriving.
    next = await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const secretSnap = await tx.get(secretRef);
      const raw = snap.exists() ? snap.data() : null;
      const secret = secretSnap.exists() ? secretSnap.data() : null;
      const remote = raw ? normalizeEmployee(withEmployeePrivate({ ...raw, id }, secret)) : null;
      const merged = mergeEmployeeEdit({ remote, base: from, next: { ...employee, id } });
      const row = build(remote, merged);
      const parts = splitEmployeePrivate(row);
      tx.set(ref, parts.main);
      if (secret || hasPrivateValues(parts.secret) || (raw && hasPrivateValues(raw))) {
        // merge: HMS-kortet den ansatte har registrert selv (hmsCard) ligger i samme dokument.
        tx.set(secretRef, { ...parts.secret, employeeId: id, updatedAt: stamp }, { merge: true });
      }
      return row;
    });
  } catch (err) {
    if (!isFirestorePermissionError(err)) throw err;
    next = await saveWithoutPrivateRead({
      ref, secretRef, id, employee, from, build, stamp,
    });
  }
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
 * Uten lesetilgang til den skjermede delen (f.eks. Begrenset redigering på Ansatte): resten
 * lagres, eldre verdier på posten står urørt, og felt brukeren selv har endret skrives til
 * employeesPrivate uten å lese den. Har brukeren ikke tilgang til det heller, kastes en feil.
 */
async function saveWithoutPrivateRead({
  ref, secretRef, id, employee, from, build, stamp,
}) {
  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const raw = snap.exists() ? snap.data() : null;
    const remote = raw ? normalizeEmployee({ ...raw, id }) : null;
    const merged = mergeEmployeeEdit({ remote, base: from, next: { ...employee, id } });
    const row = build(remote, merged);
    tx.set(ref, keepStoredPrivate(splitEmployeePrivate(row).main, raw || {}));
    return { row, patch: privatePatch(from || remote || {}, normalizeEmployee({ ...employee, id })) };
  });
  if (Object.keys(result.patch).length) {
    try {
      await setDoc(secretRef, { ...result.patch, employeeId: id, updatedAt: stamp }, { merge: true });
    } catch (err) {
      if (!isFirestorePermissionError(err)) throw err;
      const denied = new Error('Du har ikke tilgang til å endre personnummer, pårørende eller kommentar. Resten er lagret.');
      denied.code = 'employees/private-permission';
      throw denied;
    }
  }
  return result.row;
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
  // Den skjermede delen (personnummer, pårørende) slettes med posten. Krever administrator.
  deleteDoc(privateRef(target, id)).catch(() => {});
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

// Profilen på enheten: uten personnummer og pårørende (de ligger i users/{uid} i skyen).
function profileForDevice(profile) {
  return normalizeProfile({ ...profile, person: withoutPrivate({ person: profile?.person || {} }).person });
}

export async function loadProfessionalProfile(uid) {
  if (!uid) return normalizeProfile(null);
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists() && snap.data()?.professionalProfile) {
      const profile = normalizeProfile(snap.data().professionalProfile);
      await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profileForDevice(profile)));
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
  await AsyncStorage.setItem(profileKey(uid), JSON.stringify(profileForDevice(next)));
  return next;
}
