/** Fallback when overlays sit in NavigationContainer but not inside a screen. */
export const SESSION_OVERLAY_ROUTE = Object.freeze({
  key: 'session-overlays',
  name: 'Home',
  params: {},
});

function asRoute(value) {
  if (!value || typeof value !== 'object') return null;
  const name = typeof value.name === 'string' ? value.name : '';
  if (!name) return null;
  return {
    key: typeof value.key === 'string' && value.key ? value.key : `session-${name}`,
    name,
    params: value.params && typeof value.params === 'object' ? value.params : {},
  };
}

/** Best-effort route object for useRoute() consumers mounted beside the stack. */
export function routeFromNavigation(nav) {
  try {
    if (typeof nav?.getCurrentRoute === 'function') {
      const current = asRoute(nav.getCurrentRoute());
      if (current) return current;
    }
    if (typeof nav?.getState === 'function') {
      const state = nav.getState();
      const focused = state?.routes?.[state.index];
      const fromState = asRoute(focused);
      if (fromState) return fromState;
    }
  } catch {
    /* overlay must still mount */
  }
  return SESSION_OVERLAY_ROUTE;
}
