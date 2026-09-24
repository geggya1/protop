/** Pure helpers for Klassen — no Firebase imports (testable). */

export const CONTACT_KINDS = {
  student: 'student',
  guardian: 'guardian',
  teacher: 'teacher',
};

export const CONTACT_KIND_LABELS = {
  student: 'Elev',
  guardian: 'Foresatt',
  teacher: 'Lærer',
};

export function klassenChatId(classId) {
  return `klassen_${classId}`;
}

export function canManageKlassen({ isParent, isChild, isAdmin } = {}) {
  if (isChild) return false;
  return !!(isParent || isAdmin);
}

export function normalizePlace(place) {
  if (!place || typeof place !== 'object') return null;
  const label = String(place.label || place.name || '').trim();
  if (!label) return null;
  const lat = Number(place.lat);
  const lng = Number(place.lng);
  return {
    label,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    placeId: place.placeId || null,
  };
}

export function classDisplayTitle(klass) {
  const name = String(klass?.name || '').trim();
  const school = String(klass?.schoolName || '').trim();
  if (name && school) return `${name} · ${school}`;
  return name || school || 'Klasse';
}

export function filterKlassenForChild(list, childId) {
  const rows = Array.isArray(list) ? list : [];
  if (!childId) return rows;
  return rows.filter((k) => {
    const ids = Array.isArray(k.childIds) ? k.childIds : [];
    if (!ids.length) return true;
    return ids.includes(childId);
  });
}

export function sortContacts(list) {
  const order = { student: 0, guardian: 1, teacher: 2 };
  return [...(list || [])].sort((a, b) => {
    const ka = order[a.kind] ?? 9;
    const kb = order[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    return String(a.name || '').localeCompare(String(b.name || ''), 'nb');
  });
}

export function tsMs(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v?.seconds === 'number') return v.seconds * 1000;
  return 0;
}
