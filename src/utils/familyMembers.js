import { collection, getDocs, query, where } from 'firebase/firestore';

/**
 * Les aktive foresatte + barn for en familie (deduplisert på uid).
 */
export async function readFamilyMembers(db, familyId) {
  const members = [];
  if (!familyId || !db) return members;

  try {
    const parentsRef = collection(db, 'families', familyId, 'parents');
    const parentsSnap = await getDocs(parentsRef);
    let rawParents = parentsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

    if (rawParents.length === 0) {
      try {
        const legacyQ = query(collection(db, 'parents'), where('familyId', '==', familyId));
        const legacySnap = await getDocs(legacyQ);
        rawParents = legacySnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
      } catch {}
    }

for (const p of rawParents) {
      if (p.deleted === true) continue;
      if (p.active === false) continue;
      const uid = p.uid || null;
      if (!uid) continue;
      const isGp = p.adultRole === 'grandparent' || p.isGrandparent === true;
      members.push({
        uid,
        role: 'parent',
        adultRole: isGp ? 'grandparent' : 'parent',
        isGrandparent: isGp,
        name: p.name || p.displayName || p.email || (isGp ? 'Besteforeldre' : 'Foresatt'),
      });
    }
  } catch {}

  try {
    const childrenRef = collection(db, 'families', familyId, 'children');
    const childrenSnap = await getDocs(childrenRef);
    const rawChildren = childrenSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    for (const c of rawChildren) {
      if (c.deleted === true) continue;
      if (c.active === false) continue;
      const uid = c.uid || c.id || c.childId || null;
      if (!uid) continue;
      members.push({
        uid,
        role: 'child',
        name: c.name || 'Barn',
      });
    }
  } catch {}

  const byUid = new Map();
  for (const m of members) {
    if (!byUid.has(m.uid)) byUid.set(m.uid, m);
  }
  return Array.from(byUid.values());
}
