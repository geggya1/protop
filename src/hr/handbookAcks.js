/**
 * Lesebekreftelser for personalhåndboken: families/{companyId}/handbookAcks/{uid}.
 * Hver ansatt skriver bare sin egen bekreftelse, så HR-dokumentet ikke låses av
 * mange samtidige lagringer. HR leser hele samlingen for å se hvem som mangler.
 */
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { isFirestorePermissionError, waitForFirestoreAccess } from '../utils/firestoreAccess.js';
import { normalizeAck } from './handbook.js';

const COLLECTION = 'handbookAcks';
const AUTH_MS = 8000;

function cid(companyId) {
  return String(companyId || '').trim();
}

function ackId(ack) {
  return String(ack?.uid || `emp_${ack?.employeeId || ''}`).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
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

export async function loadHandbookAcks(companyId) {
  const id = cid(companyId);
  if (!id) return [];
  try {
    if (!(await ensureAuth())) return [];
    const snap = await getDocs(collection(db, 'families', id, COLLECTION));
    return snap.docs.map((row) => normalizeAck(row.data())).filter(Boolean);
  } catch (err) {
    if (!isFirestorePermissionError(err)) console.warn('handbookAcks load failed', err?.message || err);
    return [];
  }
}

export async function saveHandbookAck(companyId, input) {
  const id = cid(companyId);
  const ack = normalizeAck(input);
  if (!id || !ack) return { ok: false, error: 'Mangler bruker eller versjon.' };
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn for å bekrefte.' };
    await setDoc(doc(db, 'families', id, COLLECTION, ackId(ack)), JSON.parse(JSON.stringify(ack)));
    return { ok: true, ack };
  } catch (err) {
    console.warn('handbookAcks save failed', err?.message || err);
    return { ok: false, error: 'Kunne ikke lagre bekreftelsen. Prøv igjen.' };
  }
}
