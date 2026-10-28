/**
 * Personlige valg i timelisten: families/{companyId}/employees/{employeeId}/prefs/timesheet.
 * Ett lite dokument per ansatt, skrevet felt for felt (merge), så en stjerne aldri
 * skriver prosjektdokumentet eller andres valg. Lokal kopi brukes når skyen ikke svarer.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { applyTimesheetPrefsPatch, normalizeTimesheetPrefs } from './timesheetState.js';

const LOCAL_KEY = 'protop.timesheetPrefs.v1';
const MEMORY = new Map();

function text(value) {
  return String(value || '').trim();
}

function memoryKey(companyId, employeeId) {
  return `${text(companyId)}|${text(employeeId)}`;
}

function localKey(companyId, employeeId) {
  return `${LOCAL_KEY}.${text(companyId)}.${text(employeeId)}`;
}

async function prefsRef(companyId, employeeId) {
  const [{ doc, getDoc, setDoc, serverTimestamp }, { db }] = await Promise.all([
    import('firebase/firestore'),
    import('../../firebase.js'),
  ]);
  return {
    ref: doc(db, 'families', text(companyId), 'employees', text(employeeId), 'prefs', 'timesheet'),
    getDoc,
    setDoc,
    serverTimestamp,
  };
}

async function readLocal(companyId, employeeId) {
  try {
    const raw = await AsyncStorage.getItem(localKey(companyId, employeeId));
    return raw ? normalizeTimesheetPrefs(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeLocal(companyId, employeeId, prefs) {
  try {
    const job = AsyncStorage.setItem(localKey(companyId, employeeId), JSON.stringify(prefs));
    if (job && typeof job.catch === 'function') job.catch(() => {});
  } catch {
    // Disken er best-effort.
  }
}

export function peekTimesheetPrefs(companyId, employeeId) {
  return MEMORY.get(memoryKey(companyId, employeeId)) || null;
}

/** Valgene for én ansatt. Uten svar fra skyen: lokal kopi, ellers ingen egne valg. */
export async function loadTimesheetPrefs(companyId, employeeId) {
  if (!text(companyId) || !text(employeeId)) return normalizeTimesheetPrefs(null);
  const key = memoryKey(companyId, employeeId);
  try {
    const bits = await prefsRef(companyId, employeeId);
    const snap = await bits.getDoc(bits.ref);
    const prefs = normalizeTimesheetPrefs(snap.exists() ? snap.data() : null);
    MEMORY.set(key, prefs);
    writeLocal(companyId, employeeId, prefs);
    return prefs;
  } catch {
    const local = MEMORY.get(key) || await readLocal(companyId, employeeId);
    return local || normalizeTimesheetPrefs(null);
  }
}

/**
 * Lagre en endring, f.eks. { starred: { [projectId]: true } } eller { absencePins: [...] }.
 * Bare feltene i endringen skrives. Kaster når skyen ikke tar imot.
 */
export async function saveTimesheetPrefs(companyId, employeeId, patch) {
  if (!text(companyId) || !text(employeeId) || !patch) return peekTimesheetPrefs(companyId, employeeId);
  const key = memoryKey(companyId, employeeId);
  const next = applyTimesheetPrefsPatch(MEMORY.get(key), patch);
  MEMORY.set(key, next);
  writeLocal(companyId, employeeId, next);
  const clean = normalizeTimesheetPrefs(patch);
  const body = {};
  if (Object.keys(clean.starred).length) body.starred = clean.starred;
  if (Object.keys(clean.hidden).length) body.hidden = clean.hidden;
  if (Array.isArray(patch.absencePins)) body.absencePins = clean.absencePins;
  if (!Object.keys(body).length) return next;
  const bits = await prefsRef(companyId, employeeId);
  await bits.setDoc(bits.ref, { ...body, updatedAt: bits.serverTimestamp() }, { merge: true });
  return next;
}
