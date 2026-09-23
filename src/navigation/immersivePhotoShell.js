/**
 * Phone photo chrome: full-bleed home banner behind glass widgets.
 * Parent and child profiles share the same look. Barnevennlig høy
 * (simpleChildUi) keeps the simpler cream home without photo overlay.
 * Home always; Mer hub (no subview) so +mer opens the same photo dashboard.
 */

export function isImmersivePhotoShell({
  isPhone = false,
  tab = 'home',
  moreSubView = null,
  isParent = false,
  asChildView = false,
  kitchenMode = false,
  simpleChildUi = false,
} = {}) {
  if (!isPhone || kitchenMode || simpleChildUi) return false;
  if (!asChildView && !isParent) return false;
  if (tab === 'home') return true;
  if (tab === 'more' && !moreSubView) return true;
  return false;
}

/** Logo-only top chrome (no page title) — home and the modules photo board. */
export function isImmersivePhotoChromeOnly({
  isPhone = false,
  tab = 'home',
  moreSubView = null,
  isParent = false,
  asChildView = false,
  simpleChildUi = false,
} = {}) {
  if (!isPhone || simpleChildUi) return false;
  if (tab === 'home') return true;
  if (tab === 'more' && !moreSubView && (isParent || asChildView)) return true;
  return false;
}
