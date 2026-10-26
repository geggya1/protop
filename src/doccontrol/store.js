/**
 * Lagring av dokumentstyringen i Firestore:
 *   families/{id}/docControl/{key}          styrte dokumenter med revisjoner og godkjenninger
 *   families/{id}/docControlSettings/main   godkjennere, merknadslesere og varsel
 *   families/{id}/docComments/{id}          merknader (bare synlige for utpekte, se firestore.rules)
 *   families/{id}/docAcks/{docKey}__{uid}   lesebekreftelser
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { isFirestorePermissionError, waitForFirestoreAccess } from '../utils/firestoreAccess.js';
import { ackId, normalizeAck, normalizeComment, normalizeControl, normalizeSettings } from './model.js';

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

function warn(label, err) {
  if (!isFirestorePermissionError(err)) console.warn(`doccontrol ${label} failed`, err?.message || err);
}

export function peekDocControl(companyId) {
  return MEMORY.get(cid(companyId)) || null;
}

function remember(companyId, part) {
  const key = cid(companyId);
  const next = { controls: [], settings: normalizeSettings(null), acks: [], ...(MEMORY.get(key) || {}), ...part };
  MEMORY.set(key, next);
  return next;
}

export async function loadControls(companyId) {
  if (!cid(companyId) || !(await ensureAuth())) return peekDocControl(companyId)?.controls || [];
  try {
    const snap = await getDocs(col(companyId, 'docControl'));
    const controls = snap.docs.map((row) => normalizeControl({ ...row.data(), id: row.id })).filter(Boolean);
    remember(companyId, { controls });
    return controls;
  } catch (err) {
    warn('load', err);
    return peekDocControl(companyId)?.controls || [];
  }
}

export async function saveControl(companyId, control) {
  const next = normalizeControl(control);
  if (!next) return { ok: false, error: 'Dokumentet mangler id eller tittel.' };
  if (!cid(companyId)) return { ok: false, error: 'Velg selskap først.' };
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn for å lagre.' };
    await setDoc(doc(db, 'families', cid(companyId), 'docControl', next.id), plain(next));
    const current = peekDocControl(companyId)?.controls || [];
    remember(companyId, { controls: [next, ...current.filter((row) => row.id !== next.id)] });
    return { ok: true, control: next };
  } catch (err) {
    warn('save', err);
    return {
      ok: false,
      error: isFirestorePermissionError(err)
        ? 'Du har ikke tilgang til å godkjenne eller endre den godkjente versjonen.'
        : 'Kunne ikke lagre dokumentstyringen. Prøv igjen.',
    };
  }
}

export async function loadSettings(companyId) {
  if (!cid(companyId) || !(await ensureAuth())) return peekDocControl(companyId)?.settings || normalizeSettings(null);
  try {
    const snap = await getDoc(doc(db, 'families', cid(companyId), 'docControlSettings', 'main'));
    const settings = normalizeSettings(snap.exists() ? snap.data() : null);
    remember(companyId, { settings });
    return settings;
  } catch (err) {
    warn('settings', err);
    return peekDocControl(companyId)?.settings || normalizeSettings(null);
  }
}

export async function saveSettings(companyId, input, { actor = null } = {}) {
  const settings = normalizeSettings({ ...input, updatedAt: new Date().toISOString(), updatedBy: actor?.name || '' });
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn for å lagre.' };
    await setDoc(doc(db, 'families', cid(companyId), 'docControlSettings', 'main'), plain(settings));
    remember(companyId, { settings });
    return { ok: true, settings };
  } catch (err) {
    warn('settings save', err);
    return { ok: false, error: isFirestorePermissionError(err) ? 'Bare eier og administratorer kan endre innstillingene.' : 'Kunne ikke lagre innstillingene.' };
  }
}

/**
 * Merknader brukeren har lov til å se. Lesere med full tilgang henter alle.
 * Andre henter egne og dem de står som leser på (dokumentets eier og godkjenner).
 */
export async function loadComments(companyId, { uid = '', all = false } = {}) {
  if (!cid(companyId) || !uid || !(await ensureAuth())) return [];
  const ref = col(companyId, 'docComments');
  const read = async (q) => (await getDocs(q)).docs.map((row) => normalizeComment({ ...row.data(), id: row.id })).filter(Boolean);
  try {
    if (all) return await read(ref);
  } catch (err) {
    warn('comments all', err);
  }
  try {
    const [own, reader] = await Promise.all([
      read(query(ref, where('authorUid', '==', uid))),
      read(query(ref, where('readerUids', 'array-contains', uid))),
    ]);
    const map = new Map([...own, ...reader].map((row) => [row.id, row]));
    return [...map.values()];
  } catch (err) {
    warn('comments', err);
    return [];
  }
}

export async function saveComment(companyId, comment, { readerUids = [] } = {}) {
  const next = normalizeComment(comment);
  if (!next) return { ok: false, error: 'Skriv en merknad.' };
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn for å skrive merknader.' };
    const uids = [...new Set((readerUids || []).filter(Boolean))].slice(0, 10);
    await setDoc(doc(db, 'families', cid(companyId), 'docComments', next.id), plain({ ...next, ...(uids.length ? { readerUids: uids } : {}) }), { merge: true });
    return { ok: true, comment: next };
  } catch (err) {
    warn('comment save', err);
    return { ok: false, error: 'Kunne ikke lagre merknaden.' };
  }
}

export async function deleteComment(companyId, commentId) {
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn først.' };
    await deleteDoc(doc(db, 'families', cid(companyId), 'docComments', commentId));
    return { ok: true };
  } catch (err) {
    warn('comment delete', err);
    return { ok: false, error: 'Kunne ikke slette merknaden.' };
  }
}

export async function loadAcks(companyId) {
  if (!cid(companyId) || !(await ensureAuth())) return peekDocControl(companyId)?.acks || [];
  try {
    const snap = await getDocs(col(companyId, 'docAcks'));
    const acks = snap.docs.map((row) => normalizeAck(row.data())).filter(Boolean);
    remember(companyId, { acks });
    return acks;
  } catch (err) {
    warn('acks', err);
    return peekDocControl(companyId)?.acks || [];
  }
}

export async function saveAck(companyId, input) {
  const ack = normalizeAck(input);
  if (!ack || !ack.uid) return { ok: false, error: 'Logg inn for å bekrefte.' };
  try {
    if (!(await ensureAuth())) return { ok: false, error: 'Logg inn for å bekrefte.' };
    await setDoc(doc(db, 'families', cid(companyId), 'docAcks', ackId(ack)), plain(ack));
    const current = peekDocControl(companyId)?.acks || [];
    remember(companyId, { acks: [...current.filter((row) => ackId(row) !== ackId(ack)), ack] });
    return { ok: true, ack };
  } catch (err) {
    warn('ack save', err);
    return { ok: false, error: 'Kunne ikke lagre bekreftelsen. Prøv igjen.' };
  }
}
