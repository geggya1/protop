/**
 * Pure helpers for marketing version + day-level changelog (no RN deps).
 */

const T = (nb, en) => ({ nb, en });

/**
 * Newest first. Dates are calendar days (YYYY-MM-DD) — never clock times.
 * - level 'major': bumps marketing version; users get a one-shot popup
 * - level 'fix': silent day note (bugfix / polish)
 */
export const APP_UPDATES = [
  {
    id: '2026-09-16-help-portal',
    date: '2026-09-16',
    level: 'fix',
    title: T('Hjelp & support-portal', 'Help & support portal'),
    summary: T(
      'Ny hjelpeside med søk, modulartikler, Skjetten-boten, support-saker med saksnummer, og nyheter etter deploy.',
      'New help centre with search, module articles, Skjetten bot, support tickets with ticket numbers, and post-deploy news.',
    ),
    modules: ['settings', 'support', 'ai'],
    tags: ['hjelp', 'support', 'ai'],
  },
  {
    id: '2026-09-10-module-intros',
    date: '2026-09-10',
    level: 'fix',
    title: T('Lyspære-guider for flere moduler', 'Lightbulb guides for more modules'),
    summary: T(
      'Flere sider har korte introkort og steg-for-steg bak lyspæren.',
      'More pages have short intro cards and step-by-step help behind the lightbulb.',
    ),
    modules: ['home', 'plan', 'stars'],
    tags: ['lyspære', 'guide'],
  },
  {
    id: '2026-09-01-ai-chat',
    date: '2026-09-01',
    level: 'fix',
    title: T('AI-chat med trådhistorikk', 'AI chat with thread history'),
    summary: T(
      'Spør AI husker samtaler, og foresatte får rikere svar om planlegging og hverdag.',
      'Ask AI remembers threads, and parents get richer answers about planning and everyday life.',
    ),
    modules: ['ai'],
    tags: ['ai', 'chat'],
  },
  {
    id: '2026-08-01-v2',
    date: '2026-08-01',
    level: 'major',
    version: '2.0.0',
    title: T('ProTop 2.0', 'ProTop 2.0'),
    summary: T(
      'Ny app med hjem, plan, oppgaver, handleliste og familieverkøy samlet på ett sted.',
      'New app with home, plan, tasks, shopping list and family tools in one place.',
    ),
    modules: ['home', 'plan', 'stars', 'shop'],
    tags: ['major', 'versjon'],
  },
];

export function listAppUpdates({ lang = 'nb', limit = 40, level = null } = {}) {
  return localizeUpdates(APP_UPDATES, { lang, limit, level });
}

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
