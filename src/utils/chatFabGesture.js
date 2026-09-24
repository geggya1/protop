/** Max pointer travel (px) that still counts as a tap on the floating chat button. */
export const CHAT_FAB_TAP_SLOP = 12;
/** Android/iOS touch jitter is larger than mouse — keep taps from becoming drags. */
export const CHAT_FAB_TOUCH_SLOP = 28;

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function firstFiniteOrNull(...values) {
  for (const value of values) {
    if (isFiniteNumber(value)) return value;
    if (typeof value === 'string' && value !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }
  return null;
}

/**
 * Read client coordinates from a DOM PointerEvent, TouchEvent, or RN nativeEvent.
 * RN Web / Android Chrome often omit clientX — treating that as 0 made every tap
 * look like a huge drag, so the FAB moved and never opened chat.
 */
export function pointerClientPoint(event) {
  if (!event) return { x: 0, y: 0, valid: false };
  const ne = event.nativeEvent && typeof event.nativeEvent === 'object'
    ? event.nativeEvent
    : null;
  const nativeHasPoint = !!(ne && (
    isFiniteNumber(ne.clientX) || isFiniteNumber(ne.pageX)
    || ne.touches?.length || ne.changedTouches?.length
  ));
  const src = nativeHasPoint ? ne : event;
  const touch = src.touches?.[0] || src.changedTouches?.[0] || null;
  const x = firstFiniteOrNull(src.clientX, src.pageX, touch?.clientX, touch?.pageX);
  const y = firstFiniteOrNull(src.clientY, src.pageY, touch?.clientY, touch?.pageY);
  if (x == null || y == null) return { x: 0, y: 0, valid: false };
  return { x, y, valid: true };
}

export function chatFabSlopForPointerType(pointerType) {
  return pointerType === 'touch' || pointerType === 'pen'
    ? CHAT_FAB_TOUCH_SLOP
    : CHAT_FAB_TAP_SLOP;
}

export function isChatFabDrag(dx, dy, slop = CHAT_FAB_TAP_SLOP) {
  return Math.abs(Number(dx) || 0) > slop || Math.abs(Number(dy) || 0) > slop;
}

/** A press opens chat; a drag must not. */
export function shouldOpenChatOnFabRelease({ moved } = {}) {
  return !moved;
}
