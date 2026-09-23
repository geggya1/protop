/**
 * Pure helpers for klasseliste OCR → kontakter (no Firebase deps).
 */

function cleanStr(v, max = 200) {
  return String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

const KIND_MAP = {
  student: 'student',
  elev: 'student',
  pupil: 'student',
  guardian: 'guardian',
  foresatt: 'guardian',
  parent: 'guardian',
  teacher: 'teacher',
  lærer: 'teacher',
  laerer: 'teacher',
};

/**
 * @param {unknown} raw
 */
export function normalizeClassListContacts(raw) {
  const list = Array.isArray(raw?.contacts) ? raw.contacts : (Array.isArray(raw) ? raw : []);
  const contacts = [];
  const seen = new Set();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const name = cleanStr(row.name, 120);
    if (!name || name.length < 2) continue;
    const kindRaw = cleanStr(row.kind || row.type || 'student', 40).toLowerCase();
    const kind = KIND_MAP[kindRaw] || (kindRaw.includes('lær') || kindRaw.includes('teach')
      ? 'teacher'
      : kindRaw.includes('fore') || kindRaw.includes('guard') || kindRaw.includes('parent')
        ? 'guardian'
        : 'student');
    const phone = cleanStr(row.phone || row.telefon || row.mobile, 40);
    const email = cleanStr(row.email || row.epost, 120).toLowerCase();
    const roleTitle = cleanStr(row.roleTitle || row.role || row.title, 80);
    const linkedStudentName = cleanStr(row.linkedStudentName || row.studentName || row.elev, 120);
    const notes = cleanStr(row.notes || row.note, 200);
    const key = `${kind}|${name.toLowerCase()}|${phone}|${email}`;
    if (seen.has(key)) continue;
    seen.add(key);
    contacts.push({
      kind,
      name,
      phone: phone || '',
      email: email || '',
      roleTitle: roleTitle || '',
      linkedStudentName: linkedStudentName || '',
      notes: notes || '',
    });
    if (contacts.length >= 80) break;
  }
  return {
    className: cleanStr(raw?.className || raw?.class || '', 80),
    schoolName: cleanStr(raw?.schoolName || raw?.school || '', 120),
    contacts,
    summary: cleanStr(raw?.summary, 240),
    confidence: Math.max(0, Math.min(1, Number(raw?.confidence) || 0)),
  };
}
