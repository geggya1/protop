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
  APP_UPDATES,
  formatMajorVersion,
  formatUpdateDate,
  getAppMajor,
  groupUpdatesByDay,
  latestMajorUpdateForVersion as latestMajorFromList,
  listAppUpdates,
  majorNotifyDecision,
  parseSemver,
  pickUpdateText,
} from './appUpdatesLogic.js';

const T = (nb, en) => ({ nb, en });

export const APP_VERSION_FALLBACK = '2.0.0';
export const MAJOR_SEEN_PREFIX = 'protop.appUpdates.majorSeen.v1';

export {
  APP_UPDATES,
  formatMajorVersion,
  formatUpdateDate,
  getAppMajor,
  groupUpdatesByDay,
  listAppUpdates,
  majorNotifyDecision,
  parseSemver,
  pickUpdateText,
};

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
