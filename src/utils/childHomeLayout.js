/**
 * Child home layout migrations — pure helpers (no AsyncStorage).
 */

import { DEFAULT_HOME_LOOK, widgetsForLook, normalizeWidgets } from '../homeWidgetCatalog.js';
import { normalizePlacement } from '../homeGrid.js';

/** All ids a child profile may have been saved under. */
export function childHomeStorageAliases(child) {
  if (!child || typeof child !== 'object') return [];
  return [...new Set(
    [child.id, child.uid, child.childId, child.docId]
      .map((v) => (v == null ? '' : String(v).trim()))
      .filter(Boolean),
  )];
}

/** Preferred storage key id for a child profile. */
export function childHomeStorageId(child) {
  const aliases = childHomeStorageAliases(child);
  if (!aliases.length) return null;
  // Prefer Firestore doc id when present (same order as ChildHomeScreen / AppShell).
  if (child?.id) return String(child.id);
  return aliases[0];
}

/** True when child home still uses the old half-width chores card. */
export function childChoresLayoutIsStale(widgets) {
  const list = widgets || [];
  const tasks = list.find((w) => w?.type === 'tasks');
  if (!tasks) {
    // No chores card at all on a board that still has the old packed look.
    return list.some((w) => w?.type === 'timeline') && list.length > 0 && list.length <= 4;
  }
  const { gw } = normalizePlacement(tasks);
  // Full-width chores are current; only half-width cards need upgrade.
  return gw < 5;
}

/**
 * Ensure dagens gjøremål is full-width on child homes.
 * Always prefer the canonical child template when the board still looks like
 * the pre-#717 half-width chores + homework pack (or chores alone at gw≤2).
 */
export function upgradeChildChoresLayout(widgets, lookId = DEFAULT_HOME_LOOK) {
  const list = Array.isArray(widgets) ? widgets : [];
  if (!childChoresLayoutIsStale(list)) return list;

  const tasks = list.find((w) => w?.type === 'tasks');
  const homework = list.find((w) => w?.type === 'homework');
  const narrowTasks = tasks && Number(tasks.gw) <= 2;
  const sideBySide = tasks && homework
    && Number(tasks.gw) <= 2
    && Number(homework.col) >= 2
    && Number(tasks.row) === Number(homework.row);

  // Old default / lightly customized boards → full canonical reset.
  if (!tasks || narrowTasks || sideBySide || list.length <= 6) {
    return widgetsForLook(lookId, 'child');
  }

  return normalizeWidgets(
    list.map((w) => (
      w?.type === 'tasks'
        ? { ...w, col: 0, gw: 5, gh: 2 }
        : w
    )),
    'child',
  );
}
