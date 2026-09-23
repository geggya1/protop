/**
 * Deploy / release news for the Help portal.
 * Canonical data lives in appUpdates.js (day-level, major vs fix).
 */

import {
  APP_UPDATES,
  formatUpdateDate,
  listAppUpdates,
  pickUpdateText,
} from './appUpdates';

/** @deprecated Prefer APP_UPDATES — kept for older imports. */
export const HELP_NEWS = APP_UPDATES;

export const pickNewsText = pickUpdateText;
export const formatNewsDate = formatUpdateDate;

export function listHelpNews({ lang = 'nb', limit = 20, level = null } = {}) {
  return listAppUpdates({ lang, limit, level });
}
