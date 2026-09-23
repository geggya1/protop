/**
 * In-app version + day-level changelog.
 *
 * Marketing version is MAJOR.0.0 (bumped only for major releases).
 * Everyday fixes stay on the same major and appear in the day-level list
 * without notifying users. Only `level: 'major'` triggers a one-shot modal.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import {
  formatMajorVersion,
  formatUpdateDate,
  getAppMajor,
  groupUpdatesByDay,
  latestMajorUpdateForVersion as latestMajorFromList,
  localizeUpdates,
  majorNotifyDecision,
  parseSemver,
  pickUpdateText,
} from './appUpdatesLogic';

const T = (nb, en) => ({ nb, en });

export const APP_VERSION_FALLBACK = '2.0.0';
export const MAJOR_SEEN_PREFIX = 'weekplan.appUpdates.majorSeen.v1';

export {
  formatMajorVersion,
  formatUpdateDate,
  getAppMajor,
  groupUpdatesByDay,
  majorNotifyDecision,
  parseSemver,
  pickUpdateText,
};

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

/** Marketing version from Expo config (MAJOR.0.0). */
export function getAppVersion() {
  return Constants.expoConfig?.version || APP_VERSION_FALLBACK;
}

export function majorSeenKey(uid) {
  return `${MAJOR_SEEN_PREFIX}.${uid || 'anon'}`;
}

export async function loadSeenMajor(uid) {
  try {
    const raw = await AsyncStorage.getItem(majorSeenKey(uid));
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export async function saveSeenMajor(uid, major) {
  try {
    await AsyncStorage.setItem(majorSeenKey(uid), String(Math.max(0, Number(major) || 0)));
  } catch { /* ignore */ }
}

export function listAppUpdates({ lang = 'nb', limit = 40, level = null } = {}) {
  return localizeUpdates(APP_UPDATES, { lang, limit, level });
}

export function latestMajorUpdateForVersion(version = getAppVersion()) {
  return latestMajorFromList(APP_UPDATES, version);
}

/**
 * Decide whether to show the major-update popup.
 * First launch seeds seen-major without notifying.
 */
export async function resolveMajorUpdatePrompt(uid, version = getAppVersion()) {
  const currentMajor = getAppMajor(version);
  if (!uid) {
    return { shouldNotify: false, update: null, currentMajor };
  }
  const seen = await loadSeenMajor(uid);
  const decision = majorNotifyDecision(seen, currentMajor);
  if (decision === 'seed') {
    await saveSeenMajor(uid, currentMajor);
    return { shouldNotify: false, update: null, currentMajor, seeded: true };
  }
  if (decision === 'none') {
    return { shouldNotify: false, update: null, currentMajor, seenMajor: seen };
  }
  const raw = latestMajorUpdateForVersion(version);
  const update = raw ? {
    id: raw.id,
    date: raw.date,
    level: 'major',
    version: raw.version || formatMajorVersion(currentMajor),
    title: raw.title,
    summary: raw.summary,
  } : {
    id: `major-${currentMajor}`,
    date: new Date().toISOString().slice(0, 10),
    level: 'major',
    version: formatMajorVersion(currentMajor),
    title: T(`ProTop ${currentMajor}.0`, `ProTop ${currentMajor}.0`),
    summary: T(
      'En større oppdatering er klar. Se hva som er nytt.',
      'A major update is ready. See what’s new.',
    ),
  };
  return {
    shouldNotify: true,
    update,
    currentMajor,
    seenMajor: seen,
  };
}

export async function acknowledgeMajorUpdate(uid, version = getAppVersion()) {
  await saveSeenMajor(uid, getAppMajor(version));
}
