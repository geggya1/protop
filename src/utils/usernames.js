import {
  doc, getDoc, collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../../firebase';
import {
  slugName,
  suggestUsername,
  normalizeUsername,
  isValidUsername,
  usernameToEmail,
} from './usernamesLogic';

export {
  slugName,
  suggestUsername,
  normalizeUsername,
  isValidUsername,
  usernameToEmail,
};

export async function usernameTaken(raw, exceptUid) {
  const u = normalizeUsername(raw);
  if (!isValidUsername(u)) return true;
  try {
    const snap = await getDoc(doc(db, 'usernames', u));
    if (snap.exists() && snap.data()?.uid && snap.data().uid !== exceptUid) return true;
  } catch {
    return false;
  }
  try {
    const qy = query(collection(db, 'parents'), where('usernameLower', '==', u), limit(3));
    const extra = await getDocs(qy);
    if (extra.docs.some((d) => (d.data()?.uid || d.id) !== exceptUid)) return true;
  } catch {}
  return false;
}

/**
 * Ta brukernavnet på serveren (claimUsername, functions/usernameClaim.js, SEC-19): kontoen får
 * ett aktivt navn, og et eldre navn på samme konto frigis. Voksne tar navn til seg selv; uid
 * brukes bare for barn (av en foresatt). Feil: 'taken' når navnet er tatt, ellers 'invalid-username'
 * eller serverens melding. Appen skriver ikke usernames/{navn} direkte lenger.
 */
export async function claimUsername(raw, uid, type = 'adult') {
  const u = normalizeUsername(raw);
  if (!isValidUsername(u) || !uid) throw new Error('invalid-username');
  // Et voksent navn tas bare av kontoen selv (serveren avviser også en annen uid).
  if (type !== 'child' && auth?.currentUser?.uid && auth.currentUser.uid !== uid) throw new Error('not-allowed');
  try {
    const call = httpsCallable(functions, 'claimUsername', { timeout: 20000 });
    const result = await call({ username: u, uid, type: type === 'child' ? 'child' : 'adult' });
    return result.data?.username || u;
  } catch (error) {
    const code = String(error?.code || '');
    if (code.endsWith('already-exists')) throw new Error('taken');
    if (code.endsWith('invalid-argument')) throw new Error('invalid-username');
    throw error;
  }
}

export async function resolveLoginEmail(identifier) {
  const raw = String(identifier || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw.includes('@')) return raw;
  const digits = raw.replace(/[^\d+]/g, '');
  if (digits.length >= 8 && /^\+?\d+$/.test(raw.replace(/\s/g, ''))) {
    try {
      const qy = query(collection(db, 'users'), where('phone', '==', raw.replace(/\s/g, '')), limit(1));
      const snap = await getDocs(qy);
      if (!snap.empty) {
        const email = snap.docs[0].data()?.email;
        if (email) return email;
        const uname = snap.docs[0].data()?.usernameLower;
        if (uname) return usernameToEmail(uname);
      }
    } catch {}
  }
  const u = normalizeUsername(raw);
  try {
    const snap = await getDoc(doc(db, 'usernames', u));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.email) return data.email;
      if (data.type === 'child' || !data.email) return usernameToEmail(u);
    }
  } catch {}
  return usernameToEmail(u);
}
