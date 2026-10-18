/**
 * Phone browsers size the layout viewport taller than the area between
 * the address bar and the bottom toolbar. position:fixed; bottom:0 then
 * sits on the layout edge, so the menu floats above the toolbar, and the
 * document itself scrolls the header away.
 *
 * top/bottom are the bands Safari covers. The shell includes them so our
 * header and bottom menu paint that space. height is the visible middle.
 */

export function visualViewportFrame(viewport, innerHeight) {
  const layout = Math.max(0, Math.round(Number(innerHeight) || 0));
  const rawHeight = Number(viewport?.height);
  const height = Math.max(0, Math.round(Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : layout));
  const top = Math.max(0, Math.round(Number(viewport?.offsetTop) || 0));
  const bottom = Math.max(0, layout - height - top);
  return { top, height: height || layout, bottom };
}

const EMPTY_FRAME = { top: 0, height: 0, bottom: 0 };
let currentFrame = EMPTY_FRAME;
const listeners = new Set();

export function emptyVisualViewportFrame() {
  return EMPTY_FRAME;
}

export function getVisualViewportFrame() {
  return currentFrame;
}

export function subscribeVisualViewportFrame(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function publishVisualViewportFrame(frame) {
  currentFrame = frame || EMPTY_FRAME;
  listeners.forEach((listener) => listener());
}

export function applyVisualViewportFrame(doc, frame) {
  const root = doc?.documentElement;
  if (!root?.style || !frame) return;
  root.style.setProperty('--protop-vv-top', `${Math.max(0, frame.top)}px`);
  root.style.setProperty('--protop-vv-height', `${Math.max(0, frame.height)}px`);
  root.style.setProperty('--protop-vv-bottom', `${Math.max(0, frame.bottom)}px`);
}
