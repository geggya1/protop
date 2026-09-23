/**
 * Ignore pointer events that opened a newly mounted overlay.
 * On web, the mouseup/click that opened a module often lands on the new
 * backdrop and would otherwise close the dialog immediately.
 */
export const OVERLAY_DISMISS_GUARD_MS = 450;

export function overlayDismissAllowedAt(openedAtMs, nowMs, delayMs = OVERLAY_DISMISS_GUARD_MS) {
  if (!Number.isFinite(openedAtMs) || !Number.isFinite(nowMs)) return false;
  return nowMs - openedAtMs >= delayMs;
}
