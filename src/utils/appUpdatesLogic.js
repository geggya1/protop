/**
 * Pure helpers for marketing version + day-level changelog (no RN deps).
 */

export function parseSemver(version) {
  const raw = String(version || '').trim();
  const m = raw.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return { major: 0, minor: 0, patch: 0, raw };
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    raw,
  };
}

export function formatMajorVersion(major) {
  const n = Math.max(0, Number(major) || 0);
  return `${n}.0.0`;
}

export function getAppMajor(version) {
  return parseSemver(version).major;
}

/**
 * @param {number|null|undefined} seenMajor
 * @param {number} currentMajor
 * @returns {'seed'|'notify'|'none'}
 */
export function majorNotifyDecision(seenMajor, currentMajor) {
  const current = Math.max(0, Number(currentMajor) || 0);
  if (current < 1) return 'none';
  if (seenMajor == null || seenMajor === '') return 'seed';
  const seen = Number(seenMajor);
  if (!Number.isFinite(seen)) return 'seed';
  if (current > seen) return 'notify';
  return 'none';
}

/** Group consecutive same-day entries under one day heading (input newest-first). */
export function groupUpdatesByDay(updates = []) {
  const groups = [];
  const byDate = new Map();
  updates.forEach((u) => {
    const key = u.date || '';
    if (!byDate.has(key)) {
      const group = { date: key, items: [] };
      byDate.set(key, group);
      groups.push(group);
    }
    byDate.get(key).items.push(u);
  });
  return groups;
}

export function pickUpdateText(value, lang = 'nb') {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (value[lang]) return value[lang];
  if ((lang === 'da' || lang === 'sv') && value.nb) return value.nb;
  return value.en || value.nb || '';
}

export function formatUpdateDate(iso, lang = 'nb') {
  try {
    const d = new Date(`${iso}T12:00:00`);
    const locale = lang === 'en' ? 'en-GB' : 'nb-NO';
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

export function latestMajorUpdateForVersion(updates, version) {
  const major = getAppMajor(version);
  return (updates || []).find((n) => (
    n.level === 'major'
    && getAppMajor(n.version || '0.0.0') <= major
  )) || null;
}

export function localizeUpdates(updates, { lang = 'nb', limit = 40, level = null } = {}) {
  return (updates || [])
    .filter((n) => (level ? n.level === level : true))
    .slice(0, limit)
    .map((n) => ({
      id: n.id,
      date: n.date,
      level: n.level === 'major' ? 'major' : 'fix',
      version: n.version || null,
      title: pickUpdateText(n.title, lang),
      summary: pickUpdateText(n.summary, lang),
      modules: n.modules || [],
      tags: n.tags || [],
    }));
}
