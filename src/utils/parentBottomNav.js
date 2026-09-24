/**
 * Shared parent/child mobile bottom-nav helpers.
 * The dock is always available when shortcuts exist — not tied to a layout theme.
 * AppShell keeps that same bar on every family module tab.
 */

export const PARENT_BOTTOM_NAV_CONTENT_HEIGHT = 60;

const BUILTIN_ACTIONS = {
  home: { type: 'tab', tab: 'home' },
  projects: { type: 'tab', tab: 'projects' },
  more: { type: 'tab', tab: 'more' },
  family: { type: 'tab', tab: 'more', subView: 'members' },
  plan: { type: 'tab', tab: 'plan' },
  stars: { type: 'tab', tab: 'stars' },
  chores: { type: 'tab', tab: 'chores' },
  chat: { type: 'tab', tab: 'chat' },
  mail: { type: 'tab', tab: 'mail' },
  notes: { type: 'tab', tab: 'notes' },
  friends: { type: 'tab', tab: 'more', subView: 'friends' },
  shop: { type: 'tab', tab: 'more', subView: 'shop' },
  meals: { type: 'tab', tab: 'more', subView: 'meals' },
};

/** Which shortcut should look selected for the current shell tab. */
export function resolveActiveParentBottomId(tab, moreSubView, ids = []) {
  const idSet = new Set(ids || []);
  if (!idSet.size) return null;
  const sub = moreSubView || null;

  if (tab === 'home' && idSet.has('home')) return 'home';
  if (tab === 'projects' && idSet.has('projects')) return 'projects';
  if (tab === 'plan' && idSet.has('plan')) return 'plan';
  if (tab === 'stars' && idSet.has('stars')) return 'stars';
  if (tab === 'chat' && idSet.has('chat')) return 'chat';
  if (tab === 'mail' && idSet.has('mail')) return 'mail';
  if (tab === 'notes' && idSet.has('notes')) return 'notes';
  if (tab === 'chores' && idSet.has('chores')) return 'chores';

  if (tab === 'more') {
    if (sub && idSet.has(sub)) return sub;
    if ((sub === 'members' || sub === 'addMember') && idSet.has('family')) return 'family';
    if (idSet.has('more')) return 'more';
  }

  if (idSet.has(tab)) return tab;
  if (idSet.has('more')) return 'more';
  return null;
}

/** Normalize a bottom-nav tap to a shell/nav action. */
export function resolveParentBottomNavAction(item, appById = {}) {
  if (!item) return null;
  if (item.id && BUILTIN_ACTIONS[item.id] && !item.action) {
    return { ...BUILTIN_ACTIONS[item.id] };
  }
  const action = item.action || appById[item.id]?.action;
  if (action?.type === 'tab') {
    return { type: 'tab', tab: action.tab, subView: action.subView || null };
  }
  if (action?.type === 'nav') {
    return { type: 'nav', screen: action.screen, params: action.params };
  }
  if (item.id && BUILTIN_ACTIONS[item.id]) return { ...BUILTIN_ACTIONS[item.id] };
  return null;
}

export function shouldShowParentBottomNav({
  ready = false,
  theme = null,
  bottomShortcutIds = [],
  isParent = false,
  asChildView = false,
  hasRail = false,
  kitchenMode = false,
  bottomNavEnabled = true,
} = {}) {
  return !!(
    ready
    && (asChildView || isParent)
    && !hasRail
    && !kitchenMode
    && bottomNavEnabled !== false
    && Array.isArray(bottomShortcutIds)
    && bottomShortcutIds.length > 0
  );
}

let chromeHeight = 0;
const chromeListeners = new Set();

export function getParentBottomNavChromeHeight() {
  return chromeHeight;
}

export function setParentBottomNavChromeHeight(height) {
  const next = Math.max(0, Math.round(Number(height) || 0));
  if (next === chromeHeight) return;
  chromeHeight = next;
  chromeListeners.forEach((fn) => {
    try { fn(chromeHeight); } catch { /* ignore */ }
  });
}

export function subscribeParentBottomNavChrome(listener) {
  if (typeof listener !== 'function') return () => {};
  chromeListeners.add(listener);
  return () => chromeListeners.delete(listener);
}
