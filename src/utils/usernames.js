import {
  doc, getDoc, runTransaction, serverTimestamp, collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { db } from '../../firebase';

const CHILD_DOMAIN = '@weekplan.app';

export function slugName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 16) || 'user';
}

export function suggestUsername(name) {
  const base = slugName(name);
  const n = Math.floor(10 + Math.random() * 89);
  return `${base}${n}`;
}

export function normalizeUsername(raw) {
  return String(raw || '').trim().toLowerCase().replace(/^@/, '').replace(CHILD_DOMAIN, '');
}

export function isValidUsername(raw) {
  const u = normalizeUsername(raw);
  return u.length >= 3 && u.length <= 24 && /^[a-z0-9._-]+$/.test(u);
}

export function usernameToEmail(username) {
  const u = normalizeUsername(username);
  return `${u}${CHILD_DOMAIN}`;
}

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

export async function claimUsername(raw, uid, type = 'adult') {
  const u = normalizeUsername(raw);
  if (!isValidUsername(u) || !uid) throw new Error('invalid-username');
  const ref = doc(db, 'usernames', u);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists() && snap.data()?.uid && snap.data().uid !== uid) {
      throw new Error('taken');
    }
    tx.set(ref, { uid, type, username: u, updatedAt: serverTimestamp() });
  });
  return u;
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
