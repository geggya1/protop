/** Floating chat frame: top near the header, not mid-screen. */
export const CHAT_WINDOW_TOP = '12%';
/** Default gap above the viewport bottom on desktop dock panels. */
export const CHAT_WINDOW_BOTTOM = 16;

/**
 * Bottom inset for the mobile chat drawer so it pops above the bottom nav / FAB
 * instead of sitting flush with (or past) the screen edge.
 */
export function chatDrawerBottomInset(extraBottom = 0) {
  return Math.max(CHAT_WINDOW_BOTTOM, Math.round(Number(extraBottom) || 0) + 8);
}
