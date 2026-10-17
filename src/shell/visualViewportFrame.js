/**
 * Phone browsers size the layout viewport taller than the area between
 * the address bar and the bottom toolbar. position:fixed; bottom:0 then
 * sits on the layout edge, so the menu floats above the toolbar, and the
 * document itself scrolls the header away.
 * The visible frame is visualViewport.
 */

export function visualViewportFrame(viewport, innerHeight) {
  const fallback = Math.max(0, Math.round(Number(innerHeight) || 0));
  const rawHeight = Number(viewport?.height);
  const height = Math.max(0, Math.round(Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : fallback));
  const top = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  return { top, height: height || fallback };
}

export function applyVisualViewportFrame(doc, frame) {
  const root = doc?.documentElement;
  if (!root?.style || !frame) return;
  root.style.setProperty('--protop-vv-top', `${frame.top}px`);
  root.style.setProperty('--protop-vv-height', `${Math.max(0, frame.height)}px`);
}
