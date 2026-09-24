/**
 * Pure helpers for calendar event sharing with family + friends.
 * Kept free of Firebase so unit tests can import without stubs.
 */

/** First name (or full fallback) for a roster person. */
export function personFirstName(person) {
  const raw = (person?.name || '').trim();
  if (!raw) return 'Ukjent';
  return raw.split(/\s+/)[0] || raw;
}

/** Family member pick-ids (uid / id / childId). */
export function familyIdSet(members = []) {
  const set = new Set();
  (members || []).forEach((m) => {
    [m?.uid, m?.id, m?.childId, m?.docId].filter(Boolean).forEach((id) => set.add(id));
  });
  return set;
}

/** Friend UIDs in picked that are not family members and not the owner. */
export function friendUidsFromPicked(picked = [], { members = [], ownerUid } = {}) {
  const family = familyIdSet(members);
  return [...new Set((picked || []).filter(Boolean))]
    .filter((id) => id !== ownerUid && !family.has(id));
}

/**
 * Resolve memberIds against family roster + optional friends.
 * Friends are tagged with role:'friend' when matched from friendPeople.
 */
export function resolveEventPeople(members, memberIds, friendPeople = []) {
  const ids = Array.isArray(memberIds) ? memberIds.filter(Boolean) : [];
  if (!ids.length) return [];
  const roster = members || [];
  const friends = friendPeople || [];
  const out = [];
  const seen = new Set();
  ids.forEach((id) => {
    const m = roster.find((x) => (
      x.uid === id || x.id === id || x.childId === id || x.docId === id
    ));
    if (m) {
      const key = m.uid || m.id || m.childId || id;
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push(m);
      }
      return;
    }
    const f = friends.find((x) => x.uid === id || x.friendUid === id || x.id === id);
    if (f) {
      const key = f.uid || f.friendUid || f.id || id;
      if (key && !seen.has(key)) {
        seen.add(key);
        out.push({
          ...f,
          uid: f.uid || f.friendUid || f.id,
          name: f.name,
          role: 'friend',
        });
      }
    }
  });
  return out;
}

/**
 * Label under event rows: "Geir, Eli" including friends.
 * Falls back to count when names cannot be resolved.
 */
export function whoVisibilityLabel(memberIds, audience, members, friendPeople = []) {
  if (audience === 'family') return 'Hele familien';

  const people = resolveEventPeople(members, memberIds, friendPeople);
  if (people.length) {
    return people.map((m) => {
      const first = personFirstName(m);
      return m.role === 'friend' ? `${first} (venn)` : first;
    }).join(', ');
  }

  if (audience === 'selected') {
    const n = Array.isArray(memberIds) ? memberIds.filter(Boolean).length : 0;
    if (!n) return '1 person';
    return n === 1 ? '1 person' : `${n} personer`;
  }
  if (!Array.isArray(memberIds) || !memberIds.filter(Boolean).length) return 'Hele familien';
  const n = memberIds.filter(Boolean).length;
  return n === 1 ? '1 person' : `${n} personer`;
}

/**
 * Form summary: "Synlig for: Geir, Eli".
 * Includes selected friends (first name).
 */
export function synligForSummary({
  wholeFamily,
  picked = [],
  members = [],
  friendPeople = [],
} = {}) {
  if (wholeFamily) return 'Synlig for: hele familien';
  const ids = [...new Set((picked || []).filter(Boolean))];
  const people = resolveEventPeople(members, ids, friendPeople);
  if (!people.length) return 'Synlig for: deg';
  const names = people.map((m) => personFirstName(m));
  return `Synlig for: ${names.join(', ')}`;
}
