import {
  doc, updateDoc, collection, query, where, getDocs,
  collectionGroup, serverTimestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { isSyntheticEmail, stripSyntheticDomain } from './usernamesLogic';

/** Synk toppnivå "parents" med innlogget bruker. */
export async function syncParentDocs(user) {
  try {
    if (!user) return;
    await user.reload();
    const email = (user.email || '').toLowerCase();
    const isVerified = !!user.emailVerified;
    const nextStatus = isVerified ? 'active' : 'invited';

    const byUid = await getDocs(query(collection(db, 'parents'), where('uid', '==', user.uid)));
    const seen = new Set(byUid.docs.map((d) => d.id));

    // Andres profiler med samme e-post kan ikke leses; da synkes bare egen profil.
    const extraByEmail = email
      ? await getDocs(query(collection(db, 'parents'), where('email', '==', email))).catch(() => ({ docs: [] }))
      : { docs: [] };

    const allDocs = [...byUid.docs, ...extraByEmail.docs.filter((d) => !seen.has(d.id))];

    await Promise.all(
      allDocs.map((d) => {
        const cur = d.data() || {};
        const same = cur.uid === user.uid
          && String(cur.email || '').toLowerCase() === email
          && !!cur.emailVerified === isVerified
          && String(cur.status || '') === nextStatus;
        if (same) return Promise.resolve();
        return updateDoc(d.ref, {
          uid: user.uid,
          email,
          emailVerified: isVerified,
          status: nextStatus,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }),
    );
  } catch {
    // ignorer – påvirker ikke rutevalg
  }
}

/**
 * collectionGroup('children') tar også med speilet i rot-samlingen children/{uid}.
 * Bare treff under families/{id}/children forteller hvilken familie barnet hører til.
 */
function familyChildRef(snap) {
  const hit = (snap?.docs || []).find((row) => row.ref.parent.parent);
  return hit ? hit.ref : null;
}

/** Finn familyId for barnet via collectionGroup('children'). */
export async function resolveChildFamilyId(childLike) {
  try {
    if (childLike?.uid) {
      const snap = await getDocs(
        query(collectionGroup(db, 'children'), where('uid', '==', childLike.uid))
      );
      const ref = familyChildRef(snap);
      if (ref) return { familyId: ref.parent.parent.id, childIdFromFam: ref.id };
    }
    if (childLike?.username) {
      const snap = await getDocs(
        query(collectionGroup(db, 'children'), where('username', '==', childLike.username))
      );
      const ref = familyChildRef(snap);
      if (ref) return { familyId: ref.parent.parent.id, childIdFromFam: ref.id };
    }
    return { familyId: null, childIdFromFam: null };
  } catch (e) {
    console.warn('Klarte ikke å løse familyId for barn:', e);
    return { familyId: null, childIdFromFam: null };
  }
}

export function isChildEmail(email) {
  return isSyntheticEmail(email);
}

function usernameFromChildEmail(email) {
  return stripSyntheticDomain(String(email || '').toLowerCase());
}

/** Slå opp barnprofil etter innlogging (uid, brukernavn eller e-post). */
export async function resolveChildProfile(user) {
  if (!user?.uid) return null;
  const uid = user.uid;
  const email = (user.email || '').toLowerCase();
  const uname = usernameFromChildEmail(email);

  const pick = (d) => ({ id: d.id, ...d.data() });

  try {
    const byUid = await getDocs(query(collection(db, 'children'), where('uid', '==', uid)));
    if (!byUid.empty) return pick(byUid.docs[0]);
  } catch { /* ignore */ }

  try {
    const cg = await getDocs(query(collectionGroup(db, 'children'), where('uid', '==', uid)));
    const ref = familyChildRef(cg);
    if (ref) {
      const d = cg.docs.find((row) => row.ref.path === ref.path);
      return { id: d.id, ...d.data(), familyId: ref.parent.parent.id };
    }
  } catch { /* ignore */ }

  if (uname) {
    try {
      const byUser = await getDocs(query(collection(db, 'children'), where('username', '==', uname)));
      if (!byUser.empty) return pick(byUser.docs[0]);
    } catch { /* ignore */ }
    try {
      const byLower = await getDocs(query(collection(db, 'children'), where('usernameLower', '==', uname)));
      if (!byLower.empty) return pick(byLower.docs[0]);
    } catch { /* ignore */ }
  }

  if (email) {
    try {
      const byEmail = await getDocs(query(collection(db, 'children'), where('usernameEmail', '==', email)));
      if (!byEmail.empty) return pick(byEmail.docs[0]);
    } catch { /* ignore */ }
  }

  return null;
}
