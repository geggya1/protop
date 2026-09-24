/**
 * Handletur (shopping session) + butikk-hyllerekkefølge.
 * Session-felt lagres på list-dokumentet.
 */

import { updateList } from './shoppingLists.js';
import { SHOPPING_CATEGORY_KEYS, AISLE_ORDER } from './groceryCategory.js';

export { AISLE_ORDER } from './groceryCategory.js';

export function aisleSortIndex(category) {
  const i = AISLE_ORDER.indexOf(category || 'general');
  return i >= 0 ? i : AISLE_ORDER.length;
}

/** Sorter åpne varer etter hyllerekkefølge; ferdig nederst. */
export function sortItemsForSession(items = []) {
  return [...(items || [])].sort((a, b) => {
    const aDone = a.done ? 1 : 0;
    const bDone = b.done ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    const ai = aisleSortIndex(a.category);
    const bi = aisleSortIndex(b.category);
    if (ai !== bi) return ai - bi;
    return String(a.title || '').localeCompare(String(b.title || ''), 'nb');
  });
}

export function isSessionActive(list) {
  return !!(list?.sessionActive && list?.sessionStartedAt);
}

export async function startShoppingSession(scope, { storeId = null, uid = null } = {}) {
  if (!scope) return;
  await updateList(scope, {
    sessionActive: true,
    sessionStartedAt: new Date().toISOString(),
    sessionStoreId: storeId || null,
    sessionStartedBy: uid || null,
    sessionReceiptUrl: null,
    sessionReceiptNote: null,
    sessionEndedAt: null,
  });
}

export async function endShoppingSession(scope, extra = {}) {
  if (!scope) return;
  await updateList(scope, {
    sessionActive: false,
    sessionEndedAt: new Date().toISOString(),
    ...extra,
  });
}

export async function attachSessionReceipt(scope, { imageUrl, note = '' } = {}) {
  if (!scope || !imageUrl) return;
  await updateList(scope, {
    sessionReceiptUrl: imageUrl,
    sessionReceiptNote: String(note || '').trim() || null,
  });
}

export function sessionStats(items = []) {
  const active = (items || []).filter((i) => !i.deleted);
  const open = active.filter((i) => !i.done).length;
  const done = active.filter((i) => i.done).length;
  return { open, done, total: active.length };
}

export function knownAisleCategories() {
  return AISLE_ORDER.filter((k) => SHOPPING_CATEGORY_KEYS.includes(k));
}
